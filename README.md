# ReachInbox Email Scheduler

A full-stack email scheduling system. Users compose an email, add recipients (manually or via CSV upload),
pick a send time, and the backend delivers each email as a BullMQ delayed job — with per-sender hourly
rate limiting, idempotent crash-safe workers, Elasticsearch search, and Slack rate-limit alerts.

## 1. Project Overview & Features

**High-level summary.** The frontend (Next.js) handles login, composing, and browsing scheduled/sent mail.
The backend (Express) persists batches and jobs in MySQL via Prisma, enqueues one delayed BullMQ job per
recipient in Redis, and a background worker sends each email through an auto-provisioned Ethereal SMTP
sender, indexes the result in Elasticsearch, and enforces hourly send quotas. No cron jobs are used anywhere —
scheduling is purely BullMQ delayed jobs backed by Redis AOF persistence.

**Key features.**

- Google OAuth 2.0 login with Redis-backed sessions (`/auth/*`)
- Compose screen with recipient pill input, CSV lead import, and Send Later scheduling
- Scheduled list (orange clock badge) and Sent list (gray badge) with reader pane
- BullMQ delayed jobs with deterministic IDs (`email_${id}`)
- Background worker: idempotency guard, atomic Redis hourly rate limiting, `moveToDelayed()` rescheduling
- Slack OAuth v2 connect + one-alert-per-hour rate-limit notifications (`SET NX` lock)
- Elasticsearch indexing and full-text search over subject, body, and recipient name
- Bull Board queue dashboard at `/api/admin/queues`
- Dev scripts: `seed`, `loadtest`, `idempotency-test`

## 2. Tech Stack

| Layer        | Technology                                                        |
| ------------ | ----------------------------------------------------------------- |
| Language     | TypeScript                                                        |
| Backend      | Node.js 20, Express 4, Prisma ORM (MySQL provider)                |
| Queue        | BullMQ 5, ioredis 5, Redis 7 (AOF persistence)                    |
| Search       | `@elastic/elasticsearch` 8 → Elasticsearch 8.11                   |
| Email        | Nodemailer (auto-provisioned Ethereal SMTP test accounts)         |
| Auth         | `passport` + `passport-google-oauth20`, `express-session` + Redis store |
| Alerts       | Slack OAuth v2 + Web API (`@slack/oauth`, `@slack/web-api`)       |
| Admin UI     | `@bull-board/express`                                             |
| Frontend     | Next.js 14 (App Router), React 18, Tailwind CSS, `lucide-react`, `axios` |
| Infra        | Docker Compose: MySQL 8, Redis 7, Elasticsearch 8.11 (single-node) |

## 3. Project Architecture & Directory Structure

```text
reachinbox-scheduler/
├── docker-compose.yml      # MySQL 8 (:3307), Redis 7 AOF (:6379), Elasticsearch 8.11 (:9200)
├── backend/
│   ├── prisma/
│   │   └── schema.prisma   # User, Sender, EmailBatch, EmailJob models
│   ├── src/
│   │   ├── index.ts        # Express app, sessions, route mounting, worker bootstrap
│   │   ├── config/         # Passport Google strategy
│   │   ├── routes/         # auth, emails, senders, slack endpoints
│   │   ├── services/       # queue (BullMQ+Redis), mailer, elastic, slack, board
│   │   ├── workers/        # email worker: idempotency, rate limit, send, index
│   │   └── scripts/        # seed, loadTest, idempotencyTest
│   ├── .env.example
│   └── package.json
└── frontend/
    ├── app/                # login, dashboard layout, scheduled, sent, compose, settings
    ├── lib/                # axios api client, auth context
    └── package.json
```

**Directory responsibilities.**

- `backend/src/routes/` — HTTP surface: Google OAuth, Slack OAuth, schedule/list/search emails, list senders.
- `backend/src/services/` — shared infrastructure clients: BullMQ queue + Redis, Ethereal mailer, Elasticsearch, Slack alerts, Bull Board.
- `backend/src/workers/` — the background email processor (rate-limit counter, `moveToDelayed`, SMTP send, ES index).
- `backend/src/scripts/` — local verification tools (`npm run seed/loadtest/idempotency-test`).
- `backend/prisma/` — data model: one `EmailBatch` (compose action) → many `EmailJob`s (one recipient each).
- `frontend/app/` — App Router pages; `frontend/lib/` — typed API client and auth state.

## 4. Prerequisites & Environment Setup

**Prerequisites.**

- Node.js v20+ and npm
- Docker Desktop (for MySQL, Redis, Elasticsearch)
- Git

**Environment variables — backend (`backend/.env`).** Copy from `backend/.env.example`:

```env
# Database (host port 3307 maps to container 3306 — see docker-compose.yml)
DATABASE_URL="mysql://root:root@localhost:3307/reachinbox"

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# Elasticsearch
ELASTICSEARCH_URL=http://localhost:9200

# Google OAuth 2.0 — from https://console.cloud.google.com/apis/credentials
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_CALLBACK_URL=http://localhost:4000/auth/google/callback

# Slack OAuth v2 — from https://api.slack.com/apps
SLACK_CLIENT_ID=your_slack_client_id
SLACK_CLIENT_SECRET=your_slack_client_secret
SLACK_REDIRECT_URI=http://localhost:4000/slack/callback

# Sessions (use a long random string)
SESSION_SECRET=change-me-in-production

# Rate limiting: max emails per sender per hour
RATE_LIMIT_PER_HOUR=10

# App
PORT=4000
NODE_ENV=development
FRONTEND_URL=http://localhost:3000
```

