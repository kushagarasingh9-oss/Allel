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

### Layer 3 — Self-Correcting Execution Loop & `requestMoreTools`

The ultimate failsafe for Invariant G3 is the **`requestMoreTools` meta-tool**.

```ts
export const requestMoreTools = createTool({
  description: 'Dynamically unlock and load tools for an integration domain when needed during execution.',
  parameters: z.object({
    domain: z.enum([
      'google_calendar', 'gmail', 'stripe', 'slack', 'notion',
      'posthog', 'linear', 'intercom', 'hubspot', 'sentry', 'airtable', 'web_research'
    ]),
    reason: z.string().describe('Why this domain is needed to fulfill the founder request')
  }),
  execute: async ({ domain, reason }) => {
    return {
      ok: true,
      domain,
      status: 'unlocked',
      message: `Domain ${domain} tools are now available for subsequent steps in this execution turn.`
    }
  }
})
```

**How It Works:**
1. If the user prompt was ambiguous (e.g. *"Check that user's problem and fix it"*), the agent starts with Core + Support tools.
2. Upon inspecting the user, the agent realizes it is a billing failure.
3. Instead of giving up or outputting *"I don't have billing tools"*, the model calls `requestMoreTools({ domain: 'stripe' })`.
4. The system expands the active execution schema and completes the action in the same turn.

---

### Layer 4 — UI Trust Surface & Workflow Visibility

1. **Settings Connection Health**: `/dashboard/settings` renders `ProviderReadiness` directly, displaying verified timestamps, active scopes, and actionable remediation instructions (e.g. *"Reconnect Slack — missing channels:history scope"*).
2. **Execution Inspection**: Guard blocks and `requestMoreTools` events are recorded in `agent_runs`, providing full visibility into agent reasoning and security decisions.

---

## 4. Test & Verification Matrix

| Scenario | Prior Behavior | Target Architecture Behavior | Status |
|---|---|---|---|
| `"now chekmy mails and the calender togragther"` | Calendar silently dropped (typo `calender`) | Fuzzy matcher matches both Gmail + Calendar tools | ✅ Verified in `agent.test.ts` |
| Ambiguous prompt needs un-routed tool | Model apologized ("tool not loaded") | Model calls `requestMoreTools({ domain })` and completes turn | ✅ Layer 3 Design |
| Revoked token during chat execution | Returned mock text / silent fail | Guard catches 401, marks `needs_attention`, returns clean error | ✅ Verified in `integration-health.test.ts` |
| Slack brief delivery fails | Marked entire workspace un-synced | Delivery failure logged; inbound sync state preserved | ✅ Layer 1 Invariant |
| Sarah handles high-risk churn account | Global routing might omit billing | Persona-weighted threshold prioritizes Stripe/Intercom/HubSpot | ✅ Persona Masking |

---

## 5. Phased Implementation Roadmap

- [x] **Phase 0 — Stop Fake Data & Remove Dead Code** (Completed in recent audit).
- [x] **Phase 1 — Typo-Resilient Regex & Regression Suite** (Completed in `agent.ts`).
- [ ] **Phase 2 — Levenshtein Fuzzy Matcher & Independent Domain Inclusion** (Instant 0-cost universal typo protection).
- [ ] **Phase 3 — `requestMoreTools` Self-Healing Meta-Tool** (Zero dead-ends in execution loop).
- [ ] **Phase 4 — Unified `ProviderReadiness` Contract & Settings Surface**.
