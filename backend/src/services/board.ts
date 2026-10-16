import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { Router } from 'express';
import { emailQueue } from './queue';

const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath('/api/admin/queues');

// BullMQ v5 / bull-board v5 disagree on the JobProgress type; the cast is runtime-neutral.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const adapter = new BullMQAdapter(emailQueue) as any;

createBullBoard({
  queues: [adapter],
  serverAdapter,
});

// Mount at /api/admin/queues.
export const bullBoardRouter: Router = serverAdapter.getRouter() as Router;
