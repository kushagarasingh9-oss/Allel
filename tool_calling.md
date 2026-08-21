# Allel Reliable Tool-Calling & Execution Architecture

> **Document Type:** System Architecture, Execution Lifecycle & Reliability Contract  
> **Status:** Active & Authoritative  
> **Last Updated:** 2026-08-22  
> **Synthesizes:** Agent Tool Calling & Routing · Integration Honesty Audit · Product Definition

---

## 1. Executive Summary & The Three Invariants

"Tool calling never fails" is not a single keyword fix — it is **three separable invariants** enforced by code:

| Invariant | Meaning | How Allel Enforces It |
|---|---|---|
| **G1 — No False Negatives** | Never tell the founder a capability doesn't exist when it does | Layer 0 `ProviderReadiness` + Layer 2 Multi-Signal Fuzzy Routing |
| **G2 — No False Positives** | Never pretend a call succeeded or invent placeholder data when an API failed | Strict `ToolResult<T>` + Layer 3 Live Integration Guarding |
| **G3 — No Dead Ends** | Never let a needed tool stay missing from a turn with no recovery path | **`requestMoreTools` Meta-Tool** + Multi-Layer Fallback |

---

## 2. Complete End-to-End Execution Flow

```
                                 User Prompt
                       "check mails and calender"
                                     │
                                     ▼
 ┌───────────────────────────────────────────────────────────────────────────┐
 │ STEP 1: HTTP Ingestion & Windowing (route.ts)                             │
 │ - Retains recent conversation turns & creates plain text `conversationText`│
 └───────────────────────────────────┬───────────────────────────────────────┘
                                     │
                                     ▼
 ┌───────────────────────────────────────────────────────────────────────────┐
 │ STEP 2: Layer 2 Multi-Signal Domain Router (agent.ts)                     │
 │                                                                           │
 │ 1. Always-on Core Tools (inspectIntegrations, account state, drafts: 7)    │
 │ 2. Exact Domain Regex Match (0ms)                                         │
 │ 3. Levenshtein Fuzzy Match (dist <= 2) on unmatched words (0ms)            │
 │ 4. Per-Domain Independent Scoring (Gmail match NEVER drops Calendar)      │
 │ 5. Persona Capability Mask (Alex = All, Henry = Growth, Sarah = Save)     │
 │ 6. Unpack to Scoped Schema Set (~18 Tools)                                │
 └───────────────────────────────────┬───────────────────────────────────────┘
                                     │ Scoped Schema Set (~18 Tools)
                                     ▼
 ┌───────────────────────────────────────────────────────────────────────────┐
 │ STEP 3: Layer 3 Self-Healing Execution Loop (route.ts / tools.ts)         │
 │                                                                           │
 │ - ToolLoopAgent executes with scoped tools + `requestMoreTools` meta-tool │
 │ - If model discovers it needs an unlisted domain (e.g., Stripe/Calendar): │
 │   Calls `requestMoreTools({ domain: 'stripe' })` -> Expands active schema  │
 │ - Guard wraps all calls: verifies `ProviderReadiness.status === 'ready'`  │
 │ - Strict `ToolResult<T>`: Returns real data or structured error           │
 └───────────────────────────────────┬───────────────────────────────────────┘
                                     │
                                     ▼
 ┌───────────────────────────────────────────────────────────────────────────┐
 │ STEP 4: Streaming UI & Trust Surface (agent-feed / timeline-nodes)        │
 │                                                                           │
 │ - Renders executive summary + clean expandable thinking blocks            │
 │ - Detects announced-action mismatches                                     │
 │ - HMAC signs message metadata for tamper-proof persistence                │
 └───────────────────────────────────────────────────────────────────────────┘
```

---

## 3. The Five Architectural Layers

### Layer 0 — The Provider Readiness Contract (G1 + G2 Foundation)

Every provider must answer "is this connected and healthy?" through a single unified contract:

```ts
export type ProviderMode = 'syncable' | 'tool_only' | 'planned'
export type ReadinessStatus = 'ready' | 'degraded' | 'needs_attention' | 'not_connected' | 'planned'

export interface ProviderReadiness {
  provider: string
  workspaceId: string
  mode: ProviderMode
  status: ReadinessStatus
  authValid: boolean                 // set ONLY by a live provider probe
  scopes: string[] | null
  resolvedResource?: { id: string; label: string }   // e.g. verified Slack channel ID
  lastVerifiedAt: string | null
  verificationTTL: number            // ms before status must be re-probed
  lastInboundSyncAt?: string | null
  lastOutboundDeliveryAt?: string | null
  failureReason?: { code: string; message: string; remediation: string }
}
```

