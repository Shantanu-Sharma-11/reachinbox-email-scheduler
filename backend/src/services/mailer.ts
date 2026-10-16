import nodemailer from 'nodemailer';
import { PrismaClient, Sender } from '@prisma/client';

const prisma = new PrismaClient();

export interface SendEmailOptions {
  sender: Sender;
  to: string;
  subject: string;
  body: string;
}

export interface SendEmailResult {
  messageId: string;
  previewUrl: string;
}

// Returns the user's first sender, provisioning an Ethereal account if needed.
export async function getOrCreateSender(userId: string): Promise<Sender> {
  const existing = await prisma.sender.findFirst({
    where: { userId },
    orderBy: { createdAt: 'asc' },
  });

  if (existing) {
    return existing;
  }

  const testAccount = await nodemailer.createTestAccount();

  const sender = await prisma.sender.create({
    data: {
      userId,
      etherealEmail: testAccount.user,
      etherealPassword: testAccount.pass,
      host: testAccount.smtp.host,
      port: testAccount.smtp.port,
    },
  });

  console.log(`[Mailer] Provisioned sender ${testAccount.user} for user ${userId}`);
  return sender;
}

export async function sendEmail(options: SendEmailOptions): Promise<SendEmailResult> {
  const { sender, to, subject, body } = options;

  const transporter = nodemailer.createTransport({
    host: sender.host,
    port: sender.port,
    secure: false,
    auth: {
      user: sender.etherealEmail,
      pass: sender.etherealPassword,
    },
  });

  const info = await transporter.sendMail({
    from: `"ReachInbox" <${sender.etherealEmail}>`,
    to,
    subject,
    html: body,
    text: body.replace(/<[^>]+>/g, ''),
  });

  const previewUrl = nodemailer.getTestMessageUrl(info) || '';

  console.log(`[Mailer] Sent to ${to} (messageId: ${info.messageId})`);

  return {
    messageId: info.messageId,
    previewUrl: typeof previewUrl === 'string' ? previewUrl : '',
  };
}
