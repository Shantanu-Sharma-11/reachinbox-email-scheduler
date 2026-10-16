import { Router, Request, Response } from 'express';
import { PrismaClient, User } from '@prisma/client';
import { emailQueue } from '../services/queue';
import { getOrCreateSender } from '../services/mailer';
import { searchEmails } from '../services/elastic';
import { requireAuth } from './auth';
import { EmailJobData } from '../workers/emailWorker';

const router = Router();
const prisma = new PrismaClient();

router.post('/schedule', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.user as User;

    const { subject, body, recipients, scheduledAt, senderId: requestedSenderId } = req.body as {
      subject: string;
      body: string;
      recipients: Array<{ email: string; name: string }>;
      scheduledAt: string;
      senderId?: string;
    };

    if (!subject || !body || !Array.isArray(recipients) || recipients.length === 0 || !scheduledAt) {
      res.status(400).json({ error: 'subject, body, recipients[], and scheduledAt are required.' });
      return;
    }

    const scheduledAtDate = new Date(scheduledAt);
    if (isNaN(scheduledAtDate.getTime())) {
      res.status(400).json({ error: 'scheduledAt must be a valid ISO 8601 date.' });
      return;
    }

    let senderId: string;
    if (requestedSenderId) {
      const owned = await prisma.sender.findFirst({
        where: { id: requestedSenderId, userId: user.id },
      });
      if (!owned) {
        res.status(403).json({ error: 'Sender not found or does not belong to you.' });
        return;
      }
      senderId = requestedSenderId;
    } else {
      const sender = await getOrCreateSender(user.id);
      senderId = sender.id;
    }

    const batch = await prisma.emailBatch.create({
      data: {
        userId: user.id,
        senderId,
        subject,
        body,
        scheduledAt: scheduledAtDate,
        status: 'pending',
      },
    });

    await prisma.emailJob.createMany({
      data: recipients.map((r) => ({
        batchId: batch.id,
        recipientEmail: r.email,
        recipientName: r.name,
        status: 'pending',
        scheduledAt: scheduledAtDate,
      })),
    });

    const jobs = await prisma.emailJob.findMany({
      where: { batchId: batch.id },
    });

    const nowMs = Date.now();
    const scheduledMs = scheduledAtDate.getTime();
    // Minimum 5s delay to avoid a thundering herd on near-instant sends.
    const delay = Math.max(scheduledMs - nowMs, 5_000);

    const sender = await prisma.sender.findUnique({ where: { id: senderId } });
    if (!sender) {
      res.status(500).json({ error: 'Sender record disappeared — cannot enqueue.' });
      return;
    }

    for (const job of jobs) {
      const jobData: EmailJobData = {
        emailJobId: job.id,
        batchId: batch.id,
        userId: user.id,
        senderId: senderId,
        recipientEmail: job.recipientEmail,
        recipientName: job.recipientName,
        subject,
        body,
      };

      await emailQueue.add('send-email', jobData, {
        jobId: `email_${job.id}`,
        delay,
      });
    }

    console.log(`[Emails] Scheduled batch ${batch.id}: ${jobs.length} job(s), delay ${delay}ms`);

    res.status(201).json({
      success: true,
      batchId: batch.id,
      totalJobs: jobs.length,
      scheduledAt: scheduledAtDate.toISOString(),
      delayMs: delay,
    });
  } catch (err) {
    console.error('[Emails] POST /schedule failed:', err);
    res.status(500).json({ error: 'Failed to schedule emails.' });
  }
});

router.get('/scheduled', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as User).id;

    const jobs = await prisma.emailJob.findMany({
      where: {
        status: 'pending',
        batch: { userId },
      },
      include: {
        batch: {
          select: { id: true, subject: true, scheduledAt: true, senderId: true },
        },
      },
      orderBy: { scheduledAt: 'asc' },
    });

    res.json({ jobs });
  } catch (err) {
    console.error('[Emails] GET /scheduled failed:', err);
    res.status(500).json({ error: 'Failed to fetch scheduled emails.' });
  }
});

router.get('/sent', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as User).id;

    const jobs = await prisma.emailJob.findMany({
      where: {
        status: 'sent',
        batch: { userId },
      },
      include: {
        batch: {
          select: { id: true, subject: true, scheduledAt: true, senderId: true },
        },
      },
      orderBy: { sentAt: 'desc' },
    });

    res.json({ jobs });
  } catch (err) {
    console.error('[Emails] GET /sent failed:', err);
    res.status(500).json({ error: 'Failed to fetch sent emails.' });
  }
});

router.get('/search', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as User).id;
    const q = (req.query['q'] as string | undefined)?.trim();

    if (!q) {
      res.status(400).json({ error: 'Query parameter `q` is required.' });
      return;
    }

    const results = await searchEmails(userId, q);
    res.json({ results, total: results.length });
  } catch (err) {
    console.error('[Emails] GET /search failed:', err);
    res.status(500).json({ error: 'Search failed.' });
  }
});

export default router;
