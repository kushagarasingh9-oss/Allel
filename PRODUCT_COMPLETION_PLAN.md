# Product Completion Plan

> Updated: 2026-04-24
> This is the practical completion plan from the current codebase, not the old aspirational roadmap.

---

## Current State

The product now has a credible backend and the beginnings of a credible operator console.

What is already real:
- authenticated multi-workspace dashboard
- account, signal, timeline, draft, brief, and memory data models
- provider connect + token storage + sync flows
- cron and webhook automation
- persona-based agent chat
- signed assistant history
- compacted conversation persistence
- durable account memory
- workflow-level run logging and inspection APIs
- dashboard shell with real chat feed and live settings UI

The product is clearly beyond prototype stage. The remaining work is about trust, continuity, inspection, and sharpness.

---

## Completed

### Foundation
- Supabase auth
- workspace auto-provisioning
- RLS-backed core schema
- encrypted integration token storage

### Data ingestion
- Stripe sync + webhook handling
- PostHog sync + webhook handling
- Gmail sync + send flows
- Intercom sync
- HubSpot sync
- Slack sync / delivery
- Sentry sync
- Linear sync
- direct agent tools for Notion, Airtable, Calendar, and web research

### Agent layer
- Alex / Henry / Sarah personas
- persona-specific tool access
- trusted assistant history signing
- compacted conversation persistence
- durable account memory retrieval
- workflow jobs for daily review and webhook follow-up
- richer `agent_runs` logging
- workflow inspection APIs

### Product surfaces
- dashboard shell
- real streaming chat feed
- live integrations settings page
- account and draft surfaces
- deterministic founder brief generation from live state

---

## Partially Complete

These areas are real, but still not at the level we want for a world-class product.

### 1. Memory quality

Current:
- bounded transcript persistence
- compacted conversation summary
- account memory snapshots

Still missing:
- richer semantic retrieval
- better long-horizon summaries
- tighter account-context carryover across repeated workflows

### 2. Run inspection UX

Current:
- grouped workflow inspection in the backend
- list/detail APIs for workflow history
- stage metadata and failure logging

Still missing:
- replay-grade UI depth
- richer founder-facing inspection of what changed
- tighter cross-links between run history and the rest of the dashboard

### 3. Chat continuity UX

Current:
- server-backed persistence and signing
- local persona thread persistence in the browser
- real streaming agent UI

Still missing:
- explicit server hydration on first load
- visible restored-context status
- cleaner cross-device continuity

### 4. Orchestration depth

Current:
- narrower `detect`, `analyze`, `draft`, and `verify` jobs
- deterministic brief ownership
- workflow IDs across cron and webhook runs

Still missing:
- planner / executor / critic structure
- more task-specific model routing
- deeper decomposition for complex workflows

### 5. Integration readiness clarity

Current:
- backend catalog distinguishes syncable, tool-only, and planned providers
- connection health is stored in `integration_connections`
- settings now read those capability states from a shared backend catalog

Still missing:
- richer UI explanation of post-connect unlocks per provider
- tighter gating and guidance around cataloged-but-not-ready providers

---

## Highest-Leverage Next Work

### Priority 1
- deepen the shipped run history UI on top of `/api/agent/runs`
- hydrate chat from server-backed history on initial load
- make integration readiness clearer in settings and onboarding

### Priority 2
- improve memory quality and retrieval
- improve evidence rendering in chat, accounts, and drafts
- connect workflow history to the rest of the dashboard

### Priority 3
- make model routing more deliberate by job type
- only after the current runtime is fully trustworthy, consider deeper agent architecture

---

## Step-By-Step Execution Order

### Step 1. Ship run history in the dashboard

Status:
- v1 shipped
- replay-grade depth still ahead

Tasks:
1. deepen the dashboard surface for recent workflows
2. improve evidence, drill-down, and failure detail
3. deep-link more product surfaces into workflow detail

### Step 2. Make chat continuity server-first

Status:
- partially completed

Tasks:
1. fetch server-backed persona history on first load
2. merge it cleanly with local thread state
3. show that prior context was restored

### Step 3. Deepen memory

Status:
- partially completed

Tasks:
1. improve conversation compaction quality
2. tighten account-memory refresh and retrieval strategy
3. preserve higher-signal account context for repeated workflows

### Step 4. Keep narrowing automation jobs

Status:
- partially completed

Tasks:
1. keep tightening prompts and scopes per workflow stage
2. continue reducing unnecessary write access in read-heavy phases
3. improve per-job model selection

### Step 5. Improve readiness and evidence UX

Status:
- partially completed

Tasks:
1. explain provider capability states in the settings UI
2. surface richer evidence in accounts, drafts, and chat
3. connect recent workflow changes back to the operator console

---

## Honest Summary

The product is now a strong v1: real data model, real automation, real chat, real memory, and real workflow logging.

What is missing is not "build the product from scratch." What is missing is the layer that makes the product feel obviously trustworthy and inspectable every day.
