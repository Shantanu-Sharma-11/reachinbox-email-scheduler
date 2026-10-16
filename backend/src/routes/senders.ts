import { Router, Request, Response } from 'express';
import { PrismaClient, User } from '@prisma/client';
import { requireAuth } from './auth';

const router = Router();
const prisma = new PrismaClient();

// Lists the user's Ethereal senders (passwords excluded).
router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as User).id;

    const senders = await prisma.sender.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        etherealEmail: true,
        host: true,
        port: true,
        createdAt: true,
      },
    });

    res.json({ senders });
  } catch (err) {
    console.error('[Senders] GET / failed:', err);
    res.status(500).json({ error: 'Failed to fetch senders.' });
  }
});

export default router;
