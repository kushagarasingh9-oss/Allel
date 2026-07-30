# Frontend Status

> Frontend state after the April 24 upgrade.
> Updated: 2026-04-24

---

## What Landed

This was not a backend-only pass. The frontend now has real product surfaces around the upgraded agent layer.

### 1. Dashboard workspace shell

Live now:
- split workspace layout with a left operating pane and right agent pane
- shared `ChatProvider` at the shell level
- sidebar navigation for inbox, todo, flows, and integrations

Relevant files:
- `/Users/kushagrasingh/dev/agenticworkflow/web/src/app/dashboard/page.tsx`
- `/Users/kushagrasingh/dev/agenticworkflow/web/src/components/dashboard/workspace-layout.tsx`
- `/Users/kushagrasingh/dev/agenticworkflow/web/src/components/app-sidebar.tsx`

### 2. Real streaming chat UI

Live now:
- prompt input is wired to the agent
- persona switching is real
- message stream renders text, reasoning, and tool-call states
- local persona threads persist in the browser

Relevant files:
- `/Users/kushagrasingh/dev/agenticworkflow/web/src/components/agent-feed/chat-provider.tsx`
- `/Users/kushagrasingh/dev/agenticworkflow/web/src/components/agent-feed/agent-pane.tsx`
- `/Users/kushagrasingh/dev/agenticworkflow/web/src/components/agent-feed/agent-feed.tsx`

### 3. Live integrations settings page

Live now:
- searchable integration grid
- live connected/disconnected state
- connect and disconnect flows
- Pipedream-backed OAuth path for supported providers
- toast feedback for connect/disconnect actions

Relevant files:
- `/Users/kushagrasingh/dev/agenticworkflow/web/src/app/dashboard/settings/page.tsx`
- `/Users/kushagrasingh/dev/agenticworkflow/web/src/app/dashboard/settings/actions.ts`

### 4. Dashboard data modes

Live now:
- dashboard can resolve onboarding, live, and degraded states
- left pane can show brief summary and task list from real data
- onboarding copy and degraded notices are generated from backend reality

Relevant file:
- `/Users/kushagrasingh/dev/agenticworkflow/web/src/lib/dashboard/data.ts`

### 5. Run history surface

Live now:
- `/dashboard/flows` renders recent workflow history
- detail inspection reads from `/api/agent/runs/:workflowId`
- founders can review stages, status, personas, providers, and summaries without opening raw logs

Relevant files:
- `/Users/kushagrasingh/dev/agenticworkflow/web/src/app/dashboard/flows/page.tsx`
- `/Users/kushagrasingh/dev/agenticworkflow/web/src/components/dashboard/flows-page.tsx`

---

## What Is Still Behind The Backend

The frontend has caught up materially, but not completely.

### Chat continuity

Still missing:
- explicit hydration from server-backed conversation history on first load
- visible restore state for prior persona context
- clearer UX around what came from local state vs. server persistence

### Run inspection

Still missing:
- replay-grade trace detail and richer evidence rendering inside the new flows UI
- tighter links from accounts, drafts, and chat into specific workflow runs

### Integration capability messaging

Still missing:
- deeper explanation of what "connected" unlocks for each provider
- richer per-provider readiness and next-step guidance

### Evidence-heavy surfaces

Still missing:
- richer account and draft UI that surfaces timeline, memory, and workflow context
- better links between chat, drafts, and recent automation changes

---

## Highest-Priority Next Frontend Work

### 1. Make chat bootstrap server-aware

Goal:
- treat server-backed history as the durable source of truth on initial load

### 2. Deepen the run history surface

Goal:
- evolve the shipped `/dashboard/flows` screen into a stronger inspection surface

### 3. Tighten integration readiness UX

Goal:
- explain which providers are fully syncable, tool-only, or still planned

### 4. Improve evidence rendering

Goal:
- make operator outputs feel like inspected work, not only chat text

---

## Bottom Line

The frontend is no longer simply a handoff list for backend work. It now has a real workspace shell, real streaming chat, live settings flows, and a first workflow-history surface.

The next frontend step is not to invent new product behavior. It is to surface the backend's newer memory, workflow, and inspection truth more clearly.
