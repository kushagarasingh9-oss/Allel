# Agent Layer Status

> Current state of the agent system.
> Updated: 2026-04-24

---

## What Exists Now

The product has a real agent layer and a real operator UI around it. It is still a **hybrid persona-driven operator system**, not a deep autonomous multi-agent platform.

Live personas:
- `Alex` -> co-founder / generalist
- `Henry` -> growth / research / draft-safe operator
- `Sarah` -> retention / billing / rescue

Live entry points:
- founder chat via `POST /api/agent?agentId=alex|henry|sarah`
- workflow history via `GET /api/agent/runs`
- single workflow inspection via `GET /api/agent/runs/:workflowId`
- daily automation via `GET /api/cron/daily-run`
- Stripe follow-up via `POST /api/webhooks/stripe`
- PostHog follow-up via `POST /api/webhooks/posthog`

Core runtime files:
- `/Users/kushagrasingh/dev/agenticworkflow/web/src/lib/agent/agent.ts`
- `/Users/kushagrasingh/dev/agenticworkflow/web/src/lib/agent/tools.ts`
- `/Users/kushagrasingh/dev/agenticworkflow/web/src/lib/agent/personas.ts`
- `/Users/kushagrasingh/dev/agenticworkflow/web/src/lib/agent/workflows.ts`
- `/Users/kushagrasingh/dev/agenticworkflow/web/src/lib/agent/run-inspection.ts`

---

## What Changed In This Upgrade

### 1. Personas are first-class prompt bundles

Each persona now has its own dedicated instruction file:
- `/Users/kushagrasingh/dev/agenticworkflow/web/src/lib/agent/alex-instructions.ts`
- `/Users/kushagrasingh/dev/agenticworkflow/web/src/lib/agent/henry-instructions.ts`
- `/Users/kushagrasingh/dev/agenticworkflow/web/src/lib/agent/sarah-instructions.ts`

Persona behavior is no longer one big shared prompt with light styling on top. Prompting and tool access are both specialized.

### 2. Chat trust boundaries are stricter

The browser can send user messages, but it cannot define trusted assistant state.

What is live now:
- `user` messages from the client are accepted
- assistant history is only accepted if it was server-signed
- client tool history is ignored
- workspace and persona context are injected server-side

Relevant file:
- `/Users/kushagrasingh/dev/agenticworkflow/web/src/lib/agent/ui-message-utils.ts`

### 3. Chat memory is now compacted, not just trimmed

Server-side conversation persistence now includes:
- bounded trailing transcript history
- compacted conversation summary
- summary message counts
- account context such as mentioned account IDs, recent user goals, and assistant commitments

Relevant files:
- `/Users/kushagrasingh/dev/agenticworkflow/web/src/lib/agent/chat-memory.ts`
- `/Users/kushagrasingh/dev/agenticworkflow/supabase/migrations/20260424_chat_compaction_and_run_inspection.sql`
- `/Users/kushagrasingh/dev/agenticworkflow/supabase/migrations/20260424_workflow_hardening_and_memory_queue.sql`

### 4. Durable account memory is live

The agent no longer depends only on chat continuity.

What is live now:
- `account_memories` can store account summaries, key signals, open loops, and recent timeline context
- personas can retrieve that context through `getAccountMemory`
- touched-account refreshes are queued through `account_memory_refresh_queue`
- queue processing is bounded instead of full-workspace `Promise.all` fan-out
- memory refresh still runs after syncs, webhooks, draft actions, and many account-level writes

Relevant file:
- `/Users/kushagrasingh/dev/agenticworkflow/web/src/lib/agent/account-memory.ts`

### 5. Automation jobs are narrower than before

Daily review and webhook follow-up no longer behave like one opaque agent jump.

What is live now:
- daily review runs as `detect -> analyze -> draft -> verify`
- Stripe webhook follow-up runs as `detect -> analyze -> draft -> verify`
- PostHog webhook follow-up runs as `detect -> analyze -> draft -> verify`
- each job carries workflow metadata into `agent_runs`
- each stage has a backend-enforced tool allowlist, not only prompt guidance
- webhook follow-up is scheduled with `after()` before the event is marked processed

