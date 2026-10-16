import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { emailQueue } from '../services/queue';
import { getOrCreateSender } from '../services/mailer';
import { EmailJobData } from '../workers/emailWorker';

const prisma = new PrismaClient();

const SEED_JOB_COUNT = 15;
const STAGGER_MS = 10_000;
const MIN_DELAY_MS = 5_000;

const SEED_USER_EMAIL = 'seed.user@reachinbox.test';
const SEED_GOOGLE_ID = 'seed-google-id-001';

// Seeds a test user, an Ethereal sender, and 15 staggered email jobs.
// Run: npm run seed
async function main(): Promise<void> {
  console.log('[Seed] Starting...');

  const user = await prisma.user.upsert({
    where: { email: SEED_USER_EMAIL },
    update: { name: 'Seed User' },
    create: {
      googleId: SEED_GOOGLE_ID,
      email: SEED_USER_EMAIL,
      name: 'Seed User',
    },
  });
  console.log(`[Seed] User ${user.email} (${user.id})`);

  const sender = await getOrCreateSender(user.id);
  console.log(`[Seed] Sender ${sender.etherealEmail} (${sender.id})`);

  const baseTime = new Date(Date.now() + 60_000);
  const batch = await prisma.emailBatch.create({
    data: {
      userId: user.id,
      senderId: sender.id,
      subject: 'ReachInbox Seed — Hello {{name}}',
      body: '<p>Hello {{name}}, this is a seeded test email from ReachInbox.</p>',
      scheduledAt: baseTime,
      status: 'pending',
    },
  });
  console.log(`[Seed] Batch ${batch.id}`);

  for (let i = 0; i < SEED_JOB_COUNT; i++) {
    const scheduledAt = new Date(baseTime.getTime() + i * STAGGER_MS);
    const recipientEmail = `lead${String(i + 1).padStart(2, '0')}@example.com`;
    const recipientName = `Seed Lead ${i + 1}`;

    const emailJob = await prisma.emailJob.create({
      data: {
        batchId: batch.id,
        recipientEmail,
        recipientName,
        status: 'pending',
        scheduledAt,
      },
    });

    const delay = Math.max(scheduledAt.getTime() - Date.now(), MIN_DELAY_MS);

    const jobData: EmailJobData = {
      emailJobId: emailJob.id,
      batchId: batch.id,
      userId: user.id,
      senderId: sender.id,
      recipientEmail,
      recipientName,
      subject: batch.subject,
      body: batch.body,
    };

    await emailQueue.add('send-email', jobData, {
      jobId: `email_${emailJob.id}`,
      delay,
    });

    console.log(`[Seed] (${i + 1}/${SEED_JOB_COUNT}) email_${emailJob.id} -> ${recipientEmail}`);
  }

  console.log(`[Seed] Done: batch ${batch.id}, ${SEED_JOB_COUNT} jobs`);
  console.log('[Seed] Queue: http://localhost:4000/api/admin/queues');
}

main()
  .catch((err: Error) => {
    console.error('[Seed] Failed:', err);
    process.exitCode = 1;
  })
  .finally(() => {
    void (async () => {
      await prisma.$disconnect();
      const { redis } = await import('../services/queue');
      redis.disconnect();
    })();
  });
