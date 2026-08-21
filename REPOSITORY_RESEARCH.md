# Allel Repository Research

> Comprehensive repository assessment
> Reviewed: 2026-08-06
> Scope: application source, API routes, agent runtime, integrations, frontend, tests, configuration, all Supabase migrations, and root documentation

---

## Executive Summary

This repository contains a substantial B2B SaaS retention-operations product called **Allel**. It connects billing, product analytics, communication, support, CRM, and engineering systems; normalizes their data into customer-account state; scores retention risk; prepares evidence-backed actions and follow-up drafts; and exposes those operations through an AI-assisted founder console.

The product is beyond a prototype. It has a real multi-tenant data model, authentication, provider integrations, deterministic scoring and brief generation, staged AI automation, durable memory, approval records, outcome tracking, and run inspection. However, it is not production-complete. The most important remaining issues concern tenant authorization, approval integrity, migration reliability, webhook recovery, frontend wiring, and operational scalability.

Current validation (re-run 2026-08-22):

- Test suite: **118 tests passed, 0 failed** (`npm test` in `web/`).
- Type check: `npx tsc --noEmit` is clean (0 errors, exit 0).
- Tool loop & router: TC-1 adaptive Levenshtein fuzzy matching and TC-2 in-loop `prepareStep` dynamic expansion are live and passing all test suites.
- Several backend APIs (such as grouped workflow inspection `/api/agent/runs`) are fully functional and awaiting dedicated frontend screens.

---

## Product Definition

The clearest product description is:

> An AI retention operator for B2B SaaS founders that identifies at-risk accounts, explains the evidence, prepares prioritized actions and drafts, and keeps consequential outbound actions behind human approval.

The strongest initial product wedge is retention rescue for small SaaS companies that do not yet have a mature customer-success organization.

### Main product capabilities

- Connect provider accounts and validate credentials.
- Ingest billing, usage, email, support, CRM, Slack, error, and issue data.
- Normalize external data into accounts, contacts, signals, and timelines.
- Calculate account risk deterministically.
- Maintain compacted conversation memory and durable account memory.
- Run chat, cron, and webhook-triggered AI workflows.
- Generate follow-up drafts and founder briefs.
- Require founder approval before stored drafts are sent.
- Record workflow runs, costs, stages, failures, and outcomes.

### Product maturity

The backend is a credible v1. The frontend contains a polished primary chat surface and several live operational pages, but some important functionality remains disconnected or cosmetic. The largest gap is not basic feature existence; it is making the system consistently secure, inspectable, reliable, and clearly wired end to end.

---

## Technology Stack

### Application

- Next.js 15.5 App Router
- React 19.1
- TypeScript
- Tailwind CSS 4
- shadcn/Base UI/Radix UI primitives
- AI SDK 6 and `@ai-sdk/openai` (with Azure OpenAI deployment support & endpoint normalization)
- Supabase SSR and Supabase JavaScript SDK
- Direct provider API credentials, plus Google OAuth for Gmail and Calendar.
- Zod for runtime validation
- Stripe SDK
- Tavily for web research

### Infrastructure and persistence

- Supabase authentication
- PostgreSQL with Row Level Security
- Vercel-oriented Next.js deployment and cron configuration
- Encrypted integration credentials using AES-256-GCM

### Testing and quality

- Node test runner through `tsx --test` (118 automated tests passing)
- ESLint 9 with Next.js rules

---

## Repository Layout

### Root documentation

> Documentation was consolidated on 2026-08-22.

- `ALLEL.md` — canonical whole-system architecture, product definition, and ICP map (absorbed `ALLEL_COMPLETE_GUIDE.md`).
- `AGENT.md` — agent-layer specifics: personas, tools, workflow stages, chat trust boundaries, memory.
- `PRODUCT_COMPLETION_PLAN.md` — practical completion plan and backlog.
- `TODO.md` — authoritative fix brief and implementation roadmaps.
- `INTEGRATION_AUDIT.md` — provider-by-provider integration audit.
- `tool_calling.md` — in-loop `prepareStep` and fuzzy domain routing architecture.
- `REPOSITORY_RESEARCH.md` — comprehensive repository assessment.

### Application

