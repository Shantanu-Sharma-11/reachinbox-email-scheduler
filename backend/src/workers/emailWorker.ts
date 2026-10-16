import { Worker, Job } from 'bullmq';
import { PrismaClient } from '@prisma/client';
import { redis, emailQueue } from '../services/queue';
import { sendEmail } from '../services/mailer';
import { indexEmailJob } from '../services/elastic';
import { sendSlackAlert } from '../services/slack';

const prisma = new PrismaClient();

const RATE_LIMIT_PER_HOUR = parseInt(process.env.RATE_LIMIT_PER_HOUR ?? '10', 10);

export interface EmailJobData {
  emailJobId: string;
  batchId: string;
  userId: string;
  senderId: string;
  recipientEmail: string;
  recipientName: string;
  subject: string;
  body: string;
}

// Hour bucket in UTC, e.g. "2026-10-16-14".
function getHourBucket(date: Date = new Date()): string {
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  const hh = String(date.getUTCHours()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}-${hh}`;
}

// Start of the next UTC hour, in ms.
function nextHourTimestampMs(date: Date = new Date()): number {
  const next = new Date(date);
  next.setUTCMinutes(0, 0, 0);
  next.setUTCHours(date.getUTCHours() + 1);
  return next.getTime();
}

// Exported so the idempotency script can re-invoke the production handler.
export async function processEmailJob(job: Job<EmailJobData>, token?: string): Promise<void> {
  const { emailJobId, batchId, userId, senderId, recipientEmail, recipientName, subject, body } =
    job.data;

  console.log(`[Worker] Processing job ${job.id} (emailJobId: ${emailJobId})`);

  // Skip jobs that were already sent (e.g. redelivered after a restart).
  const emailJob = await prisma.emailJob.findUnique({ where: { id: emailJobId } });

  if (!emailJob) {
    console.warn(`[Worker] EmailJob ${emailJobId} not found, discarding job ${job.id}`);
    return;
  }

  if (emailJob.status === 'sent') {
    console.log(`[Worker] EmailJob ${emailJobId} already sent, skipping job ${job.id}`);
    return;
  }

  // Hourly rate limit via atomic Redis counter.
  const now = new Date();
  const hourBucket = getHourBucket(now);
  const rateKey = `ratelimit:${senderId}:${hourBucket}`;

  const count = await redis.incr(rateKey);
  if (count === 1) {
    await redis.expire(rateKey, 3600);
  }

  // Over the limit: reschedule into the next hour instead of failing.
  if (count > RATE_LIMIT_PER_HOUR) {
    const nextTs = nextHourTimestampMs(now);
    console.log(
      `[Worker] Rate limit hit for sender ${senderId} (${count}/${RATE_LIMIT_PER_HOUR}), ` +
        `rescheduling job ${job.id} to ${new Date(nextTs).toISOString()}`
    );

    // Notify Slack once per sender per hour.
    const notifyKey = `ratelimit-notified:${senderId}:${hourBucket}`;
    const lockAcquired = await redis.set(notifyKey, '1', 'EX', 3600, 'NX');

    if (lockAcquired === 'OK') {
      const alertMsg =
        `Sender \`${senderId}\` hit the rate limit of ${RATE_LIMIT_PER_HOUR} emails/hour ` +
        `for ${hourBucket} UTC. Remaining jobs are being rescheduled to the next hour.`;

      void sendSlackAlert(userId, alertMsg);
    }

    await redis.decr(rateKey);

    if (token) {
      await job.moveToDelayed(nextTs, token);
    }
    return;
  }

  const sender = await prisma.sender.findUnique({ where: { id: senderId } });

  if (!sender) {
    throw new Error(`Sender ${senderId} not found`);
  }

  let messageId: string;
  let previewUrl: string;

  try {
    const result = await sendEmail({ sender, to: recipientEmail, subject, body });
    messageId = result.messageId;
    previewUrl = result.previewUrl;
  } catch (sendErr) {
    const errorMessage = sendErr instanceof Error ? sendErr.message : String(sendErr);
    console.error(`[Worker] Send failed for job ${job.id}:`, errorMessage);

    await prisma.emailJob.update({
      where: { id: emailJobId },
      data: { status: 'failed', errorMessage },
    });

    throw sendErr;
  }

  await prisma.emailJob.update({
    where: { id: emailJobId },
    data: {
      status: 'sent',
      sentAt: new Date(),
      messageId,
    },
  });

  try {
    await indexEmailJob({
      jobId: emailJobId,
      batchId,
      userId,
      recipientEmail,
      recipientName,
      subject,
      body,
      sentAt: new Date().toISOString(),
      messageId,
      previewUrl,
    });
  } catch (esErr) {
    console.error(`[Worker] Elasticsearch index failed for job ${emailJobId}:`, esErr);
  }

  console.log(`[Worker] Job ${job.id} sent (messageId: ${messageId})`);
}

export function startEmailWorker(): Worker<EmailJobData> {
  const worker = new Worker<EmailJobData>('email-queue', processEmailJob, {
    connection: redis,
    concurrency: 5,
  });

  worker.on('completed', (job) => {
    console.log(`[Worker] Job ${job.id} completed`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[Worker] Job ${job?.id} failed:`, err.message);
  });

  worker.on('error', (err) => {
    console.error('[Worker] Error:', err);
  });

  console.log('[Worker] Listening on email-queue');
  return worker;
}

if (require.main === module) {
  startEmailWorker();
}