> The app boots without Google/Slack credentials, but login and Slack connect will not work until they are
> set. For API testing without OAuth, send the `X-Dev-User-Id: <userId>` header (development only).

**Environment variables — frontend (`frontend/.env.local`).** No example file ships; create one:

```env
# Backend API base URL consumed by lib/api.ts and the login page
NEXT_PUBLIC_API_URL=http://localhost:4000
```

If omitted, the frontend defaults to `http://localhost:4000`.

## 5. Step-by-Step Quick Start Guide (Local Setup)

**Step 1: Clone the repository and install dependencies.**

```bash
git clone <repo-url> reachinbox-scheduler
cd reachinbox-scheduler
cd backend && npm install
cd ../frontend && npm install
```

```powershell
git clone <repo-url> reachinbox-scheduler
cd reachinbox-scheduler
cd backend; npm install
cd ..\frontend; npm install
```

**Step 2: Configure environment variables.**

```bash
cd backend
cp .env.example .env   # then fill in GOOGLE_*, SLACK_*, SESSION_SECRET
```

```powershell
cd backend
Copy-Item .env.example .env   # then fill in GOOGLE_*, SLACK_*, SESSION_SECRET
```

Create `frontend/.env.local` with `NEXT_PUBLIC_API_URL=http://localhost:4000` (see template above).
Make sure `DATABASE_URL` uses port **3307** to match `docker-compose.yml`.

**Step 3: Start infrastructure using Docker Compose.**

```bash
docker compose up -d
docker compose ps
```

Wait until all three containers report healthy (`mysql`, `redis`, `elasticsearch`).

**Step 4: Run database migrations and sync schema.**

```bash
cd backend
npx prisma db push
npx prisma generate
```

**Step 5: Start the local development servers.**

Terminal 1 — backend (API + worker):

```bash
cd backend
npm run dev
```

Terminal 2 — frontend:

```bash
cd frontend
npm run dev
```

Optional — load test data:

```bash
cd backend
npm run seed                # test user + sender + 15 scheduled jobs
npm run idempotency-test    # verify crash-safe duplicate prevention
RATE_LIMIT_PER_HOUR=3 npm run loadtest   # exercise rate-limit rescheduling
```

## 6. Service Endpoints & Verification

| Service              | URL                                          | Expected result                          |
| -------------------- | -------------------------------------------- | ---------------------------------------- |
| Frontend UI          | `http://localhost:3000`                      | Login page (Google button)               |
| Backend API          | `http://localhost:4000`                      | — (use `/health` below)                  |
| Health check         | `http://localhost:4000/health`               | `{"status":"ok",...}`                    |
| Queue Dashboard      | `http://localhost:4000/api/admin/queues`     | Bull Board with `email-queue`            |
| Elasticsearch        | `http://localhost:9200`                      | Cluster info JSON                        |
| Current user         | `http://localhost:4000/auth/me`              | User JSON when logged in                 |

Quick smoke test after `npm run seed`: open Bull Board and confirm 15 delayed jobs sit in
`email-queue`; open `http://localhost:3000`, log in, and check the Scheduled list.

## 7. Troubleshooting & Common Pitfalls

- **Containers not healthy:** run `docker compose ps` and `docker compose logs <mysql|redis|elasticsearch>`.
  Elasticsearch takes 30–60s on first boot; the backend logs `[Startup] Elasticsearch init skipped` and
  continues if ES is not up yet — just restart the backend once ES is green/yellow.
- **MySQL connection refused:** confirm you use host port **3307** in `DATABASE_URL`
  (`mysql://root:root@localhost:3307/reachinbox`). Port 3306 inside the container maps to 3307 on the host.
  A local MySQL on 3306 is exactly why the repo remaps it.
- **Fresh database state:** `cd backend && npx prisma db push` re-syncs the schema
  (`users`, `senders`, `email_batches`, `email_jobs`). For a full reset: `docker compose down -v`
  (deletes volumes), `docker compose up -d`, then `prisma db push` again.
- **Google login loops or `oauth_failed`:** `GOOGLE_CLIENT_ID/SECRET/CALLBACK_URL` must match the Google
  Cloud console entry exactly, including the `/auth/google/callback` path and port 4000.
- **Slack connect fails:** same check for `SLACK_CLIENT_ID/SECRET/REDIRECT_URI` against your Slack app config.
  Rate-limit alerts silently no-op until Slack is connected — this is by design, not an error.
- **Login page works but API returns 401:** sessions live in Redis — verify the `redis` container is up and
  `REDIS_HOST/REDIS_PORT` are correct. Alternatively use the dev bypass header `X-Dev-User-Id: <userId>`.
- **Port already in use:** `3000` (frontend), `4000` (backend), `6379` (Redis), `9200` (ES), `3307` (MySQL).
  Stop the conflicting process or adjust the mapping in `docker-compose.yml` (and `.env` to match).
- **Type errors after edits:** `cd backend && npx tsc --noEmit` and `cd frontend && npx tsc --noEmit`
  should both exit clean.
