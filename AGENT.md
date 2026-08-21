# Agent Layer

> The agent loop: personas, tools, workflow stages, chat trust boundaries, and memory.
>
> For whole-system architecture — layers, database, integrations, frontend surfaces, runtime paths — see **`ALLEL_COMPLETE_GUIDE.md`**. This file does not restate it.
>
> Verified against the working tree on 2026-08-21. Paths are repo-relative.

---

## Shape

A **hybrid persona-driven operator system**, not a deep autonomous multi-agent platform. One `ToolLoopAgent` runtime (AI SDK 6, OpenAI models, `stopWhen: stepCountIs(25)`), specialized by persona and by workflow stage.

Core runtime files:

| File | Role |
| :--- | :--- |
| `web/src/lib/agent/agent.ts` | Tool registry (`ALL_TOOLS`), persona filtering, prompt-relevance narrowing, agent cache, cost estimation |
| `web/src/lib/agent/tools.ts` | Tool implementations |
| `web/src/lib/agent/personas.ts` | Persona definitions and per-persona tool allowlists |
| `web/src/lib/agent/instructions.ts` | Shared base system prompt |
| `web/src/lib/agent/runtime-context.ts` | Per-run runtime contract block injected into the prompt |
| `web/src/lib/agent/workflows.ts` | Staged automation jobs and per-stage tool allowlists |
| `web/src/lib/agent/ui-message-utils.ts` | Client message sanitization and assistant-history signing |
| `web/src/lib/agent/chat-memory.ts` | Transcript persistence, trimming, and compaction |
| `web/src/lib/agent/account-memory.ts` | Durable per-account memory and refresh queue |
| `web/src/lib/agent/run-logger.ts` | Writes runs into `agent_runs` |
| `web/src/lib/agent/run-inspection.ts` | Groups runs into workflow inspections |
| `web/src/lib/agent/approval-store.ts` | Backs `tool_approval_requests` |
| `web/src/lib/agent/external-content.ts` | Labels third-party text as untrusted |
| `web/src/lib/agent/error-classifier.ts` | Classifies runtime failures for the chat route |

---

## Personas

Three personas, defined in `personas.ts`. Each has a dedicated instruction file appended to the shared base prompt.

| ID | Display name | Role | Instruction file | Tool scope |
| :--- | :--- | :--- | :--- | :--- |
| `alex` | **Allel** | AI Co-founder / generalist | `allel-instructions.ts` (`COFOUNDER_INSTRUCTIONS`) | No `activeTools` list, so every registered tool |
| `henry` | Henry | Head of Growth | `henry-instructions.ts` (`HENRY_INSTRUCTIONS`) | Curated: Tavily web research, read-only HubSpot and Intercom, Gmail read + draft, Slack, Notion, read-only account context |
| `sarah` | Sarah | Head of Retention | `sarah-instructions.ts` (`SARAH_INSTRUCTIONS`) | Curated: Stripe billing, PostHog usage, drafts, account health |

The `alex` ID is retained for backwards compatibility while the founder-facing identity is the unified "Allel". Henry's scope deliberately isolates web research from direct business writes; his Gmail access is read-and-draft only, with no send tool.

---

## Live entry points

| Endpoint | Purpose |
| :--- | :--- |
| `POST /api/agent?agentId=alex\|henry\|sarah` | Streaming founder chat |
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

## Tool surface

`ALL_TOOLS` in `agent.ts` registers **136 tools**. Families:

- workspace and account reads (`getAccountDetails`, `getAllAccounts`, `getAccountTimeline`, `getRecentSignals`, `resolveAccountByContact`, `getChurnScoreHistory`)
- account-state writes (`updateAccountRisk`, `createSignal`, `resolveSignal`, `addTimelineEvent`, `updateAccountInfo`, `addAccountNote`, `archiveAccount`, contacts)
- draft lifecycle (`generateFollowUpDraft`, `getExistingDrafts`, `rejectDraft`, `updateDraftContent`)
- Gmail read / reply / compose
- Slack read, post, thread, react, pin, schedule, bookmark
- Stripe billing, subscriptions, refunds, disputes, coupons, rescue discounts
- PostHog persons, events, insights, cohorts, annotations, feature flags
- Intercom conversation workflows
- HubSpot CRM contacts, companies, deals, notes
- Linear issue actions
- Sentry issue actions
- Notion read / write / comment
- Airtable read / write
- Google Calendar read / write / free-busy
- Google Docs search / read / create — registered even though the catalog marks `google_docs` as `planned`
- provider sync triggers (`syncStripeWorkspaceTool` and seven siblings), `deliverSlackBriefTool`, `buildDailyBriefFromLiveState`
- web research via Tavily (`webSearchTool`, `webExtractTool`, `webCrawlTool`, `webMapTool`)

Filtering is layered: persona allowlist → optional workflow-stage allowlist → prompt-relevance narrowing (`selectRelevantToolsForPrompt`, which returns the full available set when fewer than six domain tools match). `runtime-context.ts` then names the exact tool surface in the prompt so the model does not reach for a tool that was filtered out.

### What the agent loop cannot do

`approveDraft` and `sendApprovedDraft` tool definitions exist in `tools.ts` but are **not registered in `ALL_TOOLS`**, so no persona can reach them. `runtime-context.ts` also lists them, plus `createBriefItem` and `updateBriefSummary`, as forbidden actions in every run. The enforcement is in the data layer, not the prompt: `approveDraftForActor()` and `sendDraftForActor()` in `web/src/lib/drafts/draft-workflows.ts` both fail when `actor === 'agent'`, and send additionally requires status `ready_to_send` plus founder approval provenance (`approved_at` and `approved_by_actor`).

The generic chat-mode approval interceptor is **currently inert**: `MANUAL_APPROVAL_REQUIRED_TOOL_NAMES` in `agent.ts` is an empty array, with an in-code comment stating it is disabled until the dashboard approval UI is finished. `approval-store.ts`, `tool_approval_requests`, and `/api/agent/approvals` are wired and functional, but no tool currently routes through them. Draft send stays gated regardless.

---

## Workflow stages

Automated work decomposes into `detect → analyze → draft → verify`. Daily review, Stripe follow-up, and PostHog follow-up all use the same four stages, each stage carrying workflow metadata into `agent_runs`.

`WORKFLOW_STAGE_TOOL_ALLOWLISTS` in `workflows.ts` enforces scope in code, not prompt text:

| Stage | Allowed tools |
| :--- | :--- |
| `detect` | `READ_ONLY_WORKFLOW_TOOLS` |
| `analyze` | read-only + `ANALYZE_WRITE_WORKFLOW_TOOLS` (risk, signals, timeline, account info, notes, contacts) |
| `draft` | read-only + `DRAFT_WRITE_WORKFLOW_TOOLS` (`generateFollowUpDraft`, `rejectDraft`, `updateDraftContent`) |
| `verify` | `READ_ONLY_WORKFLOW_TOOLS` |

Webhook follow-up jobs are scheduled with Next.js `after()` **before** the event is marked processed, so a failure to register does not silently drop the follow-up. Stage failures are logged as their own `agent_runs` rows under the same `workflow_id`.

---

## Chat trust boundaries

The browser can send user messages. It cannot define trusted assistant state.

`sanitizeClientUiMessages()` in `ui-message-utils.ts`:
- accepts only `user` and `assistant` roles — client `tool` and `system` messages are dropped outright, so there is no client-supplied tool history
- accepts every well-formed `user` message
- accepts an `assistant` message only when its `metadata.trustedHistory` carries `version: 1`, a `workspaceId` and `personaId` matching the current request, and an HMAC-SHA256 signature over `workspaceId : personaId : messageId : sha256(canonical id+role+parts)`
- normalizes object key order before hashing, so re-serialization by the browser does not break a valid signature
- backfills `parts` from a legacy `content` string when needed, then rejects anything still partless

`buildTrustedMessageMetadata()` signs assistant messages on the way out, so the next turn can trust them. Two things to know about the secret: it is `AGENT_HISTORY_SIGNING_SECRET`, **falling back to `OPENAI_API_KEY`** when unset, and the comparison is a plain `===` rather than a constant-time compare.