The Next.js application lives in `web/`.

Important directories:

- `web/src/app` — pages, layouts, server actions, and API routes.
- `web/src/components` — active UI, prototypes, and design primitives.
- `web/src/lib/agent` — agent runtime, tools, workflows, memory, approvals, and logging.
- `web/src/lib/integrations` — provider clients, sync jobs, token access, and connection health.
- `web/src/lib/engine` — scoring, score history, compound signals, and action selection.
- `web/src/lib/drafts` — draft lifecycle, sending, and outcome tracking.
- `web/src/lib/briefs` — deterministic brief generation and email delivery.
- `web/src/lib/dashboard` — dashboard projection and retained mock types/data.
- `web/src/lib/supabase` — browser, server, service-role, and middleware clients.
- `web/src/lib/workspaces` — workspace provisioning and selection.
- `web/src/lib/security` — validation and process-local rate limiting.

### Database

Database migrations live in `supabase/migrations/`. Sixteen migrations were inspected, from the initial April product schema through July tool approval requests.

---

## System Architecture

The system is a **retention-operations backend plus founder/operator console**.

### 1. Authentication and workspace layer

Supabase authenticates users. Dashboard routes verify the user in `web/src/app/dashboard/layout.tsx`. Workspace provisioning and preferred-workspace selection are handled in `web/src/lib/workspaces/ensure-workspace.ts`.

The intended tenancy rule is that users can access rows belonging to workspaces where they have a `workspace_members` record. Service-role operations bypass RLS and therefore depend on explicit workspace predicates in application code.

### 2. Integration catalog and connection layer

`web/src/lib/integrations/catalog.ts` categorizes providers as syncable, tool-only, or planned. Connection state is stored separately from encrypted credentials.

Implemented synchronization or operational surfaces include:

- Stripe
- PostHog
- Gmail
- Intercom
- HubSpot
- Slack
- Sentry
- Linear

Tool-oriented surfaces include Notion, Airtable, Google Calendar, and web research. The documented catalog and SQL provider constraints are not fully aligned.

### 3. Ingestion layer

Provider synchronizers normalize external records into product tables rather than making the agent reason over raw provider state on every operation.

Ingestion writes include:

- customer accounts
- contacts and external identities
- account signals
- account timeline events
- connection health and sync metadata
- account-memory refresh requests

Stripe and PostHog also enter through verified webhook routes.

### 4. Normalized product state

Primary operating entities include:

- workspaces and memberships
- integration connections and tokens
- customer accounts
- contacts, signals, and timeline events
- risk score history
- drafts and draft outcomes
- founder briefs and brief items
- agent runs and conversations
- account memories and refresh queue
- tool approval requests

### 5. Deterministic risk and brief layers

Risk scoring is deterministic. `web/src/lib/engine/score-engine.ts` computes a 100-point model using billing, usage, engagement, support, communication, and renewal factors.

Founder brief generation is also deterministic. `web/src/lib/briefs/generate-workspace-brief.ts` is intended to be the canonical brief writer. Agents update live state and drafts; they do not directly own automated brief records.

### 6. Agent runtime

`web/src/lib/agent/agent.ts` uses an AI SDK 6 `ToolLoopAgent` with a maximum of 25 steps (`stopWhen: stepCountIs(25)`), `maxRetries: 3`, and `resolveAgentFallbackModelId`. The repository retains persona concepts for Alex, Henry, and Sarah, while the founder-facing UI is moving toward a unified Allel identity.

The tool universe spans 136 registered tools. The runtime uses a 3-guarantee self-correcting execution loop:
- **Zero false negatives**: Adaptive Levenshtein fuzzy domain routing (dist $\le 1$ for 4–5 chars, dist $\le 2$ for 6+ chars) ensures typos and compound prompts cleanly route to the relevant domain tools.
- **Zero false positives**: `wrapToolWithLiveIntegrationGuard` wraps all provider tools to block fabricated success responses on auth/connection failures.
- **Zero dead ends**: The `requestMoreTools` meta-tool and AI SDK 6 `prepareStep` dynamically expand the agent's `activeTools` schema subset in-loop on subsequent steps without restarting the HTTP response stream.