**Readiness Invariants:**
- **INV-1:** `status: 'ready'` requires a successful provider API probe within `verificationTTL`. Storing an arbitrary token string is never sufficient.
- **INV-2:** Token-prefix heuristics (`xoxb-`, `sk_test_`) may pre-filter requests but cannot set `authValid: true` without an API test (`auth.test`).
- **INV-3:** Any decryption or auth failure resolves strictly to `not_connected` or `needs_attention`. Synthesizing placeholder credentials is forbidden.
- **INV-4:** `resolvedResource` (e.g. Slack channel ID) is verified via provider lookups, never assumed from user text input.

---

### Layer 1 — Data Availability & Sync Honesty

#### A. Ingest vs. Deliver Separation
- **`ingest(provider)`**: Pulls third-party data into normalized storage. Updates `lastInboundSyncAt`.
- **`deliver(provider, payload)`**: Pushes founder briefs or alerts outwards (e.g. Slack messages). Updates `lastOutboundDeliveryAt`. A delivery failure **never** marks the connection un-synced or broken.

#### B. Strict Tool Result Shape
```ts
export type ToolResult<T> =
  | { ok: true; data: T; dataSource: 'live_provider_api' | 'workspace_cache' }
  | { ok: false; error: { code: string; message: string; remediation?: string }; dataSource: 'connection_guard' }
```
No tool implementation may catch an API error and hand back a synthetic success message (e.g. "Monitoring active channels").

#### C. Asymmetric Treatment for Tool-Only Providers
Tool-only providers (Calendar, Notion, Airtable) have no persistent database copy. Therefore:
1. In Layer 2 routing, tool-only providers use a lower threshold for inclusion so they are never prematurely pruned.
2. Hot paths (e.g. daily founder brief needing upcoming 7-day calendar events) use a short-TTL (15–30 min) cached snapshot.

---

### Layer 2 — Multi-Signal, Readiness-Aware Routing

Instead of a single boolean gate (`hasRoutingSignal`) that drops Calendar when Gmail matches, Layer 2 evaluates every domain **independently**:

```
[User Prompt]
      │
      ├── 1. Regex Token Matcher (Fast path for exact keywords)
      ├── 2. Levenshtein Fuzzy Matcher (dist <= 2 on words > 3 chars)
      │      - "calender" -> dist 1 to "calendar" -> MATCH google_calendar
      │      - "gamil"    -> dist 1 to "gmail"    -> MATCH gmail
      │      - "strpi"    -> dist 1 to "stripe"   -> MATCH stripe
      ├── 3. Independent Domain Scoring (Gmail match never suppresses Calendar)
      ├── 4. Persona Capability Mask (Alex = All, Henry = Growth, Sarah = Save)
      └── 5. Fallback: If 0 domains match -> Load all persona tools
```

#### Domain Groups Registry
- **`google_calendar`**: `calendar`, `calender`, `calndr`, `gcal`, `schedule`, `meetings`, `events`, `availability`
- **`gmail`**: `email`, `emails`, `mail`, `mails`, `gmail`, `gamil`, `mial`, `inbox`, `drafts`, `threads`
- **`stripe`**: `stripe`, `strpi`, `strip`, `billing`, `mrr`, `churn`, `revenue`, `invoice`, `subscriptions`
- **`notion`**: `notion`, `knowledge`, `knowlege`, `docs`, `wiki`, `notes`, `pages`, `database`
- **`posthog`**: `posthog`, `analytics`, `usage`, `insights`, `cohorts`, `funnels`, `feature flags`
- **`linear`**: `linear`, `issues`, `bugs`, `tickets`, `tasks`, `projects`, `kanban`
- **`slack`**: `slack`, `channels`, `messages`, `team`, `chat`, `dms`
- **`intercom`**: `intercom`, `support`, `conversations`, `tickets`
- **`hubspot`**: `hubspot`, `crm`, `deals`, `contacts`, `pipelines`
- **`sentry`**: `sentry`, `errors`, `crashes`, `exceptions`, `releases`
- **`airtable`**: `airtable`, `bases`, `tables`, `records`
- **`web_research`**: `search`, `web`, `google`, `crawl`, `scrape`

---

### Layer 3 — Self-Correcting Execution Loop & In-Loop `prepareStep` Expansion

The ultimate failsafe for Invariant G3 is the **`requestMoreTools` meta-tool + AI SDK `prepareStep` orchestration**:

