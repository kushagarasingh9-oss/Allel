# Architecture

> Current product architecture as it exists now.
> Updated: 2026-04-24

---

## System Shape

The product is now a **retention-operations backend plus operator console**:

1. connect and validate provider credentials
2. ingest external signals into normalized account state
3. maintain deterministic brief output plus compact memory layers
4. let persona-specific agents operate on top of that state
5. surface the results in the dashboard, chat shell, settings UI, and run-inspection APIs

It is not a pure workflow engine, and it is no longer accurate to describe it as backend-only.

---

## Top-Level Layers

### 1. Workspace / Auth Layer

Core files:
- `/Users/kushagrasingh/dev/agenticworkflow/web/src/lib/supabase/*`
- `/Users/kushagrasingh/dev/agenticworkflow/web/src/lib/workspaces/ensure-workspace.ts`

Responsibilities:
- Supabase auth
- workspace auto-provisioning
- workspace membership enforcement
- server and service clients

### 2. Integration Catalog / Connection Layer

Core files:
- `/Users/kushagrasingh/dev/agenticworkflow/web/src/lib/integrations/catalog.ts`
- `/Users/kushagrasingh/dev/agenticworkflow/web/src/lib/integrations/connection-state.ts`
- `/Users/kushagrasingh/dev/agenticworkflow/web/src/app/dashboard/settings/actions.ts`
- `/Users/kushagrasingh/dev/agenticworkflow/web/src/app/dashboard/settings/page.tsx`

Responsibilities:
- define which providers are `syncable`, `tool_only`, or `planned`
- validate provider credentials
- encrypt and store tokens
- connect, disconnect, and trigger syncs
- drive settings and dashboard capability messaging from one backend catalog
- persist connection health such as `connected`, `needs_attention`, and recent sync metadata

Current live backend categories:
- syncable: Stripe, PostHog, Gmail, Intercom, HubSpot, Slack, Sentry, Linear
- tool-only: Notion, Airtable, Google Calendar
- planned catalog entries: Jira, GitHub, Figma, Zendesk, Salesforce, Supabase, Google Docs, Google Drive

### 3. Ingestion / Sync Layer

Core files:
- `/Users/kushagrasingh/dev/agenticworkflow/web/src/lib/integrations/*-sync.ts`
- `/Users/kushagrasingh/dev/agenticworkflow/web/src/app/api/webhooks/stripe/route.ts`
- `/Users/kushagrasingh/dev/agenticworkflow/web/src/app/api/webhooks/posthog/route.ts`
- `/Users/kushagrasingh/dev/agenticworkflow/web/src/app/api/cron/daily-run/route.ts`

Responsibilities:
- pull provider data into normalized tables
- write signals and timeline events
- keep syncs and webhooks idempotent
- enqueue touched account-memory refreshes after meaningful data changes
- process memory refreshes with bounded queue concurrency
- isolate per-provider failures in cron
- trigger follow-up automation

### 4. Normalized Product State

Primary operating tables:
- `customer_accounts`
- `account_signals`
- `account_contacts`
- `account_timeline`
- `follow_up_drafts`
- `founder_briefs`
- `founder_brief_items`
- `webhook_events`
- `integration_connections`
- `integration_tokens`
- `agent_runs`
- `agent_conversations`
- `account_memories`
- `account_memory_refresh_queue`

The product does not reason directly over raw provider data most of the time. It reasons over normalized state plus curated memory.

### 5. Deterministic Brief Layer

Core file:
- `/Users/kushagrasingh/dev/agenticworkflow/web/src/lib/briefs/generate-workspace-brief.ts`

Responsibilities:
- summarize live workspace state into one founder brief
- rank the most important brief items
- remain the canonical brief writer in automated flows

Important rule:
- automated agent runs do **not** directly own founder brief item creation
- syncs, webhooks, and agent actions update live state
- the deterministic generator rebuilds the brief afterward

### 6. Agent Runtime Layer

Core files:
- `/Users/kushagrasingh/dev/agenticworkflow/web/src/lib/agent/agent.ts`
- `/Users/kushagrasingh/dev/agenticworkflow/web/src/lib/agent/tools.ts`
- `/Users/kushagrasingh/dev/agenticworkflow/web/src/lib/agent/personas.ts`
- `/Users/kushagrasingh/dev/agenticworkflow/web/src/lib/agent/ui-message-utils.ts`
- `/Users/kushagrasingh/dev/agenticworkflow/web/src/lib/agent/chat-memory.ts`
- `/Users/kushagrasingh/dev/agenticworkflow/web/src/lib/agent/account-memory.ts`
- `/Users/kushagrasingh/dev/agenticworkflow/web/src/lib/agent/workflows.ts`

Responsibilities:
- persona-aware tool filtering
- prompt specialization
- trusted chat handling
- compacted conversation persistence
- durable account memory retrieval and refresh
- background workflow jobs across cron and webhooks

Current runtime facts:
- one main `ToolLoopAgent` style runtime
- persona-specific model routing and caches
- narrower workflow jobs for `detect`, `analyze`, `draft`, and `verify`
- per-stage tool allowlists enforce read-heavy vs draft-heavy phases
- founder approval is enforced in backend draft workflows, not only prompt text
- model-aware cost estimation and redacted step logging are live
- workflow metadata travels through normalized `agent_runs` columns plus extra metadata

### 7. Inspection / Observability Layer

Core files:
- `/Users/kushagrasingh/dev/agenticworkflow/web/src/lib/agent/run-logger.ts`
- `/Users/kushagrasingh/dev/agenticworkflow/web/src/lib/agent/run-inspection.ts`
- `/Users/kushagrasingh/dev/agenticworkflow/web/src/app/api/agent/runs/route.ts`
- `/Users/kushagrasingh/dev/agenticworkflow/web/src/app/api/agent/runs/[workflowId]/route.ts`