Relevant file:
- `/Users/kushagrasingh/dev/agenticworkflow/web/src/lib/agent/workflows.ts`

### 6. Run inspection is now a real backend surface

The system no longer only logs runs; it can group and inspect them by workflow.

What is live now:
- workflow grouping in `run-inspection.ts`
- list and detail APIs under `/api/agent/runs`
- normalized `agent_runs` columns for `workflow_id`, `stage`, `persona_id`, `provider`, `job_index`, and `parent_run_id`
- workflow pagination now happens at the workflow level instead of raw row truncation
- indexes added for workflow lookup and recent-run retrieval

### 7. The frontend now exposes the agent more directly

This upgrade was not backend-only.

What is live now:
- dashboard workspace shell with a left operating pane and right agent pane
- shared chat provider across the dashboard shell
- real streaming agent feed with tool/reasoning rendering
- settings page with live integration connect/disconnect state
- `/dashboard/flows` run history screen backed by `/api/agent/runs`

Relevant files:
- `/Users/kushagrasingh/dev/agenticworkflow/web/src/components/dashboard/workspace-layout.tsx`
- `/Users/kushagrasingh/dev/agenticworkflow/web/src/components/agent-feed/chat-provider.tsx`
- `/Users/kushagrasingh/dev/agenticworkflow/web/src/components/agent-feed/agent-feed.tsx`
- `/Users/kushagrasingh/dev/agenticworkflow/web/src/app/dashboard/settings/page.tsx`

---

## Tool Surface

The tool layer is now broad enough to support a real operator workflow.

Live tool families include:
- workspace and account reads
- risk updates, notes, timeline events, contacts, and drafts
- Gmail read/reply/send
- Slack read/write/thread actions
- Stripe billing, disputes, and coupon actions
- PostHog analytics and flag actions
- Intercom conversation workflows
- HubSpot CRM actions
- Linear issue actions
- Sentry issue actions
- Notion read/write
- Airtable read/write
- Google Calendar read/write
- web research via Tavily

Persona access is filtered:
- Alex -> full tool universe
- Henry -> growth / research / draft-safe subset with web research isolated from direct business writes
- Sarah -> retention / billing / account-health / rescue subset

Sensitive approval boundaries are enforced in code:
- founder approval is required before a draft can move to `ready_to_send`
- founder approval provenance is required before send
- founder-only draft approval/send tools are not exposed to persona loops

---

## What Is Truly Agentic

The current system is genuinely agentic in these ways:
- the model can choose tools
- it can chain multiple steps in one run
- it operates in chat, cron, and webhook contexts
- personas change both behavior and tool access
- workflow jobs can carry durable context between stages through live state and memory

But it is still **v1 agentic**, not deep orchestration.

What it does **not** have yet:
- planner / executor split
- verifier / critic loop beyond the current verify-stage prompt
- subagents
- replayable full tool traces in a dedicated UI
- strong source-aware inspection across every external-content tool
- long-horizon semantic memory beyond compact summaries and account snapshots

---

## Current Constraints

The architecture is still centered on one main `ToolLoopAgent` style runtime.

Important limitations:
- chat boot still favors local persona threads in the browser even though the server now persists and compacts history
- conversation compaction is heuristic summary memory, not a semantic retrieval system
- account memory is useful but still deterministic snapshotting, not learned reasoning memory
- run history exists in the dashboard, but it is not yet a replay-grade trace UI
- external text-heavy tools are safer now, but not fully hardened end to end

---

## Next Priorities

1. Make the new `/dashboard/flows` surface replay-grade with richer evidence and drill-down.
2. Hydrate chat from server-backed history on initial load instead of relying mostly on local boot state.
3. Deepen memory from compact summaries into more durable account and conversation recall.
4. Keep tightening external-content handling and evidence rendering.
5. Continue narrowing workflow jobs and making model selection deliberate by run type.

---

## Bottom Line

This is no longer "just a chat prompt." It is a real persona-based operator layer with trusted chat, compacted memory, durable account context, workflow jobs, founder-gated outbound approval, and inspectable run history.

The current product is best described as:

**A hybrid SaaS operator system with one strong agent runtime, persona specialization, durable state, and growing workflow-level observability.**
