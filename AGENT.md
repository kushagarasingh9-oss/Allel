# Agent Layer

> The agent loop: personas, tools, workflow stages, self-healing tool routing, chat trust boundaries, and memory.
>
> For whole-system architecture — layers, database, integrations, frontend surfaces, runtime paths — see [ALLEL.md](file:///Users/kushagrasingh/dev/allel/ALLEL.md). This file details the agent orchestration engine.
>
> Verified against the working tree on **2026-08-22**. Paths are repo-relative.

---

## Shape

A **hybrid persona-driven operator system**, combining deterministic workflow state with an AI SDK 6 `ToolLoopAgent` runtime (`stopWhen: stepCountIs(25)`), dynamic in-loop schema expansion (`prepareStep`), and resilient model failover (`maxRetries: 3`, `AGENT_FALLBACK_MODEL_ID`).

Core runtime files:

| File | Role |
| :--- | :--- |
| `web/src/lib/agent/agent.ts` | Tool registry (`ALL_TOOLS`), adaptive Levenshtein fuzzy router, in-loop `prepareStep` expansion, live integration guards, agent cache |
| `web/src/lib/agent/tools.ts` | Tool implementations (136 registered tools) |
| `web/src/lib/agent/personas.ts` | Persona definitions and per-persona tool allowlists |
| `web/src/lib/agent/instructions.ts` | Shared base system prompt |
| `web/src/lib/agent/runtime-context.ts` | Step-aware runtime contract block injected into the prompt |
| `web/src/lib/agent/workflows.ts` | Staged automation jobs and per-stage tool allowlists |
| `web/src/lib/agent/ui-message-utils.ts` | Client message sanitization and HMAC assistant-history signing |
| `web/src/lib/agent/chat-memory.ts` | Transcript persistence, trimming, and rolling compaction |
| `web/src/lib/agent/account-memory.ts` | Durable per-account memory and asynchronous refresh queue |
| `web/src/lib/agent/run-logger.ts` | Writes runs into `agent_runs` with token spend and step traces |
| `web/src/lib/agent/run-inspection.ts` | Groups runs into workflow inspections for `/api/agent/runs` |
| `web/src/lib/agent/approval-store.ts` | Backs `tool_approval_requests` |
| `web/src/lib/agent/external-content.ts` | Labels third-party text as untrusted |
| `web/src/lib/agent/error-classifier.ts` | Classifies runtime failures for retry, fallback, or founder-safe display |

---

## Personas

Three personas, defined in `personas.ts`. Each has a dedicated instruction file appended to the shared base prompt.

| ID | Display name | Role | Instruction file | Tool scope |
| :--- | :--- | :--- | :--- | :--- |
| `alex` | **Alex** (Allel) | AI Co-founder / Generalist | `allel-instructions.ts` (`COFOUNDER_INSTRUCTIONS`) | All 136 registered tools |
| `henry` | **Henry** | Head of Growth | `henry-instructions.ts` (`HENRY_INSTRUCTIONS`) | Curated: Tavily web research, read-only CRM/Support, Gmail read/draft, Slack, Notion |
| `sarah` | **Sarah** | Head of Retention | `sarah-instructions.ts` (`SARAH_INSTRUCTIONS`) | Curated: Stripe billing, PostHog usage, rescue drafts, account health |

The `alex` ID is retained for backwards compatibility while the founder-facing identity is the unified "Allel". Henry's scope isolates web research from direct business writes; his Gmail access is read-and-draft only, with no send tool.

---

## Live Entry Points

| Endpoint | Purpose |
| :--- | :--- |
| `POST /api/agent?agentId=alex\|henry\|sarah` | Streaming founder chat with in-loop schema expansion |
| `DELETE /api/agent` | Clear persisted conversation state |
| `GET /api/agent/history` | Persisted conversation history |
| `GET` and `POST /api/agent/approvals` | Read and resolve tool approval requests |
| `GET /api/agent/runs` | Workflow run history (workflow-level cursor pagination) |
| `GET /api/agent/runs/[workflowId]` | Single workflow inspection |
| `GET /api/cron/daily-run` | Daily automation, `CRON_SECRET`-gated |
| `POST /api/webhooks/stripe` | Stripe follow-up automation |
| `POST /api/webhooks/posthog` | PostHog follow-up automation |
| `POST /api/brief/refresh` | Deterministic brief rebuild |
| `PATCH /api/drafts/[id]/approve` | Founder-only draft approval |
| `POST /api/drafts/[id]/send` | Founder-only draft send |
| `GET /api/metrics/revenue-saved` | Draft-outcome revenue metric |
| `POST /api/waitlist` | Landing-page waitlist capture |

---

## Tool Surface & 3-Guarantee Execution Architecture

`ALL_TOOLS` in `agent.ts` registers **136 tools** spanning 12 capability domains: Google Calendar, Gmail, Slack, Stripe, Notion, PostHog, Linear, Intercom, HubSpot, Sentry, Airtable, and Web Research.

```text
persona + workflow policy ceiling (Hard Security Boundary)
        │
        ▼
eligible capability tools (e.g., Alex = 136 tools, Henry = 32 tools)
        │
        ├── deterministic router ──► initially activeTools (~12 tools)
        │                              + requestMoreTools meta-tool
        │
        ▼
ToolLoopAgent contains all eligible definitions internally
but sends only `activeTools` schemas to LLM on step 1
        │
        ▼
model calls requestMoreTools({ domain: 'stripe', reason: '...' })
        │
        ▼
next `prepareStep` derives requested domains from prior step tool calls
        │
        ▼
activeTools = initial tools ∪ eligible tools in requested domains
        │
        ▼
model receives expanded schemas in the SAME loop turn without restarting stream
```

### Guarantee 1 — No False Negatives: Adaptive Levenshtein Router
- `selectRelevantToolsForPrompt` routes requests using exact keyword regexes + fast bounded Levenshtein distance:
  - Tokens 4–5 chars: distance $\le 1$
  - Tokens 6+ chars: distance $\le 2$
  - Tokens $\le 3$ chars: never fuzzy-matched (avoids false matches on short words)
- Domain matching is strictly independent (e.g. matching Gmail never drops Calendar).
- Chat turns with no detected domain signal fall back to core tools (~7 tools) rather than dumping all 136 schemas.

### Guarantee 2 — No False Positives: Live Integration Guards
- Every tool definition is wrapped with `wrapToolWithLiveIntegrationGuard`.
- If an integration connection is unverified, disconnected, or returns a 401/auth failure, the guard cleanly flags `needs_attention` and rejects execution rather than allowing mock/fabricated data.

### Guarantee 3 — No Dead Ends: In-Loop `prepareStep` & `requestMoreTools`
- In interactive chat, `ToolLoopAgent` holds all persona-eligible tools internally, exposing only the initial `activeTools` schemas on step 1 alongside `requestMoreTools`.
- When the model calls `requestMoreTools({ domain, reason })`, `prepareStep` intercepts the call between reasoning steps and expands `activeTools` for subsequent steps.
- The expansion is purely derived from `steps`, ensuring zero cross-request mutable state leakage across cached agent instances.

### What the Agent Loop Cannot Do
- `approveDraft` and `sendApprovedDraft` tools are **strictly excluded** from `ALL_TOOLS`.
- `approveDraftForActor()` and `sendDraftForActor()` in `web/src/lib/drafts/draft-workflows.ts` reject any call where `actor === 'agent'`.
- Sending an email requires explicit status `ready_to_send` and verified human founder approval provenance (`approved_at` and `approved_by_actor`).

---

## Workflow Stages

Automated work decomposes into `detect → analyze → draft → verify`. Daily review, Stripe follow-up, and PostHog follow-up all use the same four stages.

`WORKFLOW_STAGE_TOOL_ALLOWLISTS` in `workflows.ts` enforces scope in code:

| Stage | Allowed tools |
| :--- | :--- |
| `detect` | `READ_ONLY_WORKFLOW_TOOLS` |
| `analyze` | read-only + `ANALYZE_WRITE_WORKFLOW_TOOLS` (risk, signals, timeline, account info, notes, contacts) |
| `draft` | read-only + `DRAFT_WRITE_WORKFLOW_TOOLS` (`generateFollowUpDraft`, `rejectDraft`, `updateDraftContent`) |
| `verify` | `READ_ONLY_WORKFLOW_TOOLS` |

Webhook follow-up jobs are scheduled with Next.js `after()` **before** the event is marked processed, so a failure to register does not silently drop the follow-up.

---

## Chat Trust Boundaries

The browser can send user messages. It cannot define trusted assistant state.

`sanitizeClientUiMessages()` in `ui-message-utils.ts`:
- Accepts only `user` and `assistant` roles; client `tool` and `system` messages are dropped outright.
- Accepts an `assistant` message only when its `metadata.trustedHistory` carries `version: 1`, matching `workspaceId`/`personaId`, and a valid HMAC-SHA256 signature.
- Signs assistant messages on the way out using `AGENT_HISTORY_SIGNING_SECRET` (falling back to `OPENAI_API_KEY`).
- Server injects workspace identity, persona instructions, memory context, and runtime contract blocks after sanitization.

---

## Memory

### Chat Memory — `chat-memory.ts`
- Bounded trailing transcript: `MAX_PERSISTED_AGENT_MESSAGES = 40`.
- Compacted rolling summary: `MAX_COMPACTED_SUMMARY_CHARS = 1800`.
- Account context: up to `MAX_COMPACTED_ACCOUNT_IDS = 4` mentioned account IDs, `MAX_COMPACTED_GOALS = 3` user goals, and commitments in `agent_conversations`.

### Account Memory — `account-memory.ts`
- Stored in `account_memories`: account summaries, key signals, open loops, and recent timeline context.
- Personas retrieve it through `getAccountMemory`.
- Refreshes are enqueued in `account_memory_refresh_queue` and processed with bounded concurrency.

---

## What Is Genuinely Agentic

- Dynamic self-correcting tool expansion in-loop via `requestMoreTools` + `prepareStep`.
- Multi-step reasoning loops up to 25 steps per run.
- Multi-context execution across chat, cron, and webhook events.
- Hard persona isolation and staged workflow security allowlists.
- Durable context carryover through live account state and dual-memory synthesis.

---

## Known Gaps & Next Priorities

1. **Workflow Run Inspection UI**: Build the founder UI on `/dashboard/flows` consuming the live `/api/agent/runs` endpoints.
2. **Server-First Chat Hydration**: Fetch persisted history on initial boot via `/api/agent/history` rather than relying primarily on browser `sessionStorage`.
3. **Semantic Memory Layer**: Complement heuristic compaction with vector-indexed account memory embeddings.
4. **Provider Readiness Dashboard**: Surface live provider health and remediation guidance in `/dashboard/settings`.
