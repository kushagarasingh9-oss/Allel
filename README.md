# Allel

![Allel logo](platform/public/logo-icon.png)

**An AI-assisted revenue-recovery operating system for founder-led B2B SaaS teams.**

Allel connects fragmented customer signals from billing, product analytics, email, support, CRM, and engineering systems. It resolves those signals to the correct account, computes risk deterministically, creates an auditable recovery case, helps prepare the right response, routes the exact draft through founder approval, and measures what happened next.

> **The Architectural Rule:** AI helps Allel reason, explain, draft, research, and operate connected tools. It does **not** own customer identity, risk truth, policy, approval integrity, case transitions, or revenue attribution. Those boundaries remain deterministic, database-enforced, and auditable.

---

## Contents

- [Why Allel](#why-allel)
- [Deterministic vs. AI Separation Boundary](#deterministic-vs-ai-separation-boundary)
- [System Architecture Blueprint](#system-architecture-blueprint)
- [Product Experience & UI Architecture](#product-experience--ui-architecture)
- [End-to-End Recovery Operating Loop](#end-to-end-recovery-operating-loop)
- [Deterministic Risk & Confidence Engine](#deterministic-risk--confidence-engine)
- [Identity Resolution & Conflict Isolation](#identity-resolution--conflict-isolation)
- [Human-in-the-Loop Hash-Bound Approval](#human-in-the-loop-hash-bound-approval)
- [Agent Orchestration & Dynamic Tool Routing](#agent-orchestration--dynamic-tool-routing)
- [Durable Job Queue & Worker Pipeline](#durable-job-queue--worker-pipeline)
- [Closed-Loop Outcome Attribution](#closed-loop-outcome-attribution)
- [Integrations Mesh](#integrations-mesh)
- [Data Model & Security](#data-model--security)
- [API Surface](#api-surface)
- [Repository Guide](#repository-guide)
- [Run Locally](#run-locally)
- [Operations and Deployment](#operations-and-deployment)
- [Testing and Validation](#testing-and-validation)
- [Known Limitations](#known-limitations)
- [Documentation Map](#documentation-map)

---

## Why Allel

Customer risk rarely appears in one isolated system.

A failed Stripe invoice may be temporary. A 60% usage decline may be seasonal. A quiet Gmail thread may be normal. An unresolved Intercom issue may be harmless. But when those signals belong to the same account and occur together, they represent imminent churn.

Most founder workflows still require someone to:
1. Notice the signal across scattered dashboards;
2. Identify which customer is behind the disparate IDs;
3. Collect evidence from several providers;
4. Decide whether the risk is real;
5. Choose a safe action and respect contact cooldowns;
6. Write and review the outreach;
7. Remember to follow up; and
8. Prove whether revenue was actually recovered.

Allel unifies that fragmented process into one evidence-backed operating loop.

```mermaid
flowchart LR
    subgraph Fragmented["Scattered Signals"]
        direction TB
        S1["Stripe: Failed Payment"]
        S2["PostHog: -60% Usage"]
        S3["Intercom: Open Bug Ticket"]
        S4["Gmail: Unanswered Thread"]
    end

    subgraph AllelOS["Allel Operating System"]
        direction TB
        R1["1. Deterministic Identity Resolution"]
        R2["2. Multi-Signal Risk Scoring (50/35/15)"]
        R3["3. Action Policy & Cooldown Gating"]
        R4["4. AI-Assisted Synthesis & Drafting"]
        R5["5. Hash-Bound Founder Approval"]
        R6["6. Durable Gmail Send & Monitoring"]
        R7["7. Closed-Loop Revenue Attribution"]
        R1 --> R2 --> R3 --> R4 --> R5 --> R6 --> R7
    end

    subgraph Outcome["Measurable Result"]
        O1["Recovered MRR"]
        O2["Protected Revenue"]
        O3["Audit Trail"]
    end

    Fragmented --> AllelOS --> Outcome
```

### Product Principles

| Principle | What it means in Allel |
|---|---|
| **Facts before language** | Provider facts and persisted account state are assembled before AI analysis. |
| **Identity before action** | Ambiguous provider records become explicit conflicts instead of unsafe account merges. |
| **Policy before automation** | Confidence thresholds, contact policy, cooldowns, and legal transitions constrain action. |
| **Approval binds content** | Recovery approval is cryptographically tied to the exact draft content hash. |
| **Delivery is not success** | A sent message is monitored; revenue is counted only through verified outcome evidence. |
| **Every stage is inspectable** | Events, jobs, agent runs, case transitions, drafts, and outcomes leave audit records. |
| **Demo data stays labeled** | Seeded scenarios and test-mode metrics must never be presented as production outcomes. |

---

## Deterministic vs. AI Separation Boundary

The core architecture strictly partitions responsibilities between deterministic application code and AI reasoning:

```mermaid
flowchart TD
    subgraph Deterministic["DETERMINISTIC APPLICATION BOUNDARY (Zero Hallucination)"]
        direction TB
        D1["Webhook Signature Verification (Stripe HMAC, PostHog)"]
        D2["Identity Resolution & Conflict Isolation (identity_conflicts)"]
        D3["Multi-Dimensional Risk Engine (50% Billing, 35% Usage, 15% Comm)"]
        D4["Action Policy & Cooldown Enforcement (72h Billing, 7d Usage)"]
        D5["Recovery Case Legal State Machine (Atomic DB RPCs)"]
        D6["Content Hash Generation (SHA-256 Draft Binding)"]
        D7["Durable Worker Job Queue (Leasing, Backoff, Retries)"]
        D8["Outcome Attribution Gates (G1-G5 Strict MRR Checks)"]
    end

    subgraph AI["AI AGENT BOUNDARY (Flexible Reasoning & Drafting)"]
        direction TB
        A1["ToolLoopAgent Multi-Step Execution (Max 25 Steps)"]
        A2["Cross-Provider Synthesis (Executive Summaries)"]
        A3["Personalized Recovery Draft Generation"]
        A4["Dynamic Schema Expansion (requestMoreTools / prepareStep)"]
        A5["Deep Web & Company Research (Tavily Integration)"]
        A6["Ad-hoc Founder Q&A & Operational Insights"]
    end

    Deterministic -- "Verified Account Evidence" --> AI
    AI -- "Proposed Draft / Analysis" --> Deterministic
    Deterministic -- "Founder Review & SHA-256 Match" --> Action["Durable Execution & Gmail Dispatch"]
```

---

## System Architecture Blueprint

Allel is structured into seven distinct architectural layers ensuring complete tenant isolation, robust auditability, and sub-second UI responsiveness:

```mermaid
flowchart TB
    subgraph Presentation["1. PRESENTATION LAYER (Next.js 15 App Router & React 19)"]
        direction LR
        UI_Dash["/dashboard (Command Center)"]
        UI_Brief["/dashboard/brief (Founder Daily Brief)"]
        UI_Flows["/dashboard/flows (Automations & Cases)"]
        UI_Acc["/dashboard/accounts (Portfolio & Drawer)"]
        UI_Conn["/dashboard/connections (Integration Hub)"]
        UI_Public["/ (Landing, Docs, Pricing, Legal)"]
    end

    subgraph Edge["2. EDGE, AUTH & API ROUTING LAYER"]
        direction LR
        API_Agent["/api/agent (Streaming Chat)"]
        API_Hooks["/api/webhooks (Stripe / PostHog)"]
        API_Drafts["/api/drafts (Hash-Bound Approval)"]
        API_Cron["/api/cron/daily-run (Scheduled Sync)"]
        API_Drain["/api/internal/workflows/drain (Worker)"]
        Auth_Mid["Supabase SSR Middleware & Session Guard"]
    end

    subgraph AgentRuntime["3. AGENT RUNTIME LAYER (ToolLoopAgent Engine)"]
        direction LR
        Personas["Personas (Allel, Henry, Sarah)"]
        Router["Fuzzy Keyword & Semantic Router"]
        DynamicSchema["In-Loop Schema Expansion (prepareStep)"]
        ToolRegistry["Tool Registry (164 Active Tools)"]
        Mem_Store["Signed Chat Memory & Account Memory"]
        Run_Logger["Execution Telemetry & Action Audit"]
    end

    subgraph RecoveryEngine["4. RECOVERY ENGINE CORE"]
        direction LR
        IdResolver["Identity Resolver & Conflict Handler"]
        FeatureProj["Account Feature Projector"]
        RiskEngine["Deterministic Risk & Override Engine"]
        PolicyEngine["Policy Engine & Cooldown Enforcer"]
        OutcomeEngine["Outcome Attribution Engine (G1-G5)"]
    end

    subgraph WorkerQueue["5. DURABLE JOB QUEUE & WORKER"]
        direction LR
        JobQueue["workflow_jobs (Lease-Based Queue)"]
        WorkerDrain["Drain Worker (Concurrent Leases)"]
        JobHandlers["10 Atomic Job Handlers"]
    end

    subgraph DataIntegrations["6. INTEGRATIONS MESH"]
        direction LR
        StripeClient["Stripe (Billing & Subscriptions)"]
        PostHogClient["PostHog (Product Analytics)"]
        GoogleClient["Google (Gmail Sync & Calendar)"]
        IntercomClient["Intercom (Customer Support)"]
        HubSpotClient["HubSpot (CRM & Deals)"]
        SlackClient["Slack (Alerts & Notifications)"]
        LinearSentry["Linear & Sentry (Dev & Errors)"]
    end

    subgraph Persistence["7. PERSISTENCE LAYER (PostgreSQL & Supabase RLS)"]
        direction LR
        DB_Tables["29 Relational Tables"]
        DB_RLS["Row-Level Security Policies"]
        DB_RPC["Atomic RPCs (Transitions & Approvals)"]
        DB_Crypto["AES-256-GCM Credential Encryption"]
    end

    Presentation --> Edge
    Edge --> Auth_Mid
    Auth_Mid --> AgentRuntime
    Auth_Mid --> RecoveryEngine
    Edge --> WorkerQueue
    AgentRuntime --> ToolRegistry
    ToolRegistry --> DataIntegrations
    RecoveryEngine --> WorkerQueue
    WorkerQueue --> JobHandlers
    JobHandlers --> DataIntegrations
    JobHandlers --> RecoveryEngine
    RecoveryEngine --> Persistence
    AgentRuntime --> Persistence
    WorkerQueue --> Persistence
```

---

## Product Experience & UI Architecture

The Allel dashboard is designed as an interactive founder cockpit combining high-bandwidth AI conversation with direct operational controls:

```mermaid
flowchart TD
    subgraph UI_Shell["Command Center Layout (/dashboard)"]
        direction TB
        subgraph TopBar["Header Navigation"]
            Brand["Allel Logo"]
            Search["Quick Account Search"]
            ActivePersona["Active Persona Selector: Allel / Henry / Sarah"]
            Status["Workspace Status & Health Badge"]
        end

        subgraph MainBody["Main Workspace"]
            direction LR
            subgraph LeftNav["Sidebar"]
                Nav1["Daily Brief"]
                Nav2["Recovery Flows"]
                Nav3["Accounts Portfolio"]
                Nav4["Integrations (11 Connected)"]
                Nav5["Session History"]
            end

            subgraph CenterChat["Unified Chat & Operational Stream"]
                MessageStream["Signed Conversation Stream"]
                TimelineNode["Expandable TimelineNode"]
                ProviderCards["Multi-Provider Scans (Stripe, PostHog, Intercom)"]
                ActionCard["Action Card (Review Draft / Rescue Discount)"]
                ChatInput["AI Input Bar with Model & Tool Selector"]
            end

            subgraph RightDrawer["Context Drawer"]
                AccountHeader["Account Diagnostics"]
                RiskGauge["Deterministic Risk Score Gauge"]
                EvidenceList["Verified Evidence Feed"]
                ContactInfo["Primary Contacts & Roles"]
            end
        end
    end

    TopBar --> MainBody
```

### Main Product Surfaces

| Surface | Route | What a founder or reviewer can do |
|---|---|---|
| **Command Center** | `/dashboard` | Chat with an AI persona, invoke 164 connected tools, inspect live provider cards, and resume signed historical sessions. |
| **Founder Brief** | `/dashboard/brief` | Review high-priority accounts, overdue actions, revenue at risk, and delivered morning briefings. |
| **Automations & Flows** | `/dashboard/flows` | Search cases, inspect multi-provider evidence, review pending recovery drafts, replay failed jobs, and dispatch approved outreach. |
| **Accounts Portfolio** | `/dashboard/accounts` | Browse all resolved customer accounts, review MRR, health scores, and open dedicated account drawers. |
| **Connections Hub** | `/dashboard/connections` | Configure, authenticate, and monitor live health for all 11 supported integrations. |
| **Draft Review** | `/dashboard/drafts` | Inspect pending recovery outreach drafts, verify SHA-256 content hashes, and grant founder approval. |
| **Session History** | `/dashboard/sessions` | Seamlessly reopen cryptographically signed past agent interactions without context loss. |

---

## End-to-End Recovery Operating Loop

When a customer encounters friction, the entire lifecycle from signal detection to revenue attribution executes through a resilient, auditable state machine:

```mermaid
sequenceDiagram
    autonumber
    participant Provider as External Provider (Stripe/PostHog)
    participant Webhook as /api/webhooks
    participant Queue as workflow_jobs Queue
    participant Worker as Durable Worker
    participant Recovery as Recovery Engine
    participant Agent as AI Agent (ToolLoopAgent)
    participant Founder as Founder UI
    participant Gmail as Gmail API
    participant Attrib as Attribution Engine

    Provider->>Webhook: Ingest signed event (e.g. invoice.payment_failed)
    Webhook->>Webhook: Verify HMAC / Webhook signature
    Webhook->>Queue: Enqueue process_provider_event job
    Webhook-->>Provider: Fast 200 OK ACK

    Worker->>Queue: Claim job with durable lease
    Worker->>Recovery: Resolve Provider Identity to Customer Account
    Recovery-->>Worker: Account resolved (or identity_conflict created)

    Worker->>Recovery: Project features & compute deterministic risk score
    Recovery-->>Worker: Score = 78 (High Risk), Confidence = 0.94

    Worker->>Recovery: Evaluate Action Policy & Cooldowns
    Recovery-->>Worker: Action Allowed: founder_payment_retry_request

    Worker->>Queue: Create Recovery Case & Enqueue run_case_analysis
    Worker->>Agent: Request case analysis & personalized draft
    Agent-->>Worker: Generated draft + strategic rationale
    Worker->>Queue: Enqueue verify_case_draft

    Worker->>Queue: Store draft & Enqueue notify_founder
    Worker-->>Founder: Present Draft in UI with SHA-256 Content Hash

    Founder->>Founder: Inspect evidence, edit/approve draft
    Founder->>Recovery: POST /api/drafts/:id/approve (expected_hash)
    Recovery->>Recovery: Execute atomic transition RPC: status -> approved

    Worker->>Queue: Claim send_approved_draft job
    Worker->>Gmail: Dispatch email via user authenticated Gmail OAuth
    Gmail-->>Worker: Return message_id & thread_id
    Worker->>Recovery: Transition Case status -> dispatched & monitoring

    loop Active 14-Day Attribution Window
        Worker->>Gmail: Poll thread history for replies
        Worker->>Provider: Check Stripe invoice status / PostHog activity
        Provider-->>Worker: Invoice Paid: $1,200 MRR recovered
    end

    Worker->>Attrib: Evaluate G1-G5 Outcome Attribution Gates
    Attrib-->>Recovery: Verified: strict_recovered_mrr += $1,200
    Recovery->>Recovery: Transition Case status -> resolved
```

---

## Deterministic Risk & Confidence Engine

Allel never delegates risk assessment to an unpredictable LLM prompt. Instead, risk is computed via a transparent, multi-dimensional scoring formula with hard circuit-breaker overrides:

```mermaid
flowchart TD
    subgraph Inputs["Multi-Provider Feature Extraction"]
        B["Billing Signals (Stripe)"]
        U["Usage Signals (PostHog)"]
        C["Communication Signals (Gmail/Intercom)"]
    end

    subgraph Weights["Component Weighting Engine"]
        W_B["Billing Component (50% Weight)<br/>- Failed payments<br/>- Dunning cycle status<br/>- Days past due"]
        W_U["Usage Component (35% Weight)<br/>- 30-day active user drop<br/>- Core feature abandonment<br/>- Zero login > 7 days"]
        W_C["Communication Component (15% Weight)<br/>- Unreplied founder thread<br/>- Intercom bug reports<br/>- Negative sentiment"]
    end

    subgraph BaseScore["Base Risk Calculation"]
        Calc["Risk Score = (0.50 * Billing) + (0.35 * Usage) + (0.15 * Comm)"]
    end

    subgraph Overrides["Hard Circuit-Breaker Overrides"]
        O1{"Active Cancellation?"}
        O2{"Payment Failed > 7 Days?"}
        O3{"Usage Dropped > 70%?"}
        O_Crit["FORCE RISK SCORE: 85+ (Critical)"]
    end

    subgraph Output["Case Risk Classification"]
        Low["0 - 44: Low Risk (Passive Monitor)"]
        Med["45 - 69: Medium Risk (Automated Nudge)"]
        High["70 - 84: High Risk (Founder Review)"]
        Crit["85 - 100: Critical (Immediate Rescue)"]
    end

    B --> W_B
    U --> W_U
    C --> W_C
    W_B --> Calc
    W_U --> Calc
    W_C --> Calc

    Calc --> O1
    O1 -- Yes --> O_Crit
    O1 -- No --> O2
    O2 -- Yes --> O_Crit
    O2 -- No --> O3
    O3 -- Yes --> O_Crit
    O3 -- No --> ScoreFinal[Final Composite Score]

    O_Crit --> Crit
    ScoreFinal --> Low
    ScoreFinal --> Med
    ScoreFinal --> High
    ScoreFinal --> Crit
```

### Confidence Gating & Policy Cooldowns

```mermaid
flowchart LR
    Score["Calculated Risk Score"] --> ConfCheck{"Identity Confidence >= 0.90<br/>AND<br/>Score Confidence >= 0.75?"}
    ConfCheck -- No --> Escalate["FORCE HUMAN REVIEW<br/>(Confidence Insufficient)"]
    ConfCheck -- Yes --> CooldownCheck{"Cooldown Active?<br/>Billing: 72h<br/>Usage: 7 days"}
    CooldownCheck -- Yes --> Suppress["SUPPRESS ACTION<br/>(Avoid Customer Harassment)"]
    CooldownCheck -- No --> Propose["PROPOSE RECOVERY ACTION<br/>(Draft & Case Created)"]
```

---

## Identity Resolution & Conflict Isolation

A major failure mode in B2B SaaS is merging the wrong customer accounts based on loose heuristics. Allel isolates ambiguities into an auditable conflict table:

```mermaid
flowchart TD
    Event["Incoming Provider Signal (e.g. Stripe ID, PostHog ID, Email)"] --> Step1{"Exact Provider Match in provider_identities?"}
    Step1 -- Yes --> Resolved["Attach to Canonical customer_accounts"]
    Step1 -- No --> Step2{"Exact Contact Match in account_contacts?"}
    Step2 -- Yes --> LinkProvider["Link Provider ID via Atomic RPC"]
    LinkProvider --> Resolved
    Step2 -- No --> Step3{"Multiple Conflicting Account Candidates?"}
    Step3 -- Yes --> Conflict["ISOLATE CONFLICT:<br/>Write to identity_conflicts table<br/>Halt Automatic Actions"]
    Step3 -- No --> Step4{"High-Confidence Domain Match?"}
    Step4 -- Yes --> Provisional["Create Provisional Account<br/>(Flagged for Founder Review)"]
    Step4 -- No --> Unmatched["Park in provider_events as Unresolved"]
```

---

## Human-in-the-Loop Hash-Bound Approval

To protect founders against prompt injections, model drift, or rogue writes, Allel cryptographically binds approval to the exact content hash:

```mermaid
sequenceDiagram
    autonumber
    participant UI as Founder Browser
    participant API as /api/drafts/:id/approve
    participant DB as PostgreSQL (transition RPC)
    participant Worker as Durable Send Worker
    participant Gmail as External Gmail API

    UI->>UI: Founder edits / reviews draft content in UI
    UI->>UI: Compute SHA-256(recipient + subject + body)
    UI->>API: POST { draft_id, expected_hash }

    API->>DB: CALL transition_draft_approval(draft_id, expected_hash)
    Note over DB: Atomically verify:<br/>current_hash == expected_hash<br/>AND status == awaiting_approval
    
    alt Hash Mismatch (Content Changed or Spoofed)
        DB-->>API: ERROR: 409 Conflict (Hash Mismatch)
        API-->>UI: Alert Founder: Draft was modified in-flight
    else Hash Valid
        DB->>DB: Set draft.status = approved, case.status = approved
        DB-->>API: 200 OK (Transition Committed)
        API-->>UI: UI updates to Approved state
        Worker->>DB: Claim send_approved_draft job
        Worker->>Gmail: Send exact approved payload
        Gmail-->>Worker: Success (message_id)
        Worker->>DB: Mark case dispatched
    end
```

---

## Agent Orchestration & Dynamic Tool Routing

Allel ships with **164 registered tools** across 12 domains. Loading all 164 tool schemas into every model prompt would consume ~45,000 tokens per turn. Allel solves this with a **2-tier dynamic schema expansion pipeline**:

```mermaid
flowchart TD
    UserQuery["User Request: 'Show me Acme usage and draft an email'"] --> P_Filter["1. Persona Allowlist Filter<br/>(Allel: 164 tools | Sarah: 62 tools | Henry: 48 tools)"]
    P_Filter --> Fuzzy["2. Semantic & Levenshtein Keyword Matcher<br/>Keywords: usage, draft, email -> posthog, recovery, gmail"]
    Fuzzy --> InitialTools["3. Initial Active Tool Set (Bounded: 8-12 tools)<br/>[getUnifiedCustomerScan, generateFollowUpDraft, getMyInbox]"]
    InitialTools --> ModelLoop["4. ToolLoopAgent Step (AI SDK 6)"]
    ModelLoop --> StepCheck{"Model Needs Additional Domain?<br/>(e.g. wants to check Stripe invoices)"}
    StepCheck -- Yes --> ReqMore["Call Synthetic tool: requestMoreTools('stripe')"]
    ReqMore --> PrepareStep["5. prepareStep Interceptor:<br/>Dynamically injects Stripe tool schemas on next step"]
    PrepareStep --> ModelLoop
    StepCheck -- No --> ExecuteTool["6. Execute Selected Tool"]
    ExecuteTool --> Guard{"Provider Readiness Guard:<br/>Is Provider Connected & Healthy?"}
    Guard -- Unhealthy/Missing --> ReturnUnavail["Return Structured Provider Unavailable<br/>(Zero Hallucination)"]
    Guard -- Healthy --> RunTool["Execute Tool Implementation"]
    RunTool --> Telemetry["Record Step Telemetry & Tokens"]
    Telemetry --> StreamUI["Stream Rich TimelineNode to UI"]
```

### The Three Personas

```mermaid
flowchart LR
    subgraph Alex["Allel (Internal: alex)"]
        direction TB
        A_Role["Role: AI Co-founder"]
        A_Tools["164 Tools (Full Registry)<br/>Billing, Analytics, CRM, Dev, Workflows"]
    end

    subgraph Sarah["Sarah"]
        direction TB
        S_Role["Role: Head of Retention"]
        S_Tools["Retention Allowlist (62 Tools)<br/>Stripe, PostHog, Recovery Cases, Drafts, Calendar"]
    end

    subgraph Henry["Henry"]
        direction TB
        H_Role["Role: Head of Growth"]
        H_Tools["Growth Allowlist (48 Tools)<br/>HubSpot, Intercom, Research, Tavily, Drafts"]
    end
```

---

## Durable Job Queue & Worker Pipeline

All background operations run through a persistent PostgreSQL-backed queue (`workflow_jobs`) with atomic leases, bounded concurrency, and automatic exponential backoff:

```mermaid
flowchart TD
    subgraph JobLifecycle["10-Stage Idempotent Recovery Pipeline"]
        J1["process_provider_event"] --> J2["project_account_features"]
        J2 --> J3["evaluate_recovery_case"]
        J3 --> J4["run_case_analysis"]
        J4 --> J5["generate_case_draft"]
        J5 --> J6["verify_case_draft"]
        J6 --> J7["notify_founder"]
        J7 --> J8["send_approved_draft"]
        J8 --> J9["sync_gmail_history"]
        J9 --> J10["classify_case_outcome"]
    end

    subgraph Execution["Queue Execution Engine"]
        Claim["Worker Claims Leased Job (FOR UPDATE SKIP LOCKED)"]
        Heartbeat["Model Heartbeat (Every 15s during AI generation)"]
        Retry{"Execution Succeeded?"}
        Retry -- Yes --> Done["Mark Completed & Enqueue Next Stage"]
        Retry -- No (Transient) --> Backoff["Exponential Backoff Retry (Max 5)"]
        Retry -- No (Permanent) --> DeadLetter["Mark Failed & Retain Error Diagnostics"]
    end

    JobLifecycle --> Claim
    Claim --> Heartbeat --> Retry
```

---

## Closed-Loop Outcome Attribution

Allel guarantees financial attribution integrity by separating strict recovered revenue from protected revenue through 5 rigorous validation gates:

```mermaid
flowchart TD
    ActionSent["Approved Recovery Action Sent (Day 0)"] --> Monitor["14-Day Attribution Monitoring Window"]
    Monitor --> PaymentEvent["Stripe Event Ingested: invoice.paid"]
    PaymentEvent --> Gate1{"Gate 1: Exact Customer Account Match?"}
    Gate1 -- No --> Reject["Reject Attribution"]
    Gate1 -- Yes --> Gate2{"Gate 2: Timestamp Within 14-Day Window?"}
    Gate2 -- No --> Reject
    Gate2 -- Yes --> Gate3{"Gate 3: Invoice ID Matches At-Risk Invoice?"}
    Gate3 -- Yes --> StrictRev["ATTRIBUTED: Strict Recovered MRR<br/>(Direct payment recovery verified)"]
    Gate3 -- No --> Gate4{"Gate 4: Active Subscription Renewal Retained?"}
    Gate4 -- Yes --> ProtRev["ATTRIBUTED: Protected Revenue<br/>(Churn prevented, contract preserved)"]
    Gate4 -- No --> Reject
```

---

## Integrations Mesh

Allel connects with the 11 essential platforms of modern B2B SaaS:

```mermaid
flowchart TB
    subgraph CoreHub["Allel Integration Hub"]
        Manager["Connection Manager (AES-256-GCM Vault)"]
        Guard["Provider Readiness Guard"]
    end

    subgraph SyncCapable["Sync-Capable (Webhooks + Reconciliation)"]
        Stripe["Stripe: Invoices, Subscriptions, Dunning, Disputes"]
        PostHog["PostHog: Usage Drops, Feature Flags, User Cohorts"]
        Gmail["Gmail: Customer Threads, History Sync, Inbound Replies"]
        Intercom["Intercom: Support Conversations, Friction Tickets"]
        HubSpot["HubSpot: CRM Deals, Account Owners, Lifecycle Stages"]
        Slack["Slack: Team Notifications, Brief Dispatch, Channel Pings"]
        Linear["Linear: Issue Tracking, Bug Escalations, Roadmaps"]
        Sentry["Sentry: Crash Reports, Error Spikes, Customer Impact"]
    end

    subgraph ToolOnly["Tool-Only Live Invocations"]
        Calendar["Google Calendar: Founder Availability & Meeting Links"]
        Notion["Notion: Knowledge Base Search & Runbook Extraction"]
        Airtable["Airtable: Custom Workspace Databases & Custom CRM"]
        Tavily["Tavily Search: Live Web Research & Competitor Intel"]
    end

    CoreHub <--> SyncCapable
    CoreHub <--> ToolOnly
```

---

## Data Model & Security

### Entity Relationship Diagram

```mermaid
erDiagram
    WORKSPACES ||--o{ WORKSPACE_MEMBERS : contains
    WORKSPACES ||--o{ INTEGRATION_CONNECTIONS : configures
    WORKSPACES ||--o{ CUSTOMER_ACCOUNTS : owns
    CUSTOMER_ACCOUNTS ||--o{ ACCOUNT_CONTACTS : has
    CUSTOMER_ACCOUNTS ||--o{ PROVIDER_IDENTITIES : resolves
    CUSTOMER_ACCOUNTS ||--o{ IDENTITY_CONFLICTS : isolates
    CUSTOMER_ACCOUNTS ||--o{ ACCOUNT_FEATURES : projects
    CUSTOMER_ACCOUNTS ||--o{ ACCOUNT_SIGNALS : receives
    CUSTOMER_ACCOUNTS ||--o{ RECOVERY_CASES : opens
    RECOVERY_CASES ||--o{ RECOVERY_CASE_EVENTS : audits
    RECOVERY_CASES ||--o{ SCORE_SNAPSHOTS : explains
    RECOVERY_CASES ||--o{ FOLLOW_UP_DRAFTS : proposes
    RECOVERY_CASES ||--o{ DRAFT_OUTCOMES : attributes
    RECOVERY_CASES ||--o{ WORKFLOW_JOBS : executes
    WORKSPACES ||--o{ AGENT_CONVERSATIONS : stores
    WORKSPACES ||--o{ AGENT_RUNS : observes
```

### Security & Defense-in-Depth

- **Tenant Isolation:** Supabase Row-Level Security (RLS) ensures absolute isolation per `workspace_id`.
- **Encrypted Credentials:** Integration access tokens and refresh tokens are encrypted using AES-256-GCM before database write.
- **Signed Session Memory:** Client-side assistant turns are signed via HMAC-SHA256 (`AGENT_HISTORY_SIGNING_SECRET`) preventing prompt tampering.
- **Webhook Authenticity:** Ingress endpoints enforce Stripe webhook signatures and PostHog HMAC verification.
- **Atomic Operations:** Critical state changes use PostgreSQL RPCs with row-level locks (`SELECT FOR UPDATE`), preventing race conditions.

---

## API Surface

| Group | Method & Path | Purpose |
|---|---|---|
| **Agent** | `POST /api/agent` | Streaming multi-turn conversation with dynamic tool routing and memory |
| **Agent History** | `GET /api/agent/history` | Retrieve cryptographically signed conversation turns |
| **Agent Sessions** | `GET, POST /api/agent/sessions` | Create, list, rename, and manage chat sessions |
| **Agent Inspection** | `GET /api/agent/runs` | Inspect agent execution runs, step traces, and token costs |
| **Recovery Cases** | `GET /api/recovery/cases` | Search, filter, and inspect recovery cases and score snapshots |
| **Draft Review** | `POST /api/drafts/:id/approve` | Grant hash-verified founder approval for outreach |
| **Draft Send** | `POST /api/drafts/:id/send` | Queue approved draft for durable worker dispatch |
| **Founder Brief** | `GET, POST /api/brief` | Read prioritized daily briefs and trigger morning refresh |
| **Metrics** | `GET /api/metrics/revenue-saved` | Fetch strict recovered MRR, protected MRR, and at-risk metrics |
| **Webhooks** | `POST /api/webhooks/stripe` | Authenticated Stripe event ingress |
| **Webhooks** | `POST /api/webhooks/posthog` | Authenticated PostHog event ingress |
| **Scheduled Sync** | `POST /api/cron/daily-run` | Scheduled morning provider reconciliation and brief dispatch |
| **Worker Drain** | `POST /api/internal/workflows/drain` | Drain leased jobs from the durable workflow queue |

---

## Repository Guide

```text
allel/
├── README.md                    # Canonical GitHub product & architectural guide
├── database/
│   └── migrations/              # 29 ordered PostgreSQL / Supabase migrations
├── docs/
│   ├── README.md                # Documentation index and navigation map
│   ├── ALLEL.md                 # Detailed technical and database architecture
│   ├── REPOSITORY_RESEARCH.md   # Codebase architecture & reviewer file locator
│   ├── AGENT.md                 # Agent runtime, personas, and memory deep dive
│   └── tool_calling.md          # 5-stage tool routing pipeline & 164-tool registry
└── platform/
    ├── src/app/                 # Next.js 15 App Router pages and API routes
    ├── src/agent/               # Agent runtime, 164 tools, memory, personas
    ├── src/recovery/            # Identity resolver, risk scoring, action policy
    ├── src/jobs/                # Durable queue worker and 10 job stage handlers
    ├── src/integrations/        # Provider clients, connection guards, sync
    ├── src/data/                # Supabase data queries and mutations
    ├── src/foundation/          # AI providers, crypto, security, logging
    ├── src/ui/                  # Command center, chat timeline, drawers, modals
    ├── scripts/                 # Scenarios, migration runner, worker drain
    └── artifacts/               # Benchmark and execution evidence
```

---

## Run Locally

### Prerequisites
- Node.js 20+
- npm 10+
- Supabase account (or local PostgreSQL with pgvector)
- OpenAI / Azure OpenAI API key

### 1. Install Dependencies
```bash
cd platform
npm install
cp .env.example .env.local
```

### 2. Configure Environment Variables
Set the core credentials in `platform/.env.local`:
```text
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
ENCRYPTION_KEY=your-32-byte-hex-encryption-key
AGENT_HISTORY_SIGNING_SECRET=your-64-byte-hmac-secret
OPENAI_API_KEY=sk-...
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 3. Run Database Migrations
Apply the 29 ordered migrations from `database/migrations/` using the Supabase CLI or `psql`:
```bash
# Example via Supabase CLI:
supabase db push
```

### 4. Start Development Server
```bash
npm run dev
```
Navigate to `http://localhost:3000`.

### 5. Validate the Build
```bash
npm test        # Runs all 439 tests
npm run build   # Validates Next.js production compilation
```

---

## Operations and Deployment

### Common CLI Tasks (from `platform/`)
```bash
npm run dev                         # Start Next.js development server
npm test                            # Run full unit & integration test suite
npm run build                       # Test production build & static generation
npm run workflows:drain             # Drain workflow_jobs queue locally
npm run scenario:evaluate           # Run 15-account canonical scenario evaluation
npm run demo:data:seed              # Seed safe test-mode scenario accounts
npm run demo:data:reset             # Cleanly wipe test-mode scenario records
```

### Cron Schedule (`vercel.json`)
The morning reconciliation job is scheduled at `04:00 UTC`:
```json
{
  "crons": [
    {
      "path": "/api/cron/daily-run",
      "schedule": "0 4 * * *"
    }
  ]
}
```

---

## Testing and Validation

Verified snapshot (**2026-09-05**):

```text
Test Suite:           439 passed, 0 failed (100% pass rate)
Production Build:     Passed (36/36 static pages generated)
Test Files:           39 suites
PostgreSQL Migrations: 29 files
Registered Tools:     164 tools
```

All 439 automated tests validate identity resolution, deterministic risk scoring, state machine transitions, SHA-256 approval checks, provider connection guards, and agent routing.

---

## Known Limitations

We explicitly document known system boundaries:
1. **Direct Dispatch API Hardening:** Two direct recovery dispatch routes can mark drafts sent after Gmail failure; the durable worker queue (`send-approved-draft.ts`) is the hardened production path.
2. **Scheduled Worker Frequency:** The Vercel cron triggers the daily run once per day; low-latency queue draining (<1 minute) requires an external worker or worker-drain trigger.
3. **Generic Chat Approvals:** The database and API for generic chat-tool approvals are built, but the generic interception list is intentionally empty in favor of specific recovery draft approval.

---

## Documentation Map

```mermaid
flowchart LR
    Root["README.md (You are here)<br/>Full Product & Architectural Guide"] --> DocsNav["docs/README.md<br/>Documentation Navigation Map"]
    DocsNav --> Arch["docs/ALLEL.md<br/>Detailed System Architecture & ERD"]
    DocsNav --> RepoDoc["docs/REPOSITORY_RESEARCH.md<br/>Codebase & File Locator"]
    DocsNav --> AgentDoc["docs/AGENT.md<br/>Agent Runtime, Loop & Personas"]
    DocsNav --> ToolsDoc["docs/tool_calling.md<br/>5-Stage Routing & 164-Tool Registry"]
    DocsNav --> PlatformDoc["platform/README.md<br/>Developer Setup & App Router Routes"]
```

---

## License

Copyright © 2026 Kushagara Singh. All rights reserved. Proprietary software for evaluation and hackathon review.
