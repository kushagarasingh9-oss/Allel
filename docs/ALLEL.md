# Allel — Detailed Product and Architecture Guide

> **Maintained technical reference.** Start with the repository [`README.md`](../README.md) for the complete GitHub-facing product walkthrough.
> Last source audit: **2026-09-05**. Source code and database migrations outrank prose.

---

## Contents

- [1. System Architecture Blueprint](#1-system-architecture-blueprint)
- [2. Deterministic vs. AI Separation Boundary](#2-deterministic-vs-ai-separation-boundary)
- [3. Complete Database Schema (ERD)](#3-complete-database-schema-erd)
- [4. End-to-End Recovery Operating Loop](#4-end-to-end-recovery-operating-loop)
- [5. Identity Resolution & Conflict Isolation](#5-identity-resolution--conflict-isolation)
- [6. Multi-Dimensional Risk Engine & Overrides](#6-multi-dimensional-risk-engine--overrides)
- [7. Recovery Case State Machine](#7-recovery-case-state-machine)
- [8. Human-in-the-Loop Hash-Bound Approval](#8-human-in-the-loop-hash-bound-approval)
- [9. Durable Job Queue & Worker Pipeline](#9-durable-job-queue--worker-pipeline)
- [10. Closed-Loop Revenue Attribution (G1–G5)](#10-closed-loop-revenue-attribution-g1g5)
- [11. Daily Cron & Brief Delivery Pipeline](#11-daily-cron--brief-delivery-pipeline)

---

## 1. System Architecture Blueprint

Allel is partitioned into seven distinct, decoupled subsystems. Client interaction, deterministic recovery logic, AI orchestration, background workers, and external integrations operate through strictly defined interfaces:

```mermaid
flowchart TB
    subgraph Client["1. Client Surfaces (Next.js 15 App Router & React 19)"]
        direction LR
        UI_Dash["Command Center (/dashboard)"]
        UI_Flows["Recovery Automations (/dashboard/flows)"]
        UI_Brief["Founder Brief (/dashboard/brief)"]
        UI_Accounts["Account Portfolio (/dashboard/accounts)"]
        UI_Conn["Connections (/dashboard/connections)"]
    end

    subgraph API["2. API & Edge Middleware"]
        direction LR
        API_Chat["/api/agent (Streaming Chat)"]
        API_Hooks["/api/webhooks/* (Stripe/PostHog)"]
        API_Approvals["/api/drafts/:id/approve"]
        API_Cron["/api/cron/daily-run"]
        API_Drain["/api/internal/workflows/drain"]
        Mid_Auth["Supabase SSR Auth & Tenant Isolation"]
    end

    subgraph AgentLayer["3. Agent Layer (AI SDK 6 & ToolLoopAgent)"]
        direction LR
        Agent_Personas["Personas (Allel, Henry, Sarah)"]
        Agent_Router["Semantic & Fuzzy Keyword Router"]
        Agent_Expand["prepareStep Dynamic Schema Expansion"]
        Agent_Registry["Tool Registry (164 Active Tools)"]
        Agent_Memory["Signed Session Memory & Account Memory"]
        Agent_Logger["Execution Telemetry & Audit Trail"]
    end

    subgraph RecoveryCore["4. Recovery Engine Core"]
        direction LR
        Rec_Identity["Identity Resolver & Conflict Handler"]
        Rec_Features["Feature Extraction & Signal Normalizer"]
        Rec_Scoring["Deterministic Scoring (50/35/15)"]
        Rec_Overrides["Hard Circuit-Breaker Overrides"]
        Rec_Policy["Action Policy & Cooldown Engine"]
        Rec_Attribution["Outcome Attribution Engine (G1-G5)"]
    end

    subgraph JobQueue["5. Durable Workflow Job Queue"]
        direction LR
        Queue_Table["workflow_jobs (PostgreSQL Queue)"]
        Queue_Worker["Leased Concurrent Worker"]
        Queue_Handlers["10 Idempotent Stage Handlers"]
    end

    subgraph Integrations["6. Integrations Mesh (11 Providers)"]
        direction LR
        Int_Stripe["Stripe (Billing & Subs)"]
        Int_PostHog["PostHog (Product Usage)"]
        Int_Gmail["Gmail (Threads & Inbound)"]
        Int_Intercom["Intercom (Support Tickets)"]
        Int_HubSpot["HubSpot (CRM Deals)"]
        Int_Slack["Slack (Team Alerts)"]
        Int_Dev["Linear & Sentry"]
        Int_Tools["Calendar, Notion, Airtable, Tavily"]
    end

    subgraph Database["7. Persistence Layer (Supabase / PostgreSQL)"]
        direction LR
        DB_Schema["29 Relational Tables"]
        DB_RLS["Row-Level Security Policies"]
        DB_RPC["Atomic Locking RPCs"]
        DB_Vault["AES-256-GCM Encrypted Tokens"]
    end

    Client --> API
    API --> Mid_Auth
    Mid_Auth --> AgentLayer
    Mid_Auth --> RecoveryCore
    API --> JobQueue
    AgentLayer --> Agent_Registry
    Agent_Registry --> Integrations
    RecoveryCore --> JobQueue
    JobQueue --> Queue_Handlers
    Queue_Handlers --> Integrations
    Queue_Handlers --> RecoveryCore
    RecoveryCore --> Database
    AgentLayer --> Database
    JobQueue --> Database
```

---

## 2. Deterministic vs. AI Separation Boundary

To eliminate AI hallucinations and ensure production reliability, Allel strictly partitions responsibilities:

```mermaid
flowchart TD
    subgraph DeterministicCore["DETERMINISTIC APPLICATION CODE (Zero Hallucination)"]
        direction TB
        C1["Provider Ingress & Signature Verification"]
        C2["Identity Matching & Conflict Isolation (identity_conflicts)"]
        C3["Formulaic Risk Scoring (50% Billing, 35% Usage, 15% Comm)"]
        C4["Hard Risk Overrides (Past-due >7d, Cancellation, -70% Usage)"]
        C5["Contact Policy & Cooldown Gating (72h Billing, 7d Usage)"]
        C6["Recovery Case Legal State Machine & DB Locks"]
        C7["Draft SHA-256 Hash Binding & Verification"]
        C8["Durable Worker Job Queue & Exponential Backoff"]
        C9["Financial Outcome Attribution (G1-G5 Invoice Matching)"]
    end

    subgraph AIAssistant["AI REASONING LAYER (ToolLoopAgent)"]
        direction TB
        M1["Cross-Provider Account Synthesis"]
        M2["Personalized Email Recovery Drafting"]
        M3["Dynamic Tool Selection via prepareStep"]
        M4["Strategic Churn Rationale & Recommended Actions"]
        M5["Ad-hoc Founder Research & Web Search (Tavily)"]
    end

    DeterministicCore -- "Verified Evidence Snapshot" --> AIAssistant
    AIAssistant -- "Proposed Draft / Summary" --> DeterministicCore
    DeterministicCore -- "Founder Approved & Hash-Matched" --> Dispatch["Durable Worker Dispatch via Gmail OAuth"]
```

---

## 3. Complete Database Schema (ERD)

The PostgreSQL persistence model connects workspaces, customer accounts, multi-provider identities, recovery cases, drafts, audit trails, and background jobs:

```mermaid
erDiagram
    WORKSPACES ||--o{ WORKSPACE_MEMBERS : "has members"
    WORKSPACES ||--o{ INTEGRATION_CONNECTIONS : "configures"
    WORKSPACES ||--o{ CUSTOMER_ACCOUNTS : "owns"
    WORKSPACES ||--o{ AGENT_CONVERSATIONS : "records"
    WORKSPACES ||--o{ AGENT_RUNS : "monitors"
    WORKSPACES ||--o{ WORKFLOW_JOBS : "queues"

    CUSTOMER_ACCOUNTS ||--o{ ACCOUNT_CONTACTS : "identifies"
    CUSTOMER_ACCOUNTS ||--o{ PROVIDER_IDENTITIES : "resolves"
    CUSTOMER_ACCOUNTS ||--o{ IDENTITY_CONFLICTS : "flags"
    CUSTOMER_ACCOUNTS ||--o{ ACCOUNT_FEATURES : "projects"
    CUSTOMER_ACCOUNTS ||--o{ ACCOUNT_SIGNALS : "receives"
    CUSTOMER_ACCOUNTS ||--o{ RECOVERY_CASES : "opens"
    CUSTOMER_ACCOUNTS ||--o{ AGENT_MEMORIES : "maintains"

    RECOVERY_CASES ||--o{ RECOVERY_CASE_EVENTS : "logs"
    RECOVERY_CASES ||--o{ SCORE_SNAPSHOTS : "snapshots"
    RECOVERY_CASES ||--o{ FOLLOW_UP_DRAFTS : "generates"
    RECOVERY_CASES ||--o{ DRAFT_OUTCOMES : "attributes"

    WORKSPACES {
        uuid id PK
        string name
        string slug
        timestamp created_at
    }

    CUSTOMER_ACCOUNTS {
        uuid id PK
        uuid workspace_id FK
        string name
        string domain
        integer mrr_cents
        string status
        integer health_score
        timestamp created_at
    }

    PROVIDER_IDENTITIES {
        uuid id PK
        uuid account_id FK
        string provider
        string provider_id
        jsonb metadata
        timestamp linked_at
    }

    IDENTITY_CONFLICTS {
        uuid id PK
        uuid workspace_id FK
        string provider
        string provider_id
        uuid[] candidate_account_ids
        string resolution_status
        timestamp created_at
    }

    RECOVERY_CASES {
        uuid id PK
        uuid account_id FK
        string status
        integer risk_score
        string risk_level
        string primary_factor
        string proposed_action
        timestamp created_at
    }

    FOLLOW_UP_DRAFTS {
        uuid id PK
        uuid case_id FK
        string recipient_email
        string subject
        text body
        string content_hash
        string status
        timestamp approved_at
    }

    DRAFT_OUTCOMES {
        uuid id PK
        uuid case_id FK
        uuid draft_id FK
        string outcome_category
        integer recovered_mrr_cents
        integer protected_mrr_cents
        string attribution_gate
        timestamp verified_at
    }

    WORKFLOW_JOBS {
        uuid id PK
        uuid workspace_id FK
        string job_type
        jsonb payload
        string status
        integer attempts
        timestamp run_at
        timestamp locked_until
    }
```

---

## 4. End-to-End Recovery Operating Loop

When a customer signal arrives, the recovery engine coordinates feature extraction, deterministic scoring, policy checks, draft generation, hash verification, and delivery:

```mermaid
sequenceDiagram
    autonumber
    participant Stripe as Stripe / PostHog
    participant Webhook as /api/webhooks
    participant Queue as workflow_jobs Queue
    participant Worker as Background Worker
    participant Engine as Recovery Engine
    participant Agent as AI Agent Loop
    participant Founder as Founder (UI)
    participant Gmail as Gmail OAuth API
    participant Attrib as Outcome Attribution

    Stripe->>Webhook: Webhook payload (invoice.payment_failed)
    Webhook->>Webhook: Verify signature & HMAC
    Webhook->>Queue: Enqueue 'process_provider_event'
    Webhook-->>Stripe: Fast 200 OK Response

    Worker->>Queue: Claim job lease (FOR UPDATE SKIP LOCKED)
    Worker->>Engine: Resolve identity (Stripe customer -> customer_account)
    Engine-->>Worker: Account resolved: 'Acme Corp' (uuid: 9b1deb4d)

    Worker->>Engine: Project features & compute risk score
    Engine-->>Worker: Risk: 82 (High), Primary Factor: 'repeated_payment_failure'

    Worker->>Engine: Check Action Policy & Cooldowns
    Engine-->>Worker: Policy Pass: cooldown elapsed (last outreach > 72h)

    Worker->>Queue: Create Recovery Case & Enqueue 'run_case_analysis'
    Worker->>Agent: Generate structured analysis & draft proposal
    Agent-->>Worker: Draft generated + strategic talking points

    Worker->>Queue: Compute SHA-256 & Enqueue 'notify_founder'
    Worker-->>Founder: Present Draft in Dashboard with SHA-256 Content Hash

    Founder->>Founder: Review evidence & click 'Approve Draft'
    Founder->>Engine: POST /api/drafts/:id/approve { expected_hash }
    Engine->>Engine: Atomic DB RPC locks row & verifies hash match

    Worker->>Queue: Claim 'send_approved_draft' job
    Worker->>Gmail: Send message via user's Gmail OAuth
    Gmail-->>Worker: Sent: message_id '18f29ab0'
    Worker->>Engine: Case status -> 'dispatched' & 'monitoring'

    loop 14-Day Monitoring Window
        Worker->>Gmail: Poll thread history for replies
        Worker->>Stripe: Check invoice settlement status
        Stripe-->>Worker: invoice.paid ($1,400 MRR)
    end

    Worker->>Attrib: Validate G1-G5 Outcome Gates
    Attrib-->>Engine: Verified: strict_recovered_mrr = $1,400
    Engine->>Engine: Case status -> 'resolved'
```

---

## 5. Identity Resolution & Conflict Isolation

Accurate identity resolution is the foundation of trustworthy recovery. Allel isolates ambiguities into an explicit conflict table rather than creating duplicate accounts or making false merges:

```mermaid
flowchart TD
    Signal["Incoming Signal (Provider ID, Email, Domain)"] --> Step1{"Exact Match in provider_identities?"}
    Step1 -- Yes --> Step1_Resolved["Resolve to Canonical customer_account"]
    Step1 -- No --> Step2{"Exact Email Match in account_contacts?"}
    Step2 -- Yes --> Step2_Link["Link Provider ID via Atomic RPC"]
    Step2_Link --> Step1_Resolved
    Step2 -- No --> Step3{"Multiple Conflicting Account Candidates?"}
    Step3 -- Yes --> Step3_Conflict["CREATE IDENTITY CONFLICT:<br/>Write to identity_conflicts table<br/>Halt automated recovery actions<br/>Notify founder for manual link"]
    Step3 -- No --> Step4{"High-Confidence Domain Match?"}
    Step4 -- Yes --> Step4_Prov["Create Provisional customer_account<br/>Flag for Founder Review"]
    Step4 -- No --> Step4_Unmatched["Store in provider_events as Unresolved"]
```

---

## 6. Multi-Dimensional Risk Engine & Overrides

Risk is deterministically computed from three orthogonal domains:

```mermaid
flowchart TD
    subgraph Components["Feature Projection Weights"]
        Billing["Billing Component (50% Weight)<br/>- Failed payments (1-3)<br/>- Dunning lifecycle phase<br/>- Days past due"]
        Usage["Usage Component (35% Weight)<br/>- 30-day active user drop<br/>- Core feature abandonment<br/>- Zero login > 7 days"]
        Comm["Communication Component (15% Weight)<br/>- Unreplied founder thread<br/>- Unresolved Intercom issues<br/>- Negative sentiment"]
    end

    subgraph BaseScore["Composite Risk Score"]
        ScoreFormula["Base Score = (0.50 * Billing) + (0.35 * Usage) + (0.15 * Comm)"]
    end

    subgraph Overrides["Hard Circuit-Breaker Overrides"]
        O_Cancel{"Subscription Canceled?"}
        O_PastDue{"Past Due > 7 Days?"}
        O_UsageDrop{"Usage Dropped > 70%?"}
        O_ForceCrit["FORCE RISK SCORE: 85+ (Critical)"]
    end

    subgraph Tiers["Risk Classification Tiers"]
        T_Low["0 - 44: Low Risk (Passive Monitoring)"]
        T_Med["45 - 69: Medium Risk (Automated Check-in)"]
        T_High["70 - 84: High Risk (Founder Review Required)"]
        T_Crit["85 - 100: Critical (Immediate Rescue Intervention)"]
    end

    Billing --> ScoreFormula
    Usage --> ScoreFormula
    Comm --> ScoreFormula

    ScoreFormula --> O_Cancel
    O_Cancel -- Yes --> O_ForceCrit
    O_Cancel -- No --> O_PastDue
    O_PastDue -- Yes --> O_ForceCrit
    O_PastDue -- No --> O_UsageDrop
    O_UsageDrop -- Yes --> O_ForceCrit
    O_UsageDrop -- No --> FinalComposite[Final Calculated Score]

    O_ForceCrit --> T_Crit
    FinalComposite --> T_Low
    FinalComposite --> T_Med
    FinalComposite --> T_High
    FinalComposite --> T_Crit
```

---

## 7. Recovery Case State Machine

All recovery cases follow strict, audited state transitions enforced at the database level:

```mermaid
stateDiagram-v2
    [*] --> open: Case Opened (Signal Detected)
    open --> analyzing: run_case_analysis job claimed
    open --> suppressed: Policy cooldown active
    open --> resolved: Auto-cleared / paid externally
    open --> failed: Execution error

    analyzing --> action_proposed: Draft generated
    analyzing --> suppressed: Evidence indicates noise
    analyzing --> failed: Analysis failed

    action_proposed --> awaiting_approval: Stored & presented to founder
    action_proposed --> suppressed: Suppression trigger
    action_proposed --> failed: Validation error

    awaiting_approval --> approved: Founder approves exact hash
    awaiting_approval --> suppressed: Founder dismisses
    awaiting_approval --> resolved: Resolved before outreach
    awaiting_approval --> failed: Expired TTL (24h / 2h critical)

    approved --> sent: send_approved_draft worker send
    approved --> awaiting_approval: Reopened after edit
    approved --> failed: Dispatch permanent failure

    sent --> monitoring: Monitoring 14-day window
    sent --> failed: Delivery bounced

    monitoring --> resolved: Outcome verified (G1-G5 gates)
    monitoring --> failed: Churned / window expired without recovery

    failed --> open: Manual replay by founder
    failed --> resolved: Manually resolved
    resolved --> [*]
    suppressed --> [*]
```

---

## 8. Human-in-the-Loop Hash-Bound Approval

Every draft requires explicit founder approval cryptographically bound to the exact content hash to prevent modification or prompt injection:

```mermaid
sequenceDiagram
    autonumber
    participant UI as Founder Browser
    participant API as /api/drafts/:id/approve
    participant DB as PostgreSQL transition_draft_approval RPC
    participant Worker as Durable Send Worker
    participant Gmail as External Gmail API

    UI->>UI: Founder reviews/edits draft content
    UI->>UI: Compute SHA-256(recipient + subject + body)
    UI->>API: POST { draft_id, expected_hash }

    API->>DB: CALL transition_draft_approval(draft_id, expected_hash)
    Note over DB: Atomically verify with SELECT FOR UPDATE:<br/>current_hash == expected_hash<br/>AND status == 'awaiting_approval'

    alt Hash Mismatch (Draft modified in-flight)
        DB-->>API: 409 Conflict: Hash mismatch
        API-->>UI: Alert founder: Content changed, please re-review
    else Hash Valid
        DB->>DB: Update draft.status = 'approved', case.status = 'approved'
        DB-->>API: 200 OK (Transition Committed)
        API-->>UI: UI renders 'Approved' status
        Worker->>DB: Claim 'send_approved_draft' job
        Worker->>Gmail: Send exact approved payload
        Gmail-->>Worker: Success (message_id)
        Worker->>DB: Case status -> 'dispatched'
    end
```

---

## 9. Durable Job Queue & Worker Pipeline

All asynchronous and model-heavy operations execute through `workflow_jobs` with atomic leases, bounded concurrency, and exponential backoff:

```mermaid
flowchart TD
    subgraph Stages["10-Stage Idempotent Recovery Pipeline"]
        S1["1. process_provider_event"] --> S2["2. project_account_features"]
        S2 --> S3["3. evaluate_recovery_case"]
        S3 --> S4["4. run_case_analysis"]
        S4 --> S5["5. generate_case_draft"]
        S5 --> S6["6. verify_case_draft"]
        S6 --> S7["7. notify_founder"]
        S7 --> S8["8. send_approved_draft"]
        S8 --> S9["9. sync_gmail_history"]
        S9 --> S10["10. classify_case_outcome"]
    end

    subgraph QueueMechanics["Queue Engine Mechanics"]
        Claim["Worker Claims Leased Job (FOR UPDATE SKIP LOCKED)"]
        Heartbeat["Model Heartbeat (Active every 15s during LLM calls)"]
        ResultCheck{"Job Succeeded?"}
        Success["Mark Job Completed & Enqueue Next Stage"]
        TransientFail["Exponential Backoff Retry (Max 5 attempts)"]
        PermanentFail["Mark Job Failed & Retain Detailed Error Diagnostics"]
    end

    Stages --> Claim
    Claim --> Heartbeat --> ResultCheck
    ResultCheck -- Succeeded --> Success
    ResultCheck -- Transient Error --> TransientFail
    ResultCheck -- Max Retries Exceeded --> PermanentFail
```

---

## 10. Closed-Loop Revenue Attribution (G1–G5)

Allel enforces strict financial attribution standards to prove whether recovered revenue was genuinely driven by the recovery intervention:

```mermaid
flowchart TD
    Action["Approved Recovery Action Sent (Day 0)"] --> Window["14-Day Attribution Monitoring Window"]
    Window --> Ingest["Stripe Event Ingested (invoice.paid)"]
    Ingest --> G1{"Gate 1: Exact Customer Account Match?"}
    G1 -- No --> Fail["Attribution Rejected"]
    G1 -- Yes --> G2{"Gate 2: Timestamp Within 14-Day Window?"}
    G2 -- No --> Fail
    G2 -- Yes --> G3{"Gate 3: Invoice ID Matches At-Risk Invoice?"}
    G3 -- Yes --> StrictPass["ATTRIBUTED: Strict Recovered MRR<br/>(Failed invoice directly collected)"]
    G3 -- No --> G4{"Gate 4: Active Subscription Renewal Retained?"}
    G4 -- Yes --> ProtPass["ATTRIBUTED: Protected Revenue<br/>(Imminent churn prevented, contract renewed)"]
    G4 -- No --> G5{"Gate 5: Usage Recovery Benchmark Met (>50% rebound)?"}
    G5 -- Yes --> ProtPass
    G5 -- No --> Fail
```

---

## 11. Daily Cron & Brief Delivery Pipeline

Every morning at `04:00 UTC`, the automated reconciliation cron orchestrates provider sync, queue processing, and founder brief delivery:

```mermaid
sequenceDiagram
    autonumber
    participant Vercel as Vercel Cron (04:00 UTC)
    participant CronAPI as /api/cron/daily-run
    participant Sync as Provider Sync Engine
    participant Worker as Internal Queue Worker
    participant Brief as Brief Generation Engine
    participant Delivery as Resend / Slack / Gmail

    Vercel->>CronAPI: POST /api/cron/daily-run (Authorization: Bearer CRON_SECRET)
    CronAPI->>CronAPI: Verify CRON_SECRET header

    loop For each active Workspace
        CronAPI->>Sync: Reconcile Stripe (Invoices & Subscriptions)
        CronAPI->>Sync: Reconcile PostHog (Usage Trends & Active Users)
        CronAPI->>Sync: Reconcile Gmail (Inbound Thread Deltas)
        Sync-->>CronAPI: Ingestion completed

        CronAPI->>Worker: Drain workflow_jobs queue (batch_size: 50)
        Worker-->>CronAPI: Leased jobs executed

        CronAPI->>Brief: Synthesize prioritized Founder Daily Brief
        Brief-->>CronAPI: Brief generated: Accounts at Risk, Revenue Saved, Pending Drafts

        CronAPI->>Delivery: Dispatch brief via Email (Resend/Gmail) and Slack
        Delivery-->>CronAPI: Delivery confirmed
    end

    CronAPI-->>Vercel: 200 OK { success: true, workspaces_processed: N }
```
