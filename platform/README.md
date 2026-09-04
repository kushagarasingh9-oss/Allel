# Allel Platform

The `platform/` package contains Allel's Next.js application, API routes, agent runtime, provider integrations, durable recovery worker, UI, and test suite.

Start with the repository [`README.md`](../README.md) for the full product walkthrough. Use [`../docs/ALLEL.md`](../docs/ALLEL.md) for the deeper technical architecture and [`../docs/README.md`](../docs/README.md) for documentation ownership.

## Stack

- Next.js 15.5 App Router and React 19.1
- TypeScript and Tailwind CSS 4
- Supabase Auth/PostgreSQL with SSR sessions and RLS
- AI SDK 6 with OpenAI-compatible and Azure OpenAI model providers
- Stripe, Gmail/Google Calendar, PostHog, Intercom, Resend, and Tavily SDK/API integrations
- Vercel deployment and cron configuration

## Local development

```bash
npm install
cp .env.example .env.local
npm run dev
```

The tracked `.env.example` is the environment template. Do not commit `.env.local` or provider credentials.

### Core environment

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
ENCRYPTION_KEY
AGENT_HISTORY_SIGNING_SECRET
OPENAI_API_KEY
NEXT_PUBLIC_APP_URL
```

Set `AGENT_HISTORY_SIGNING_SECRET` explicitly in production. Development can fall back to `OPENAI_API_KEY`, but production intentionally fails if the dedicated signing secret is absent.

### Models

```text
OPENAI_MODEL_ID
AGENT_MODEL_ID
AGENT_CHAT_MODEL_ID
AGENT_AUTOMATION_MODEL_ID
AGENT_FALLBACK_MODEL_ID
AZURE_OPENAI_API_KEY
AZURE_OPENAI_ENDPOINT
AZURE_OPENAI_BASE_URL
```

Model identifiers are overrides; the runtime also has a code default. Azure configuration takes precedence when its credentials are present.

### Automation and integrations

```text
CRON_SECRET
WORKER_SECRET
WORKER_CONCURRENCY
DEFAULT_WORKSPACE_ID
RECOVERY_TEST_MODE
NEXT_PUBLIC_DEMO_MODE

GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
GOOGLE_REDIRECT_URI
GOOGLE_GMAIL_SCOPE_MODE
INTERCOM_CLIENT_ID
INTERCOM_CLIENT_SECRET
INTERCOM_REDIRECT_URI
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
POSTHOG_API_KEY
POSTHOG_PROJECT_API_KEY
POSTHOG_PROJECT_ID
POSTHOG_WEBHOOK_SECRET
TAVILY_API_KEY
RESEND_API_KEY
RESEND_FROM_EMAIL
RESEND_NOTIFICATION_EMAIL
```

Database migration execution may additionally use `DATABASE_URL`/`SUPABASE_DB_URL` or a Supabase management token.

## Database setup

Apply all SQL files in `../database/migrations/` in filename order for a fresh database.

```bash
npm run migrations:plan
npm run migrations:apply
```

Important: the repository migration runner currently includes only the 12 recovery/identity migrations from August onward. It is suitable for that upgrade sequence, not for bootstrapping all 29 migrations on a blank database. Use Supabase CLI or `psql` to apply the complete directory until the runner is expanded.

## Product routes

### Public

- `/` — marketing and waitlist
- `/about`, `/pricing`, `/privacy`, `/terms`
- `/docs`, `/docs/[slug]`
- `/auth/login`, `/auth/callback`

### Authenticated dashboard

- `/dashboard` — AI command center
- `/dashboard/accounts`, `/dashboard/accounts/[id]` — account portfolio and detail
- `/dashboard/drafts` — draft review
- `/dashboard/brief` — founder brief
- `/dashboard/flows` — recovery cases, metrics, drafts, replay, and dispatch
- `/dashboard/settings`, `/dashboard/connections` — integrations
- `/dashboard/agents` — recovery-flow alias
- `/dashboard/history`, `/dashboard/sessions` — command-center session views
- `/dashboard/inbox` — placeholder; no inbox product is implemented yet

Dashboard routes are protected by Supabase session middleware and workspace membership checks.

## API groups

- `/api/agent/**` — chat, history, sessions, run inspection, and generic approval records
- `/api/auth/**` — OTP login and verification
- `/api/brief/**` — brief retrieval, generation, and refresh
- `/api/drafts/**` — hash-checked recovery draft approval and durable send queueing
- `/api/recovery/**` — recovery cases, drafts, replay, and direct dispatch surfaces
- `/api/metrics/revenue-saved` — recovery and revenue-impact metrics
- `/api/integrations/**` — direct connection and OAuth callbacks
- `/api/webhooks/**` — signed Stripe and PostHog ingress
- `/api/cron/daily-run` — protected daily reconciliation and brief run
- `/api/internal/workflows/drain` — protected durable worker drain and Gmail History polling
- `/api/waitlist` — public waitlist submission

See [`../docs/ALLEL.md`](../docs/ALLEL.md) for the execution and trust model.

## Commands

```bash
npm run dev                  # local Next.js server
npm test                     # all Node/TS tests
npm run build                # production build
npm run lint                 # ESLint
npm run scenario:evaluate    # print deterministic scenario evaluation
npm run migrations:plan      # show runner-managed migrations
npm run migrations:apply     # apply runner-managed migrations
npm run workflows:drain      # drain jobs for a workspace
npm run agent:readiness      # check deployed schema/RLS readiness
npm run demo:data:plan
npm run demo:data:seed
npm run demo:data:inspect
npm run demo:data:reset
npm run demo:data:evaluate
npm run demo:reset-apex
```

`workflows:drain` requires `--workspace-id=<uuid>` or `DEFAULT_WORKSPACE_ID`; sending remains disabled unless explicitly allowed by the script.

## Deployment and scheduling

`vercel.json` invokes `/api/cron/daily-run` at `0 4 * * *` (04:00 UTC daily). Configure `CRON_SECRET` in the deployment.

The worker-drain endpoint is not scheduled by `vercel.json`. Production needs a separate frequent scheduler or worker process for low-latency queue processing and Gmail History polling.

## Validation snapshot

Verified on **2026-09-05**:

```text
npm test       439 passed, 0 failed
npm run build  passed
```

Run both commands after changes; this snapshot is not a permanent guarantee.