Workspace identity, persona resolution, memory context, and the runtime contract are all injected server-side after sanitization. The chat route resolves the conversation session ID server-side via `resolveAgentConversationSessionId()` in `chat-session.ts`; client storage keys are scoped by user + workspace + session (`buildAgentChatStorageScope`, `buildAgentChatId`, storage version `v3`).

---

## Memory

### Chat memory — `chat-memory.ts`

Server-side conversation persistence in `agent_conversations`, unique on `(workspace_id, user_id, persona_id, session_id)`:
- bounded trailing transcript, `MAX_PERSISTED_AGENT_MESSAGES = 40`
- compacted rolling summary, `MAX_COMPACTED_SUMMARY_CHARS = 1800`
- account context: up to `MAX_COMPACTED_ACCOUNT_IDS = 4` mentioned account IDs and `MAX_COMPACTED_GOALS = 3` recent user goals, plus assistant commitments
- `mergeConversationHistory()` reconciles trusted client history with server history; `buildConversationMemorySystemPrompt()` turns the snapshot into prompt text

This is heuristic summary memory, not semantic retrieval.

### Account memory — `account-memory.ts`

- `account_memories` stores account summaries, key signals, open loops, and recent timeline context.
- Personas retrieve it through the `getAccountMemory` tool.
- Touched-account refreshes are enqueued in `account_memory_refresh_queue` and processed with bounded concurrency, rather than a full-workspace `Promise.all` fan-out.
- Refresh is triggered after syncs, webhooks, draft actions, and account-level writes.

Deterministic snapshotting, not learned reasoning memory.

---

## What is genuinely agentic

- the model chooses tools
- it chains multiple steps in one run (up to 25)
- it operates in chat, cron, and webhook contexts
- personas change both behavior and tool access
- workflow jobs carry durable context between stages through live state and memory

Still **v1 agentic**. Not present:
- planner / executor split
- verifier / critic loop beyond the verify-stage prompt
- subagents
- any UI for replaying tool traces
- long-horizon semantic memory

---

## Current constraints

- Model selection is not per-run. `resolveAgentModelId()` ignores its `personaId`, `runType`, and `channel` arguments and returns `process.env.OPENAI_MODEL_ID || 'gpt-5.6'`. The `AGENT_CHAT_MODEL_ID` / `AGENT_AUTOMATION_MODEL_ID` constants in `agent.ts` are declared but never routed by run type. Deterministic helpers in `lib/ai/ai.ts` separately default to `gpt-4o`.
- Chat boot is local-first. The server persists and compacts history, and `/api/agent/history` exists, but the UI restores from browser storage on load.
- Conversation compaction is heuristic; account memory is deterministic snapshotting.
- **Run inspection has no UI.** The APIs and grouping are live, but `web/src/app/dashboard/flows/page.tsx` is a 7-line placeholder rendering an empty div. The 782-line `components/dashboard/flows-page.tsx` implementation was deleted in the 2026-08-21 cleanup. Inspecting a run today means calling the API directly.
- External text-heavy tools pass through `external-content.ts` labeling but are not hardened end to end.
- The chat-mode approval interceptor is disabled (see above).

---

## Next priorities

1. Build a run-inspection UI on `/dashboard/flows` against the existing `/api/agent/runs` APIs. There is currently no UI at all, so this is a build, not a deepening.
2. Hydrate chat from `/api/agent/history` on initial load instead of relying on browser storage.
3. Make model selection deliberate by persona and run type, or delete the unused model constants.
4. Re-enable the tool approval interceptor once the approval UI exists.
5. Deepen memory beyond compact summaries and account snapshots.

---

## Bottom line

A real persona-based operator layer with signed chat history, compacted memory, durable account context, staged workflow jobs, and founder-gated outbound approval — with observability that exists in the backend and not yet in the product.

**A hybrid SaaS operator system with one strong agent runtime, persona specialization, durable state, and backend-only workflow observability.**