Model resolution supports both standard OpenAI and Azure OpenAI endpoints (with automatic URL normalization in `web/src/lib/ai/ai.ts`). Deterministic AI helpers default to `'gpt-4o'`, while primary chat defaults to `process.env.OPENAI_MODEL_ID || 'gpt-5.6'`.

### 7. Workflow orchestration

`web/src/lib/agent/workflows.ts` decomposes automated work into four stages:

1. `detect`
2. `analyze`
3. `draft`
4. `verify`

Each stage has a backend-enforced allowlist. Read-heavy phases cannot inherit unrestricted write tools merely because a prompt asks them not to write.

### 8. Observability

`agent_runs` stores chat, sync, webhook, cron, draft, and workflow-stage execution records. Normalized fields include workflow ID, stage, persona, provider, parent run, retry count, errors, model usage, duration, and cost.

`web/src/lib/agent/run-inspection.ts` groups runs into workflow-level inspection records and supports workflow pagination.

---

## Runtime Paths

### Founder chat

`POST /api/agent`

Typical flow:

1. Authenticate user.
2. Resolve the server-owned workspace.
3. Sanitize client messages.
4. Accept user turns and only signed assistant history.
5. Resolve the conversation session.
6. Load persisted transcript, compacted summary, and account context.
7. Inject trusted runtime context server-side.
8. Stream the agent run.
9. Sign trusted assistant metadata.
10. Persist compacted conversation state and run logs.

### Daily automation

`GET /api/cron/daily-run`

Typical flow:

1. Validate `CRON_SECRET`.
2. Iterate workspaces.
3. Synchronize connected providers with health updates.
4. Process queued account-memory refreshes.
5. Run staged AI jobs when OpenAI is configured.
6. Rebuild the deterministic founder brief.
7. Deliver configured email or Slack notifications.
8. Measure eligible draft outcomes.
9. Record workflow stages and failures.

### Stripe/PostHog webhooks

Typical flow:

1. Verify signature and parse the event.
2. deduplicate or record webhook state.
3. Resolve workspace/account identity.
4. Update normalized state.
5. Queue or refresh account memory.
6. Refresh the brief.
7. Register follow-up AI work through Next.js `after()`.
8. Log workflow stages.

### Draft approval and send

The central draft workflow code requires a stored draft to carry founder approval provenance before sending. Agents cannot directly approve or send stored follow-up drafts. Consequential provider tools in chat create durable approval requests rather than executing immediately.

---

## Agent Trust Boundaries

### Browser trust

The browser may provide user messages, a selected session, and UI convenience state. It must not define:

- workspace identity
- trusted assistant history
- tool history
- server memory
- approval provenance

Assistant history is HMAC-signed and scoped to workspace, persona, message ID, and content.

### External content

Text from Gmail, Slack, Intercom, Notion, and web research is sanitized and explicitly labeled as untrusted external content before model use. Source-aware inspection is still incomplete.

### Integration state

A stored token is not sufficient authorization. Tool execution checks that the matching integration connection is explicitly healthy and connected. Legacy demo connections should be rejected by backend guards.

### Outbound actions

Agents cannot founder-approve stored drafts. Approval-required third-party mutations are wrapped as durable requests. This is the right architectural direction, but implementation weaknesses remain in workspace binding and atomic execution.

---

## Database Schema

If all migrations apply, the repository defines 21 application tables.

### Tenancy

- `workspaces`
- `workspace_members`

### Integrations and ingestion

- `integration_connections`
- `integration_tokens`
- `webhook_events`

### Account state

- `customer_accounts`
- `account_contacts`
- `account_signals`
- `account_timeline`
- `account_memories`
- `account_memory_refresh_queue`

### Scoring

- `churn_scores`
- `churn_score_factors`
- `score_snapshots`

### Drafts and briefs

- `follow_up_drafts`
- `draft_outcomes`
- `founder_briefs`
- `founder_brief_items`

### Agents

- `agent_runs`
- `agent_conversations`
- `tool_approval_requests`

### Important schema characteristics

- Most tables carry a direct `workspace_id`.
- RLS usually checks membership through that workspace ID.
- Several child records also point at workspace-owned parents, but composite foreign keys do not prove that the direct workspace and parent workspace match.
- `set_updated_at()` is the only custom trigger function.
- Multiple entities use JSONB for provider metadata, evidence, factors, conversation state, and workflow metadata.