```ts
// 1. Meta-tool records domain request within persona/workflow authorization ceiling
export function createRequestMoreToolsTool(eligibleToolNames: readonly AgentToolName[]) {
  return tool({
    description:
      'Request an integration domain needed to finish this task. The orchestration loop activates permitted tools from that domain on the next reasoning step. Continue the task after this result.',
    inputSchema: z.object({
      domain: z.enum(TOOL_DOMAINS),
      reason: z.string().min(1).max(240),
    }),
    execute: async ({ domain }) => {
      const activatedTools = getEligibleToolsForDomains(eligibleToolNames, [domain])

      return activatedTools.length > 0
        ? { ok: true, status: 'expansion_requested', domain, activatedTools }
        : {
            ok: false,
            status: 'outside_policy',
            domain,
            activatedTools: [],
            message: 'This persona or workflow is not permitted to use that domain.',
          }
    },
  })
}

// 2. Pure step expansion in ToolLoopAgent without cross-request state leakage
prepareStep: async ({ steps }) => {
  if (!isChat) return undefined

  const requestedDomains = resolveRequestedToolDomains(steps)
  if (requestedDomains.length === 0) return undefined

  const stepActiveNames = resolveActiveToolNamesForStep(
    initialToolNames,
    eligibleToolNames,
    requestedDomains
  )
  const fullActiveTools = [...new Set([...stepActiveNames, 'requestMoreTools'])]
  const updatedInstructions = buildInstructionsForActiveTools(fullActiveTools)

  return {
    activeTools: fullActiveTools,
    system: updatedInstructions,
  }
}
```

**How It Works:**
1. The `ToolLoopAgent` holds all persona-eligible tool definitions internally, but sends only the scoped `activeTools` schema subset to the model on step one.
2. If an ambiguous or multi-step prompt needs another domain (e.g. starts with support, discovers billing churn), the model calls `requestMoreTools({ domain: 'stripe', reason: '...' })`.
3. Between reasoning steps, `prepareStep` inspects tool calls in `steps`, expands `activeTools` with eligible tools for the requested domain, and updates system instructions dynamically.
4. The model immediately receives the newly active schemas in the same tool loop turn without restarting the HTTP stream.

---

### Layer 4 — UI Trust Surface & Workflow Visibility

1. **Settings Connection Health**: `/dashboard/settings` renders `ProviderReadiness` directly, displaying verified timestamps, active scopes, and actionable remediation instructions (e.g. *"Reconnect Slack — missing channels:history scope"*).
2. **Execution Inspection**: Guard blocks, model retry/fallbacks, and `requestMoreTools` expansion events are recorded in `agent_runs`, providing full visibility into agent reasoning and security decisions.

---

## 4. Test & Verification Matrix

| Scenario | Prior Behavior | Shipped Architecture Behavior | Status |
|---|---|---|---|
| `"now chekmy emials and the calandar togragther"` | Calendar/Gmail dropped due to typos | Adaptive Levenshtein ($\le 2$) + regex matches both Gmail + Calendar | ✅ Verified in `agent.test.ts` |
| Ambiguous chat prompt needs un-routed domain | Model apologized ("tool not loaded") | Model calls `requestMoreTools` and `prepareStep` activates domain in-turn | ✅ Verified in `agent.test.ts` |
| Ineligible domain requested under policy ceiling | Model assumed arbitrary permissions | Tool returns `outside_policy` and `activeTools` rejects expansion | ✅ Verified in `agent.test.ts` |
| Transient upstream 500 / timeout | Crashed turn with error banner | `maxRetries: 3` + `AGENT_FALLBACK_MODEL_ID` failover attempt | ✅ Verified in `agent.test.ts` |
| Revoked token during chat execution | Returned mock text / silent fail | Guard catches 401, marks `needs_attention`, returns clean error | ✅ Verified in `integration-health.test.ts` |
| Slack brief delivery fails | Marked entire workspace un-synced | Delivery failure logged; inbound sync state preserved | ✅ Layer 1 Invariant |
| Sarah handles high-risk churn account | Global routing might omit billing | Persona-weighted threshold prioritizes Stripe/Intercom/HubSpot | ✅ Persona Masking |

---

## 5. Phased Implementation Roadmap

- [x] **Phase 0 — Stop Fake Data & Remove Dead Code** (Completed).
- [x] **Phase 1 — Typo-Resilient Regex & Regression Suite** (Completed in `agent.ts`).
- [x] **Phase 2 — Adaptive Levenshtein Fuzzy Matcher & Independent Domain Scoring** (Completed in `agent.ts`).
- [x] **Phase 3 — `requestMoreTools` & `prepareStep` In-Loop Schema Expansion** (Completed in `agent.ts` and `route.ts`).
- [ ] **Phase 4 — Unified `ProviderReadiness` Contract & Settings Surface** (Next backlog phase).
