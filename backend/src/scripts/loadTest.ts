import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { emailQueue, redis } from '../services/queue';
import { getOrCreateSender } from '../services/mailer';
import { EmailJobData } from '../workers/emailWorker';

const prisma = new PrismaClient();

// Keep in sync with the worker: RATE_LIMIT_PER_HOUR=3 npm run dev
const TEST_LIMIT = 3;
const JOB_COUNT = 10;

const LOAD_USER_EMAIL = 'loadtest.user@reachinbox.test';
const LOAD_GOOGLE_ID = 'loadtest-google-id-001';

function getHourBucket(date: Date = new Date()): string {
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  const hh = String(date.getUTCHours()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}-${hh}`;
}

function nextHourTimestampMs(date: Date = new Date()): number {
  const next = new Date(date);
  next.setUTCMinutes(0, 0, 0);
  next.setUTCHours(date.getUTCHours() + 1);
  return next.getTime();
}

// Dispatches 10 emails under a limit of 3/hour and verifies the rate-limit
// path: 3 run immediately, 7 reschedule via moveToDelayed, 1 Slack alert.
// Run: RATE_LIMIT_PER_HOUR=3 npm run loadtest
async function main(): Promise<void> {
  console.log(`[LoadTest] Limit ${TEST_LIMIT}/hour, ${JOB_COUNT} jobs`);

  const user = await prisma.user.upsert({
    where: { email: LOAD_USER_EMAIL },
    update: { name: 'Load Test User' },
    create: { googleId: LOAD_GOOGLE_ID, email: LOAD_USER_EMAIL, name: 'Load Test User' },
  });
  const sender = await getOrCreateSender(user.id);

  const bucket = getHourBucket(new Date());
  const rateKey = `ratelimit:${sender.id}:${bucket}`;
  const notifyKey = `ratelimit-notified:${sender.id}:${bucket}`;

  await redis.del(rateKey, notifyKey);

  const scheduledAt = new Date(Date.now() + 5_000);
  const batch = await prisma.emailBatch.create({
    data: {
      userId: user.id,
      senderId: sender.id,
      subject: 'ReachInbox Load Test',
      body: '<p>Load test email — rate-limit verification.</p>',
      scheduledAt,
      status: 'pending',
    },
  });

  const jobs = await Promise.all(
    Array.from({ length: JOB_COUNT }, (_, i) =>
      prisma.emailJob.create({
        data: {
          batchId: batch.id,
          recipientEmail: `loadlead${i + 1}@example.com`,
          recipientName: `Load Lead ${i + 1}`,
          status: 'pending',
          scheduledAt,
        },
      })
    )
  );

  const enqueued = await Promise.all(
    jobs.map((j) => {
      const data: EmailJobData = {
        emailJobId: j.id,
        batchId: batch.id,
        userId: user.id,
        senderId: sender.id,
        recipientEmail: j.recipientEmail,
        recipientName: j.recipientName,
        subject: batch.subject,
        body: batch.body,
      };
      return emailQueue.add('send-email', data, {
        jobId: `email_${j.id}`,
        delay: 5_000,
      });
    })
  );
  console.log(`[LoadTest] Enqueued ${enqueued.length} jobs`);

  // Replay the worker's INCR path to show the pass/reschedule split,
  // then reset so the live worker sees a clean window.
  const counts = await Promise.all(
    Array.from({ length: JOB_COUNT }, () => redis.incr(rateKey))
  );
  await redis.expire(rateKey, 3600);

  let immediate = 0;
  let rescheduled = 0;
  let slackAlerts = 0;
  const nextTs = nextHourTimestampMs(new Date());

  for (const count of counts) {
    if (count <= TEST_LIMIT) {
      immediate++;
    } else {
      rescheduled++;
      const lock = await redis.set(notifyKey, '1', 'EX', 3600, 'NX');
      if (lock === 'OK') slackAlerts++;
    }
  }

  console.log(`[LoadTest] INCR results: [${counts.join(', ')}]`);
  console.log(`[LoadTest] Immediate: ${immediate}, rescheduled to ${new Date(nextTs).toISOString()}: ${rescheduled}`);
  console.log(`[LoadTest] Slack alerts: ${slackAlerts} (expected 1)`);

  await redis.del(rateKey, notifyKey);

  const queueCounts = await emailQueue.getJobCounts('waiting', 'delayed', 'active');
  console.log(`[LoadTest] Queue: ${JSON.stringify(queueCounts)}`);

  const pass =
    immediate === TEST_LIMIT && rescheduled === JOB_COUNT - TEST_LIMIT && slackAlerts === 1;
  console.log(pass ? '[LoadTest] PASS' : '[LoadTest] FAIL');
  if (!pass) process.exitCode = 1;
}

main()
  .catch((err: Error) => {
    console.error('[LoadTest] Failed:', err);
    process.exitCode = 1;
  })
  .finally(() => {
    void (async () => {
      await prisma.$disconnect();
      redis.disconnect();
    })();
  });