---

## Frontend Architecture

### Active routes

- `/` redirects to `/dashboard`.
- `/dashboard` hosts the current founder chat experience.
- `/dashboard/accounts` shows live account data.
- `/dashboard/accounts/[id]` loads account detail, signals, contacts, drafts, and timeline.
- `/dashboard/drafts` exposes draft review and send workflows.
- `/dashboard/settings` exposes integration state and connection flows.
- `/dashboard/flows` currently renders an empty placeholder.
- `/dashboard/inbox` currently renders an empty placeholder.
- `/auth/login` provides email magic-link login.

### Chat state

The current chat implementation uses:

- AI SDK streaming.
- scoped `sessionStorage` message persistence.
- server history hydration.
- browser-only recent-conversation history in `localStorage`.

The UI can render text, reasoning, tool calls, tool results, integration failures, and approval cards. However, some controls remain cosmetic or incomplete.

### Design system

The active visual system is a dark, glass-like operator console using near-black surfaces, translucent borders, rounded panels, status colors, and animation. Tailwind, shadcn, Base UI, Radix, Motion, Lucide, Tabler, and provider icon libraries are mixed.

The repository also retains several alternative or prototype component systems, making it unclear which components are authoritative.

---

## Test and Build Assessment

### Tests

Command:

`cd web && npm test`

Result on 2026-08-06:

- 63 tests
- 63 passed
- 0 failed
- 0 skipped

Strongest coverage areas:

- chat storage scoping and trusted history
- conversation merging, trimming, and compaction
- agent tool filtering and cost estimation
- workflow stage decomposition and allowlists
- draft approval and send invariants
- integration connection health
- Gmail classification and bootstrap logic
- run-inspection grouping and pagination
- workspace selection
- external-content sanitization

Important missing coverage:

- cron route behavior
- Stripe and PostHog webhook route behavior
- OAuth callbacks and CSRF state
- approval route concurrency
- brief generation failure recovery
- scoring/history production wiring
- outcome measurement
- browser accessibility and responsive behavior
- full end-to-end workflows

### Production build

Command:

`cd web && npm run build`

Observed result:

- Next.js optimized source compilation succeeds.
- ESLint then fails the build.
- Seven blocking `@typescript-eslint/no-explicit-any` violations are in `src/components/agent-feed/agent-feed.tsx`.
- There are many non-blocking warnings for unused imports/state, raw `<img>` elements, stale prototypes, and hook dependencies.

---

## High-Priority Findings

### P0 — Tenant and authorization security

#### Workspace self-enrollment

The `workspace_members` insert policy allows an authenticated user to insert a membership for themselves without requiring an invitation or privileged actor, and it does not safely restrict the requested role. A user who learns a workspace UUID may be able to enroll themselves and obtain broad workspace access.

Recommended correction:

- Remove open self-membership insertion.
- Provision owner membership through a controlled transaction or security-definer function.
- Add an invitation/admin-managed membership flow.
- Enforce valid role assignment by privileged actors.

#### Cross-workspace integrity

Many tables carry `workspace_id` plus a foreign key to another workspace-owned row, but the database does not ensure both belong to the same workspace. Service-role writes bypass RLS, making application mistakes especially dangerous.

Recommended correction:

- Add composite uniqueness and workspace-aware foreign keys where practical.
- Centralize service-role query helpers.
- Add tests that attempt cross-workspace writes.

#### Integration token exposure

Ordinary workspace members can select encrypted token rows, including ciphertext, IV, and authentication tag. Although the secret is encrypted, client access to these fields is unnecessary.

Recommended correction:

- Remove member SELECT access to token material.
- Expose only safe connection-health projections.

### P0 — Approval integrity

The approval wrapper can trust `workspaceId` inside model-generated tool input instead of replacing it with authenticated runtime context. Stored approval input is later executed as written. This can separate the approval row’s workspace from the mutation’s effective workspace.

Approval and execution also use read-then-update behavior without a conditional atomic transition, making duplicate execution possible under concurrency.

Recommended correction:

- Strip or overwrite workspace IDs from tool input.
- Bind execution to authenticated workspace and actor.
- Use conditional updates or database functions for state transitions.
- Make execution idempotent.
- Restrict approval decisions to explicit privileged roles.
- Prevent mutation of tool name/input after creation.

### P0 — Fresh database migration failure

Migrations are applied lexicographically. `20260424_agent_conversation_sessions.sql` alters `agent_conversations` before `20260424_agent_memory_and_run_logging.sql` creates the table. A clean migration run should fail.

Recommended correction:

- Create a corrective baseline/squash strategy for fresh environments.
- Never rewrite already-applied production migrations without understanding deployment state.
- Add clean-database migration validation to CI.

### P1 — OAuth and webhook reliability

#### Gmail OAuth state

The callback parses an OAuth nonce but does not validate it. Membership checks do not replace CSRF state verification.

#### Stripe subscription mapping

Some subscription events primarily expose a Stripe customer ID. Early workspace resolution relies on email fields, so valid subscription changes can be accepted but ignored before customer-ID-specific handling.

#### Failed webhook acknowledgement

Webhook processing exceptions return HTTP 200. Providers generally will not retry, leaving failed events recorded but unprocessed. No durable replay worker was found.

#### PostHog deduplication and signature comparison

Fallback deduplication can collapse distinct events without timestamp/UUID, and signature comparison uses normal string inequality instead of constant-time comparison.

Recommended correction:

- Validate and expire OAuth state server-side.
- Resolve Stripe workspace from stored external customer IDs before email fallback.
- Return retryable failure codes or implement a durable replay queue.
- Add strong unique event identity.
- Use `timingSafeEqual` for HMAC verification.

### P1 — Scoring and brief correctness

#### Score history appears dormant

Provider synchronizers calculate account scores, but production calls to `recordScoreSnapshot()` were not found. Velocity and compound-signal features may therefore remain inactive.

#### Velocity selects old records

`calculateScoreVelocity()` orders ascending and applies `limit(7)`, selecting the oldest seven snapshots rather than the most recent seven.

#### Two score-history models

Both normalized daily `churn_scores`/`churn_score_factors` and JSON-based `score_snapshots` exist without a clearly defined canonical role. Still open as of 2026-08-21, and one side is now provably dead: `churn_scores` and `churn_score_factors` are read and written by the `getChurnScoreHistory` tool (`tools.ts:2444-2466`), while `score_snapshots` is touched only by `web/src/lib/engine/score-history.ts`, which has no importer outside the equally unreferenced `compound-signals.ts`. Both engine files still exist on disk; they were left in place during the 2026-08-21 cleanup. Either wire them in or delete them and drop the table.

#### Brief replacement is non-transactional

Brief generation upserts the brief, deletes all items, then inserts replacements. Failures or concurrent refreshes can produce empty, partial, or last-writer-dependent output.

Recommended correction:

- Choose and document one canonical scoring-history strategy.
- Wire snapshot recording into successful scoring writes.
- Query the latest snapshots correctly.
- Generate brief state atomically through a transaction/RPC or versioned replacement.

### P1 — Frontend completeness

- `/dashboard/flows` is empty and, since the 2026-08-21 cleanup, there is no `FlowsPage` component either — the 782-line implementation was unreferenced and was deleted. The `/api/agent/runs` APIs it would have consumed are still live, so this is now a build-from-scratch item.
- `/dashboard/inbox` imports intended components but renders none.
- Accounts and drafts are not present in active sidebar navigation.
- Approval cards only update local visual state and do not call the approval API.
- Recent chat history uses browser keys that are not fully user/workspace scoped.
- Session hydration status can remain stale across session changes.
- Title-based history deduplication can discard distinct conversations.
- The avatar renderer ignores the fetched avatar.
- Integration connect can expose a test/demo path in a normal workflow.
- Account-detail query errors are presented as “not found.”

### P1 — Operational scalability

Cron processing is largely serial across workspaces, providers, workflow stages, delivery, and outcome measurement. This will become vulnerable to serverless time limits as tenant volume grows.

The rate limiter is process-local memory and therefore inconsistent across serverless instances.

Recommended correction:

- Move long-running work to durable jobs/queues.
- Add bounded concurrency with per-workspace isolation.
- Add resumable checkpoints and retry semantics.
- Use shared durable rate limiting.

---

## Medium-Priority Findings

### Accessibility and responsive design

- Custom modal lacks proper dialog semantics, focus trapping, Escape handling, and focus restoration.
- Some labels are not associated with controls.
- Streaming and toast updates lack `aria-live` behavior.
- Several icon-only controls lack accessible names.
- Clickable task rows use non-keyboard `<div>` elements.
- Layouts use fixed widths and grids that do not adapt well to narrow screens.
- Continuous animation does not consistently respect reduced-motion preferences.
- Some muted colors may have insufficient contrast.

### Codebase clarity

- Active and obsolete component systems coexist.
- Significant mock and demo data remains next to live types.
- Several controls and tabs are decorative.
- Many unused imports and states generate lint warnings.
- Theme toggling is ineffective because the root forces dark mode.
- Some internal reasoning and raw workflow metadata may be rendered too directly.

### Schema quality

- Duplicate unique indexes exist on integration tokens.
- `draft_outcomes` allows multiple rows per draft without clear intent.
- Approval lifecycle transitions are not database-enforced.
- `score_snapshots` are described as immutable but not protected as immutable.
- `workspace_members.role` exists, but most policies make admin and member operationally equivalent.
- Several later policies omit explicit role targeting.

---

## Documentation Assessment

> **Partially resolved 2026-08-21.** The five overlapping architecture documents were consolidated into `ALLEL_COMPLETE_GUIDE.md`, `ARCHITECTURE.md` and `FRONTEND.md` were deleted after their content was folded in, `AGENT.md` was slimmed to agent-loop specifics, and all 63 stale `/Users/kushagrasingh/dev/agenticworkflow/...` paths were replaced with repo-relative ones. The drift items below that were not addressed by that pass are marked inline.

### Best current sources

- Use `ALLEL_COMPLETE_GUIDE.md` for the whole-system map. It is verified against the working tree and dated.
- Use `AGENT.md` for the agent loop.
- Use `TODO.md` for product direction, with the caveat below.
- Verify all of them against source and migrations before relying on a specific claim.

### Documentation drift

Now covered in `ALLEL_COMPLETE_GUIDE.md`: draft outcome tracking, `score_snapshots`, tool approval requests, and the unified founder-facing Allel direction.

Still open: `TODO.md` repeats some completed work as open work, and its schema and tree examples are only partially corrected.

---

## Environment Configuration

Core variables used by the repository include:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `OPENAI_API_KEY`
- `AGENT_HISTORY_SIGNING_SECRET`
- `ENCRYPTION_KEY`
- `CRON_SECRET`
- `STRIPE_WEBHOOK_SECRET`
- `POSTHOG_WEBHOOK_SECRET`

Feature-specific configuration includes:

- Gmail/Google OAuth client ID, secret, redirect URI, and scope mode
- `STRIPE_SECRET_KEY`
- `TAVILY_API_KEY`
- `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `RESEND_NOTIFICATION_EMAIL`
- `OPENAI_MODEL_ID`, and optionally `AZURE_OPENAI_API_KEY` with `AZURE_OPENAI_ENDPOINT` or `AZURE_OPENAI_BASE_URL`
- `NEXT_PUBLIC_APP_URL` or `VERCEL_URL`

The `PIPEDREAM_*` keys still documented in `web/.env.example` are read by no code.

`ENCRYPTION_KEY` must be exactly 64 hexadecimal characters. If `AGENT_HISTORY_SIGNING_SECRET` is absent, code may reuse `OPENAI_API_KEY`, which is operationally convenient but not ideal key separation.

---

## Recommended Remediation Order

### Phase 1 — Establish safety

1. Fix workspace membership authorization.
2. Bind approvals to server-owned workspace and actor context.
3. Make approval execution atomic and idempotent.
4. Remove client access to encrypted integration-token material.
5. Validate a clean database migration path.
6. Add cross-workspace security tests.

### Phase 2 — Establish reliability

1. Validate Gmail OAuth state.
2. Correct Stripe subscription workspace resolution.
3. Add webhook retries/replay and stronger idempotency.
4. Make founder brief replacement transactional.
5. Wire score history and correct recent-snapshot selection.
6. Introduce durable cron/workflow job processing.

### Phase 3 — Complete active product paths

1. Connect the real flows page.
2. Connect or remove the empty inbox route.
3. Wire approval cards to backend requests.
4. Restore accounts and drafts in navigation.
5. Scope all browser chat history by user and workspace.
6. Fix session switching and hydration behavior.
7. Remove or isolate demo connection behavior.

### Phase 4 — Improve quality

1. Fix the seven build-blocking ESLint errors.
2. Remove dead/prototype component paths.
3. Add route and browser integration tests.
4. Improve accessibility and mobile layouts.
5. Reconcile documentation.
6. Add operational monitoring, structured alerts, and replay tooling.

---

## Safe Backend Editing Rules

Before modifying backend behavior:

- Treat workspace identity as trusted server context only.
- Never accept workspace ownership from model-generated input.
- Remember that the service-role client bypasses RLS.
- Preserve integration health checks in addition to token retrieval.
- Preserve deterministic founder brief ownership.
- Preserve founder-only stored-draft approval and send provenance.
- Check all migrations before assuming a column or constraint exists.
- Prefer atomic conditional transitions for approvals, sends, and webhook states.
- Add route-level tests when changing cron, webhook, OAuth, or approval code.
- Treat `web/src/lib/agent/tools.ts` as a high-risk surface because it mixes local and live-provider mutations.

---

## Important Files for Backend Work

### Agent runtime

- `web/src/lib/agent/agent.ts`
- `web/src/lib/agent/tools.ts`
- `web/src/lib/agent/workflows.ts`
- `web/src/lib/agent/runtime-context.ts`
- `web/src/lib/agent/approval-store.ts`
- `web/src/lib/agent/chat-memory.ts`
- `web/src/lib/agent/account-memory.ts`
- `web/src/lib/agent/run-logger.ts`
- `web/src/lib/agent/run-inspection.ts`
- `web/src/lib/agent/ui-message-utils.ts`

### Integrations

- `web/src/lib/integrations/catalog.ts`
- `web/src/lib/integrations/connection-guard.ts`
- `web/src/lib/integrations/connection-state.ts`
- `web/src/lib/integrations/provider-tokens.ts`
- `web/src/lib/integrations/*-sync.ts`

### Product engine

- `web/src/lib/engine/score-engine.ts`
- `web/src/lib/engine/score-history.ts` — present but unreferenced; see "Two score-history models"
- `web/src/lib/engine/compound-signals.ts` — present but unreferenced
- `web/src/lib/drafts/draft-workflows.ts`
- `web/src/lib/drafts/send-draft.ts`
- `web/src/lib/drafts/outcome-tracker.ts`
- `web/src/lib/briefs/generate-workspace-brief.ts`

### Runtime entry points

- `web/src/app/api/agent/route.ts`
- `web/src/app/api/agent/approvals/route.ts`
- `web/src/app/api/agent/history/route.ts`
- `web/src/app/api/cron/daily-run/route.ts`
- `web/src/app/api/webhooks/stripe/route.ts`
- `web/src/app/api/webhooks/posthog/route.ts`
- `web/src/app/api/drafts/[id]/approve/route.ts`
- `web/src/app/api/drafts/[id]/send/route.ts`

### Data access

- `web/src/lib/supabase/server.ts`
- `web/src/lib/supabase/service.ts`
- `web/src/lib/workspaces/ensure-workspace.ts`
- `supabase/migrations/*.sql`

---

## Final Evaluation

This is a promising and technically ambitious product with a solid core architecture. The repository demonstrates meaningful engineering depth: multi-provider ingestion, normalized state, staged agent workflows, durable memory, human approval boundaries, observability, and outcome-oriented retention logic.

The product should not add much more breadth before addressing its trust and completion gaps. The best path is to harden tenant isolation and approvals, make webhook/cron work recoverable, finish the currently disconnected frontend paths, and prove the retention loop with real customer outcomes.

The codebase is ready for focused backend work, provided security-sensitive changes begin with workspace ownership, service-role scoping, approval atomicity, and migration correctness.
