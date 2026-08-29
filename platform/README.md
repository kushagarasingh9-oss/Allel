# Allel Web

Founder-facing retention operations app built with Next.js, Supabase, and the AI SDK.

## What This App Does

- Connects product, billing, support, and communication tools
- Normalizes data into workspace, account, signal, draft, and brief state
- Runs persona-based agents for chat, daily review, and webhook follow-up
- Stores compacted chat memory, queued durable account-memory refreshes, and workflow logs
- Enforces founder approval before drafts can be sent
- Surfaces the product through the dashboard agent panel, drafts, accounts, and integrations settings

## Main Product Surfaces

- `/` -> marketing landing page with waitlist capture (inlined Framer export)
- `/dashboard` -> agent panel: `ChatProvider` wrapping `HomeAgentPanel`
- `/dashboard/accounts` -> account list and account detail
- `/dashboard/drafts` -> draft review and send workflow
- `/dashboard/settings` -> integrations connect/disconnect
- `/dashboard/flows` -> **empty placeholder.** Linked from the sidebar as "Workflows", but the page renders an empty div. No run-history UI exists.
- `/dashboard/inbox` -> **empty placeholder.**
- `/api/agent` -> persona chat
- `/api/agent/runs` and `/api/agent/runs/[workflowId]` -> workflow inspection APIs with workflow-level pagination. Live and tested, but no UI consumes them.
- `/api/cron/daily-run` -> provider reconciliation and founder brief
- `/api/internal/workflows/drain` -> protected durable worker drain and Gmail History polling
- `/api/webhooks/stripe` and `/api/webhooks/posthog` -> signed provider-event ingress

## Stack

- Next.js 15.5 App Router
- React 19.1
- Supabase for auth, storage, and product state
- AI SDK 6 + OpenAI
- Tailwind CSS 4
- Direct API connections for Stripe and PostHog; OAuth for Gmail, Calendar, and Intercom. The former Pipedream connect flow has been removed.

## Local Development

1. Install dependencies:

```bash
npm install
```

2. Set up environment variables in `.env.local`.

> Copy the tracked template `.env.example.template` to `.env.local` and fill in the values:
>
> ```bash
> cp .env.example.template .env.local
> ```
>
> It contains every key listed below.

Required:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `OPENAI_API_KEY`
- `ENCRYPTION_KEY`
- `AGENT_HISTORY_SIGNING_SECRET` — signs trusted assistant chat history. Falls back to `OPENAI_API_KEY` if unset, so set it explicitly.

Automation and webhooks:
- `CRON_SECRET`, `WORKER_SECRET`
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
- `POSTHOG_WEBHOOK_SECRET`
- `RECOVERY_TEST_MODE` (set `true` for the isolated competition workflow)

Integrations and delivery:
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `GOOGLE_GMAIL_SCOPE_MODE`
- `INTERCOM_CLIENT_ID`, `INTERCOM_CLIENT_SECRET`, `INTERCOM_REDIRECT_URI` (the Intercom Developer Hub callback must match exactly)
- `TAVILY_API_KEY`
- `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `RESEND_NOTIFICATION_EMAIL`
- `NEXT_PUBLIC_APP_URL`

Optional model overrides:
- `OPENAI_MODEL_ID`, `AGENT_MODEL_ID` — global default model
- `AGENT_CHAT_MODEL_ID`, `AGENT_AUTOMATION_MODEL_ID` — per-channel overrides applied to chat and automation runs respectively
- `AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_ENDPOINT` or `AZURE_OPENAI_BASE_URL`

3. Run the ordered Supabase SQL migrations from `../database/migrations` (or `node scripts/apply-migrations.cjs` after configuring `.env.local`).

4. Start the dev server:

```bash
npm run dev
```

5. Run tests:

```bash
npm test
```

## Useful Docs In This Repo

All paths are relative to the repository root, one level above this directory.

- `ALLEL_COMPLETE_GUIDE.md` — canonical whole-system architecture
- `AGENT.md` — agent loop, personas, tools, chat trust boundaries, memory
- `ALLEL.md` — product definition and positioning
- `PRODUCT_COMPLETION_PLAN.md` — completion plan
- `REPOSITORY_RESEARCH.md` — repository assessment and prioritized findings
- `INTEGRATION_AUDIT.md` — provider-by-provider integration audit
- `DEAD_CODE_AUDIT.md` — dead-code audit, cleanup record, and two open build bugs
