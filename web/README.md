# Allel Web

Founder-facing retention operations app built with Next.js, Supabase, and the AI SDK.

## What This App Does

- Connects product, billing, support, and communication tools
- Normalizes data into workspace, account, signal, draft, and brief state
- Runs persona-based agents for chat, daily review, and webhook follow-up
- Stores compacted chat memory, queued durable account-memory refreshes, and workflow logs
- Enforces founder approval before drafts can be sent
- Surfaces the product through the dashboard, drafts, accounts, flows, and integrations settings

## Main Product Surfaces

- `/dashboard` -> inbox shell with brief/tasks on the left and the agent on the right
- `/dashboard/accounts` -> account list and account detail
- `/dashboard/drafts` -> draft review and send workflow
- `/dashboard/flows` -> workflow history and inspection
- `/dashboard/settings` -> integrations connect/disconnect
- `/api/agent` -> persona chat
- `/api/agent/runs` -> workflow inspection API with workflow-level pagination
- `/api/cron/daily-run` -> daily automation
- `/api/webhooks/stripe` and `/api/webhooks/posthog` -> follow-up automation triggers

## Stack

- Next.js App Router
- React 19
- Supabase for auth, storage, and product state
- AI SDK + OpenAI
- Tailwind CSS 4
- Pipedream for OAuth-backed integration connect flows

## Local Development

1. Install dependencies:

```bash
npm install
```

2. Set up environment variables in `.env.local`.

Core variables used by the app include:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `OPENAI_API_KEY`
- `AGENT_HISTORY_SIGNING_SECRET`
- `ENCRYPTION_KEY`
- `CRON_SECRET`
- `STRIPE_WEBHOOK_SECRET`
- `POSTHOG_WEBHOOK_SECRET`
- `PIPEDREAM_CLIENT_ID`
- `PIPEDREAM_CLIENT_SECRET`
- `PIPEDREAM_PROJECT_ID`

3. Run the required Supabase SQL migrations from `../supabase/migrations`.

4. Start the dev server:

```bash
npm run dev
```

5. Run tests:

```bash
npm test
```

## Useful Docs In This Repo

- `/Users/kushagrasingh/dev/agenticworkflow/AGENT.md`
- `/Users/kushagrasingh/dev/agenticworkflow/ARCHITECTURE.md`
- `/Users/kushagrasingh/dev/agenticworkflow/ALLEL.md`
- `/Users/kushagrasingh/dev/agenticworkflow/chat.md`
- `/Users/kushagrasingh/dev/agenticworkflow/FRONTEND.md`
- `/Users/kushagrasingh/dev/agenticworkflow/PRODUCT_COMPLETION_PLAN.md`
