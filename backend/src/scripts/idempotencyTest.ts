import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { Job } from 'bullmq';
import { emailQueue, redis } from '../services/queue';
import { getOrCreateSender } from '../services/mailer';
import { EmailJobData, processEmailJob } from '../workers/emailWorker';

const prisma = new PrismaClient();

const IDEMPOTENCY_USER_EMAIL = 'idempotency.user@reachinbox.test';
const IDEMPOTENCY_GOOGLE_ID = 'idempotency-google-id-001';

// Simulates a worker restart: marks a job sent, then re-runs the handler for
// the same deterministic jobId and asserts it skips without resending.
// Run: npm run idempotency-test
async function main(): Promise<void> {
  console.log('[Idempotency] Starting...');

  const user = await prisma.user.upsert({
    where: { email: IDEMPOTENCY_USER_EMAIL },
    update: { name: 'Idempotency User' },
    create: {
      googleId: IDEMPOTENCY_GOOGLE_ID,
      email: IDEMPOTENCY_USER_EMAIL,
      name: 'Idempotency User',
    },
  });
  const sender = await getOrCreateSender(user.id);

  const scheduledAt = new Date();
  const batch = await prisma.emailBatch.create({
    data: {
      userId: user.id,
      senderId: sender.id,
      subject: 'ReachInbox Idempotency Probe',
      body: '<p>Idempotency probe — must only ever send once.</p>',
      scheduledAt,
      status: 'pending',
    },
  });

  const emailJob = await prisma.emailJob.create({
    data: {
      batchId: batch.id,
      recipientEmail: 'crash.probe@example.com',
      recipientName: 'Crash Probe',
      status: 'pending',
      scheduledAt,
    },
  });

  const deterministicJobId = `email_${emailJob.id}`;

  const jobData: EmailJobData = {
    emailJobId: emailJob.id,
    batchId: batch.id,
    userId: user.id,
    senderId: sender.id,
    recipientEmail: emailJob.recipientEmail,
    recipientName: emailJob.recipientName,
    subject: batch.subject,
    body: batch.body,
  };
  await emailQueue.add('send-email', jobData, { jobId: deterministicJobId, delay: 5_000 });

  // Pretend the first attempt sent just before a crash.
  const firstMessageId = 'idempotency-first-send-message-id';
  const firstSentAt = new Date();
  await prisma.emailJob.update({
    where: { id: emailJob.id },
    data: { status: 'sent', sentAt: firstSentAt, messageId: firstMessageId },
  });

  // Redeliver the same jobId through the production handler.
  const redeliveredJob = { id: deterministicJobId, data: jobData } as unknown as Job<EmailJobData>;

  let threw: Error | null = null;
  try {
    await processEmailJob(redeliveredJob, 'idempotency-test-token');
  } catch (err) {
    threw = err instanceof Error ? err : new Error(String(err));
  }

  const after = await prisma.emailJob.findUnique({ where: { id: emailJob.id } });

  const failures: string[] = [];
  if (threw) failures.push(`handler threw: ${threw.message}`);
  if (!after) failures.push('EmailJob row missing after re-run.');
  if (after && after.status !== 'sent') failures.push(`status is '${after.status}', expected 'sent'.`);
  if (after && after.messageId !== firstMessageId) failures.push('messageId changed (duplicate send).');
  if (after && after.sentAt?.getTime() !== firstSentAt.getTime()) {
    failures.push('sentAt changed (duplicate send).');
  }

  const queued = await emailQueue.getJob(deterministicJobId);
  if (queued) await queued.remove();

  if (failures.length === 0) {
    console.log('[Idempotency] PASS: redelivered job skipped, no duplicate send.');
  } else {
    console.error('[Idempotency] FAIL:');
    for (const f of failures) console.error(`[Idempotency] - ${f}`);
    process.exitCode = 1;
  }
}

main()
  .catch((err: Error) => {
    console.error('[Idempotency] Failed:', err);
    process.exitCode = 1;
  })
  .finally(() => {
    void (async () => {
      await prisma.$disconnect();
      redis.disconnect();
    })();
  });
