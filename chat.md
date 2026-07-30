# Chat Architecture

> Current state of the persona chat system.
> Updated: 2026-04-24

---

## Current Backend Chat Flow

Endpoint:
- `POST /api/agent?agentId=alex|henry|sarah`

Current backend guarantees:
- authenticated user required
- workspace resolved server-side
- persona resolved server-side
- client assistant history only accepted if server-signed
- client tool history is not trusted
- server-side transcript persistence per `workspace + user + persona`
- compacted conversation summary and account context persisted alongside transcript history

Relevant files:
- `/Users/kushagrasingh/dev/agenticworkflow/web/src/app/api/agent/route.ts`
- `/Users/kushagrasingh/dev/agenticworkflow/web/src/lib/agent/ui-message-utils.ts`
- `/Users/kushagrasingh/dev/agenticworkflow/web/src/lib/agent/chat-memory.ts`

---

## Current Frontend Reality

The chat UI is now much more real than the earlier placeholder state.

What is live now:
- `WorkspaceLayout` shares one `ChatProvider` across the dashboard shell
- each persona keeps its own thread instance
- persona threads still persist in local storage for fast switching
- `AgentPane` wires the prompt UI to the active persona
- `AgentFeed` renders streaming assistant text, reasoning, and tool-call results

Relevant files:
- `/Users/kushagrasingh/dev/agenticworkflow/web/src/components/agent-feed/chat-provider.tsx`
- `/Users/kushagrasingh/dev/agenticworkflow/web/src/components/agent-feed/agent-pane.tsx`
- `/Users/kushagrasingh/dev/agenticworkflow/web/src/components/agent-feed/agent-feed.tsx`

---

## What Is Working Well

- persona switching is real, not cosmetic
- tool calls and reasoning can stream into the UI
- the backend keeps trusted server history even if the browser state is imperfect
- assistant replies are signed before they become trusted history
- older chat can now be compacted into summary memory instead of only raw trailing messages

---

## Current Gap

The backend and frontend are closer than before, but still not fully aligned.

Backend:
- durable server-side transcript
- trusted assistant history
- compacted conversation summary
- persisted account-context hints for continuity

Frontend:
- local-storage-first bootstrap
- no explicit fetch-and-restore step from server history on first load
- no visible indicator that prior server context was restored
- no run-history panel tied into the chat experience yet

---

## Important Product Note

Chat is no longer "just a widget."

It is one front door into the same operator layer used by:
- daily automation
- webhook-triggered analysis
- manual founder requests

That means the chat experience should increasingly behave like an operator console, not only a conversation window.

---

## Next Chat Steps

### Step 1. Hydrate chat from the server on initial load

Status:
- next frontend step

Goal:
- make backend-backed continuity visible immediately instead of only after the next roundtrip

### Step 2. Expose restored context more clearly

Status:
- next frontend step

Goal:
- show when a persona has prior context, compacted memory, or restored history

### Step 3. Connect chat with workflow inspection

Status:
- backend APIs are ready
- chat UI integration is not

Goal:
- let founders move between conversations and the workflows those conversations triggered

### Step 4. Improve structured evidence rendering

Status:
- partially completed

Goal:
- make account lookups, sync results, drafts, and other operator outputs feel more inspectable and less like raw chat blobs