Responsibilities:
- log chat, sync, draft, cron, and webhook runs into `agent_runs`
- group rows into workflow inspections by normalized `workflow_id`
- return list and detail views for workflow history
- support failure diagnosis and later replay UI work

### 8. Application Surfaces

Main user-facing surfaces:
- dashboard inbox shell
- account pages
- draft queue
- flows / run history
- integrations settings
- persona chat feed

Notable files:
- `/Users/kushagrasingh/dev/agenticworkflow/web/src/app/dashboard/page.tsx`
- `/Users/kushagrasingh/dev/agenticworkflow/web/src/app/dashboard/flows/page.tsx`
- `/Users/kushagrasingh/dev/agenticworkflow/web/src/components/dashboard/workspace-layout.tsx`
- `/Users/kushagrasingh/dev/agenticworkflow/web/src/components/dashboard/flows-page.tsx`
- `/Users/kushagrasingh/dev/agenticworkflow/web/src/components/agent-feed/agent-feed.tsx`
- `/Users/kushagrasingh/dev/agenticworkflow/web/src/components/agent-feed/chat-provider.tsx`

The frontend reads normalized data and invokes server actions and routes, but the backend still owns durable state transitions.

---

## Runtime Paths

### Chat Path

`POST /api/agent?agentId=alex|henry|sarah`

Flow:
1. authenticate user
2. ensure workspace
3. sanitize client UI messages
4. load persisted transcript history
5. load persisted conversation summary and account context
6. merge trusted client history with server history
7. inject trusted workspace, persona, and memory system context server-side
8. run the persona-specific agent
9. sign assistant metadata before it becomes trusted history
10. persist compacted conversation state and log the chat run

### Dashboard Chat UI Path

The current shell is:
1. `WorkspaceLayout` mounts a shared `ChatProvider`
2. each persona keeps its own local thread state in the browser
3. `AgentPane` wires the streaming prompt UI to the active persona chat
4. `AgentFeed` renders text, reasoning, and tool-call parts from AI SDK streams

This means the backend is durable, but the frontend still boots local-first.

### Settings / Connect Path

The integrations surface now supports:
1. manual connect or Pipedream-backed OAuth
2. token encryption and storage
3. immediate sync or readiness update
4. connection-state persistence
5. dashboard path revalidation after connect/disconnect

### Daily Automation Path

`GET /api/cron/daily-run`

Flow:
1. iterate workspaces
2. sync connected providers with isolated failure handling
3. enqueue recently touched account memories
4. process queued memory refreshes with bounded concurrency
5. run Sarah through narrower `detect`, `analyze`, `draft`, and `verify` jobs when AI is configured
6. rebuild founder brief from live state
7. deliver the brief to Slack if configured
8. log workflow-linked stages into `agent_runs`

### Webhook Path

Stripe and PostHog webhooks:
1. verify and parse the incoming event
2. resolve workspace and account context
3. update normalized state and enqueue touched account-memory refresh
4. refresh the deterministic brief
5. register Sarah follow-up jobs with `after()`
6. mark the webhook processed only after follow-up registration succeeds
7. refresh the deterministic brief again after agent work lands
8. log grouped workflow stages for ingest, follow-up, failure fallback, and brief refresh

---

## Trust Boundaries

### What the browser can define

The browser can provide:
- user messages
- active persona selection in the UI
- local thread state for convenience

The browser cannot be trusted for:
- assistant history
- tool history
- workspace identity
- server memory state

Those are enforced server-side.

### External content

Content from Gmail, Slack, Intercom, Notion, and web research now goes through shared external-content handling and is labeled as untrusted. The remaining gap is richer source-aware inspection, not raw pass-through.

### Outbound actions

Sensitive operations still rely on explicit approval or constrained write paths where appropriate:
- Gmail send flows
- draft approval and send
- Stripe cancellation/refund style operations
- destructive account and signal updates

---

## What This Architecture Is Not

It is not:
- a pure deterministic score engine
- a pure multi-agent orchestration fabric
- a pure frontend chat app

It is currently:

**A normalized SaaS operations architecture with deterministic state generation, compact memory layers, persona-driven agents, and an operator console on top.**

---

## Main Remaining Gaps

1. No planner / executor / critic split.
2. Run history now exists, but not yet as a replay-grade trace UI.
3. Chat hydration still starts from local persona threads instead of explicit server bootstrap.
4. Memory is compact and useful, but not a semantic retrieval architecture.
5. Some providers are cataloged ahead of full backend readiness.

---

## Next Architecture Steps

### Step 1. Finish the inspection surface

Status:
- backend grouping, APIs, and a first dashboard history surface are live
- dedicated replay-grade inspection is not

Work:
- deepen the `/dashboard/flows` screen
- expose richer evidence, drill-down, and replay-friendly trace context

### Step 2. Make chat bootstrap server-aware

Status:
- backend persistence and compaction are live
- frontend restore UX is still partial

Work:
- hydrate persona threads from server history on first load
- expose when prior context was restored from the backend

### Step 3. Deepen memory

Status:
- compacted conversation memory and account memory are live
- richer retrieval and summarization strategy is still ahead

Work:
- improve memory quality
- connect account memory more deliberately into repeated workflows

### Step 4. Keep narrowing automation jobs

Status:
- detect / analyze / draft / verify stages are live
- more task-specific scopes and models are still ahead

Work:
- reduce variance further
- assign narrower tool scopes and model choices per job type
