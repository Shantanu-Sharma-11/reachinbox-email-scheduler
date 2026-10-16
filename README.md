# ReachInbox Email Scheduler

A full-stack email scheduling system built with Node.js, Express, BullMQ, Redis, MySQL, Elasticsearch, and Next.js.

## Overview & Architecture Decisions

- **BullMQ Delayed Jobs:** Replaces cron polling. All email sends are scheduled as delayed jobs with calculated execution offsets.
- **Rate Limiting:** Implements atomic hourly Redis rate-limiting (`INCR` + `EXPIRE`). Over-limit jobs are rescheduled to the next hour window using `moveToDelayed()`.
- **Idempotency:** Uses deterministic job IDs (`email_${id}`) and MySQL status checks to guarantee safety against duplicate sends upon worker restarts.
- **Search:** Dispatched email jobs are indexed into Elasticsearch for fast multi-field search across recipients, subjects, and bodies.

## Tech Stack

- **Backend:** Node.js 20, Express, TypeScript, Prisma ORM, BullMQ, ioredis, Nodemailer
- **Frontend:** Next.js 14 (App Router), Tailwind CSS, Lucide Icons
- **Infrastructure:** MySQL 8, Redis 7 (AOF persistence), Elasticsearch 8.11 (Docker Compose)

## Getting Started

1. **Start Infrastructure Services:**

   ```bash
   docker compose up -d
   ```

   This starts MySQL (`localhost:3307`), Redis (`localhost:6379`), and Elasticsearch (`localhost:9200`).

2. **Set Up the Backend:**

   ```bash
   cd backend
   cp .env.example .env
   npm install
   npx prisma db push
   npm run dev
   ```

   The API runs on `http://localhost:4000`. Required OAuth credentials (`GOOGLE_*`, `SLACK_*`) go in `backend/.env`.

3. **Set Up the Frontend:**

   ```bash
   cd frontend
   npm install
   npm run dev
   ```

   The app runs on `http://localhost:3000`.

## API Reference

| Method | Path                    | Description                              |
| ------ | ----------------------- | ---------------------------------------- |
| GET    | `/auth/google`          | Start Google OAuth flow                  |
| GET    | `/auth/google/callback` | OAuth callback                           |
| GET    | `/auth/me`              | Current session user                     |
| GET    | `/auth/logout`          | End session                              |
| GET    | `/slack/connect`        | Start Slack OAuth flow                   |
| GET    | `/slack/callback`       | Slack OAuth callback                     |
| DELETE | `/slack/disconnect`     | Remove Slack integration                 |
| POST   | `/api/emails/schedule`  | Schedule a batch of emails               |
| GET    | `/api/emails/scheduled` | List pending emails                      |
| GET    | `/api/emails/sent`      | List sent emails                         |
| GET    | `/api/emails/search?q=` | Full-text search over sent emails        |
| GET    | `/api/senders`          | List provisioned SMTP senders            |
| GET    | `/api/admin/queues`     | Bull Board queue dashboard               |
| GET    | `/health`               | Health check                             |

## Useful Scripts

Run from `backend/`:

| Command                  | Description                                              |
| ------------------------ | -------------------------------------------------------- |
| `npm run seed`           | Seed a test user, sender, and 15 scheduled email jobs    |
| `npm run loadtest`       | Send 10 emails under a 3/hour limit to exercise rescheduling (run worker with `RATE_LIMIT_PER_HOUR=3`) |
| `npm run idempotency-test` | Verify a redelivered job is skipped without duplicate sends |

## Project Structure

```text
reachinbox-scheduler/
├── docker-compose.yml
├── backend/
│   ├── prisma/schema.prisma
│   └── src/
│       ├── config/      # Passport setup
│       ├── routes/      # auth, emails, senders, slack
│       ├── services/    # queue, mailer, elastic, slack, board
│       ├── workers/     # email worker (rate limit, send, index)
│       ├── scripts/     # seed, loadTest, idempotencyTest
│       └── index.ts
└── frontend/
    ├── app/             # login, dashboard (scheduled, sent, compose, settings)
    └── lib/             # api client, auth context
```

## Environment Variables

Backend (`backend/.env`):

```env
DATABASE_URL=mysql://root:root@localhost:3307/reachinbox
REDIS_HOST=localhost
REDIS_PORT=6379
ELASTICSEARCH_URL=http://localhost:9200
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_CALLBACK_URL=http://localhost:4000/auth/google/callback
SLACK_CLIENT_ID=
SLACK_CLIENT_SECRET=
SLACK_REDIRECT_URI=http://localhost:4000/slack/callback
SESSION_SECRET=
RATE_LIMIT_PER_HOUR=10
PORT=4000
NODE_ENV=development
FRONTEND_URL=http://localhost:3000
```
