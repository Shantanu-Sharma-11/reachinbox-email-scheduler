import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import session from 'express-session';
import RedisStore from 'connect-redis';
import { createClient } from 'redis';

import './config/passport';
import passport from 'passport';
import authRouter from './routes/auth';
import slackRouter from './routes/slack';
import emailsRouter from './routes/emails';
import sendersRouter from './routes/senders';
import { bullBoardRouter } from './services/board';
import { initElasticsearch } from './services/elastic';
import { startEmailWorker } from './workers/emailWorker';
import { PrismaClient } from '@prisma/client';

declare module 'express-session' {
  interface SessionData {
    passport: { user: string };
  }
}

const app = express();
const PORT = process.env.PORT ?? 4000;
const prisma = new PrismaClient();

// Redis-backed session store (separate client from the BullMQ connection).
const redisSessionClient = createClient({
  socket: {
    host: process.env.REDIS_HOST ?? 'localhost',
    port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
  },
});
redisSessionClient.connect().catch((err: Error) =>
  console.error('[Session] Redis connection error:', err)
);

const sessionStore = new RedisStore({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: redisSessionClient as any,
  prefix: 'sess:',
});

app.use(
  cors({
    origin: process.env.FRONTEND_URL ?? 'http://localhost:3000',
    credentials: true,
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.use(
  session({
    store: sessionStore,
    secret: process.env.SESSION_SECRET ?? 'change-me-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
  })
);

app.use(passport.initialize());
app.use(passport.session());

// Local testing helper (non-production only): impersonate a user via
// the X-Dev-User-Id header instead of going through Google OAuth.
if (process.env.NODE_ENV !== 'production') {
  app.use(async (req: Request, _res: Response, next: NextFunction) => {
    const devUserId = req.headers['x-dev-user-id'] as string | undefined;
    if (devUserId && !req.isAuthenticated()) {
      try {
        const user = await prisma.user.findUnique({ where: { id: devUserId } });
        if (user) {
          (req as Request & { user: Express.User }).user = user as unknown as Express.User;
          const originalIsAuth = req.isAuthenticated.bind(req);
          req.isAuthenticated = function <T>(this: T): this is T & { user: Express.User } {
            return true || originalIsAuth();
          };
        }
      } catch {
        // ignore lookup failures and continue unauthenticated
      }
    }
    next();
  });
}

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/auth', authRouter);
app.use('/slack', slackRouter);
app.use('/api/emails', emailsRouter);
app.use('/api/senders', sendersRouter);
app.use('/api/admin/queues', bullBoardRouter);

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[Server] Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error', message: err.message });
});

async function bootstrap(): Promise<void> {
  await initElasticsearch().catch((err: Error) => {
    console.warn('[Startup] Elasticsearch init skipped:', err.message);
  });

  startEmailWorker();

  app.listen(PORT, () => {
    console.log(`[Server] Listening on http://localhost:${PORT}`);
    console.log(`[Server] Bull Board: http://localhost:${PORT}/api/admin/queues`);
  });
}

bootstrap();

export default app;
