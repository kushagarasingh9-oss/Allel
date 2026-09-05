# Allel Agent Runtime & Orchestration

> **Specialized technical reference.** Start with the repository [`README.md`](../README.md) for the product overview. Architecture blueprint: [`ALLEL.md`](ALLEL.md). Tool selection details: [`tool_calling.md`](tool_calling.md).
> Last source audit: **2026-09-05**. Verified against `platform/src/agent/`.

---

## Contents

- [1. Agent Runtime Architecture](#1-agent-runtime-architecture)
- [2. Multi-Step Execution Loop](#2-multi-step-execution-loop)
- [3. Dynamic Schema Expansion Pipeline](#3-dynamic-schema-expansion-pipeline)
- [4. Persona Hierarchy & Capabilities](#4-persona-hierarchy--capabilities)
- [5. Memory Architecture & Cryptographic Integrity](#5-memory-architecture--cryptographic-integrity)
- [6. Self-Healing, Retries & Model Fallbacks](#6-self-healing-retries--model-fallbacks)
- [7. Execution Telemetry & Audit Trail](#7-execution-telemetry--audit-trail)
- [8. Codebase Implementation & Source Locations](#8-codebase-implementation--source-locations)

---

## 1. Agent Runtime Architecture

Allel builds AI SDK 6 `ToolLoopAgent` instances over a comprehensive registry of **164 registered tools** (`platform/src/agent/runtime/agent.ts`). The agent acts as an intelligent operating interface across connected SaaS tools, never hallucinating or mutating state without deterministic validation:

```mermaid
flowchart TB
    subgraph Input["Turn Ingestion"]
        UserMsg["User Message / Prompt"]
        PersonaSel["Selected Persona: Allel / Henry / Sarah"]
        SessionCtx["Session Context (user_id, workspace_id, session_id)"]
    end

    subgraph MemorySubsystem["Memory & Trust Subsystem"]
        SignedMem["Signed Conversation Turns (HMAC-SHA256)"]
        Sanitizer["History Sanitizer & Schema Normalizer"]
        Compactor["Context Compactor (Goals, Commitments, Summaries)"]
        AccountMem["Deterministic Account Memory (Signals, Invoices, Timeline)"]
    end

    subgraph DynamicRouting["Routing & Schema Pipeline"]
        Allowlist["Persona Tool Allowlist Filter"]
        FuzzyRouter["Semantic & Fuzzy Keyword Domain Router"]
        ActiveSubset["Bounded Active Tool Subset (8-12 tools)"]
        SyntheticTool["requestMoreTools Synthetic Domain Activator"]
        PrepareStep["prepareStep In-Loop Dynamic Schema Expansion"]
    end

    subgraph ExecutionSubsystem["Execution & Guard Subsystem"]
        LoopEngine["ToolLoopAgent (Max 25 Steps, Temp 0.3)"]
        ProviderGuards["Live Provider Readiness & Credential Guards"]
        Telemetry["Telemetry Logger (Tokens, Cost, Steps, Tools)"]
        MismatchCheck["Announced-Action Mismatch Detector"]
    end

    Input --> MemorySubsystem
    MemorySubsystem --> DynamicRouting
    DynamicRouting --> ExecutionSubsystem
    ExecutionSubsystem --> StreamOutput["Streamed UI Response & TimelineNodes"]
```

---

## 2. Multi-Step Execution Loop

Every turn executes through a stateful multi-step loop supporting up to 25 reasoning and tool execution steps:

```mermaid
sequenceDiagram
    autonumber
    participant UI as Chat UI (Stream Subscriber)
    participant Router as Prompt & Fuzzy Router
    participant Agent as ToolLoopAgent (AI SDK 6)
    participant Expand as prepareStep Hook
    participant Guard as Provider Readiness Guard
    participant Tool as Tool Implementation
    participant Audit as Run Telemetry Logger

    UI->>Router: POST /api/agent { prompt, persona, sessionId }
    Router->>Router: Match keywords to domain (e.g. 'stripe', 'posthog')
    Router->>Agent: Initialize with bounded active tools (e.g. 10 tools)

    loop Multi-Step Reasoning (Up to 25 steps)
        Agent->>Agent: Model evaluates prompt & active tool schemas
        alt Model needs additional domain (e.g. Intercom)
            Agent->>Expand: Call synthetic tool 'requestMoreTools("intercom")'
            Expand->>Expand: Verify domain in persona allowlist
            Expand-->>Agent: Dynamically inject Intercom tool schemas on next step
        else Model calls an operational tool (e.g. getUnifiedCustomerScan)
            Agent->>Guard: Invoke tool with validated parameters
            Guard->>Guard: Check integration status & decrypt API tokens
            alt Provider Unconnected / Unhealthy
                Guard-->>Agent: Return structured 'Provider Unavailable' (Zero hallucination)
            else Provider Healthy
                Guard->>Tool: Execute tool with workspace scope
                Tool-->>Agent: Return verified JSON payload
            end
        end
    end

    Agent->>Audit: Record steps, tools used, token usage, cost estimate
    Agent-->>UI: Stream complete Markdown with rich TimelineNodes
```

---

## 3. Dynamic Schema Expansion Pipeline

Loading all 164 tool definitions on every turn would inflate the prompt by ~45,000 tokens, degrading model focus and increasing latency. Allel solves this with **on-demand domain activation**:

```mermaid
flowchart TD
    Prompt["User Prompt: 'Investigate Acme payment issue and check recent Intercom tickets'"] --> Step1["1. Match Prompt Keywords<br/>Detected: 'payment' -> stripe, 'tickets' -> intercom"]
    Step1 --> Step2["2. Build Initial Active Set (Bounded to ~10 tools)<br/>Includes: Stripe tools + Intercom tools + Core account tools"]
    Step2 --> Step3["3. Inject Synthetic 'requestMoreTools' Definition"]
    Step3 --> Step4["4. ToolLoopAgent Step 1 Execution"]
    Step4 --> Step5{"Does Model Need Unloaded Tools?<br/>(e.g. wants to check Sentry errors)"}
    Step5 -- No --> Step6["Execute Active Tools & Complete Turn"]
    Step5 -- Yes --> Step7["Call requestMoreTools('sentry')"]
    Step7 --> Step8["5. prepareStep Interceptor:<br/>Activates Sentry tools for Step 2<br/>Rebuilds dynamic system prompt instructions"]
    Step8 --> Step4
```

---

## 4. Persona Hierarchy & Capabilities

Allel provides three specialized personas with strictly enforced capability boundaries:

```mermaid
flowchart LR
    subgraph Alex["Allel (Internal: 'alex')"]
        direction TB
        A_Title["AI Co-founder"]
        A_Scope["164 Tools (Full Registry)<br/>Full cross-functional visibility<br/>Billing, Analytics, CRM, Dev, Workflows"]
    end

    subgraph Sarah["Sarah"]
        direction TB
        S_Title["Head of Retention"]
        S_Scope["Retention Allowlist (62 Tools)<br/>Stripe, PostHog, Recovery Cases,<br/>Drafts, Calendar, Slack Alerts"]
    end

    subgraph Henry["Henry"]
        direction TB
        H_Title["Head of Growth"]
        H_Scope["Growth Allowlist (48 Tools)<br/>HubSpot, Intercom, Research,<br/>Tavily Web Search, Drafts"]
    end
```

### Persona Tool Allowlists Comparison

| Capability Group | Allel (`alex`) | Sarah (Retention) | Henry (Growth) |
|---|:---:|:---:|:---:|
| **Account Intelligence** (Scans, Memory, Signals) | Full Access | Full Access | Full Access |
| **Billing & Stripe** (Invoices, Subscriptions, Dunning) | Full Access | Full Access | Read-Only |
| **Product Usage** (PostHog Events, Cohorts, Flags) | Full Access | Full Access | No Access |
| **Outreach & Gmail** (Threads, Draft Generation) | Full Access | Full Access | Full Access |
| **Calendar & Scheduling** (Google Calendar Events) | Full Access | Full Access | Read-Only |
| **Support & Friction** (Intercom Conversations) | Full Access | Read-Only | Full Access |
| **CRM & Pipelines** (HubSpot Companies & Deals) | Full Access | Read-Only | Full Access |
| **Engineering & Errors** (Linear Tasks, Sentry Issues) | Full Access | Read-Only | No Access |
| **Knowledge Base** (Notion Runbooks, Airtable) | Full Access | Read-Only | Full Access |
| **Web Research** (Tavily Search & Extraction) | Full Access | No Access | Full Access |

---

## 5. Memory Architecture & Cryptographic Integrity

To prevent cross-tenant memory leakage and prompt injection attacks, Allel isolates and cryptographically signs conversation memory:

```mermaid
flowchart TD
    subgraph ClientReq["Incoming Client Turn"]
        RawMsg["Client History Payload"]
        SigHeader["X-Allel-Signature Header"]
    end

    subgraph MemoryEngine["chat-memory.ts Engine"]
        TenantScope["1. Scope Key Validation<br/>key = user_id:workspace_id:persona:session_id"]
        SigCheck{"2. Cryptographic Verification<br/>HMAC-SHA256(content, AGENT_HISTORY_SIGNING_SECRET)"}
        Sanitize["3. Sanitize UI Components & Strip Unsafe HTML"]
        Windowing["4. Sliding Window: Retain Last 10 Turns"]
        Compaction["5. Structured Context Compaction<br/>- Strategic Goals<br/>- Active Commitments<br/>- Mentioned Accounts"]
    end

    subgraph AssembledPrompt["Assembled Agent Context"]
        SysPrompt["Base Persona Prompt"]
        CompactedContext["Compacted Session Summaries"]
        ActiveHistory["Verified Recent Turns"]
        AccountFacts["Reconstructed Account Memory"]
    end

    ClientReq --> TenantScope
    TenantScope --> SigCheck
    SigCheck -- Valid --> Sanitize
    SigCheck -- Invalid/Tampered --> Reject["Strip Untrusted Assistant Metadata"]
    Sanitize --> Windowing
    Windowing --> Compaction
    Compaction --> AssembledPrompt
```

---

## 6. Self-Healing, Retries & Model Fallbacks

External LLM providers occasionally suffer from rate limits, timeouts, or transient 5xx errors. Allel includes a multi-layered resilience pipeline:

```mermaid
flowchart TD
    StartStep["Execute Model Step"] --> TryPrimary["Call Primary Model (e.g. GPT-4o / Azure)"]
    TryPrimary --> CheckSuccess{"Step Succeeded?"}
    CheckSuccess -- Yes --> LogRun["Persist Run Telemetry"]
    CheckSuccess -- No (Transient Upstream Error) --> RetryCheck{"Attempts < 10?"}
    RetryCheck -- Yes --> BackoffWait["Exponential Backoff Delay"] --> TryPrimary
    RetryCheck -- No --> FallbackCheck{"AGENT_FALLBACK_MODEL_ID Configured?"}
    FallbackCheck -- Yes --> TryFallback["Invoke Fallback Model (e.g. GPT-4o-mini)"]
    TryFallback --> CheckFallbackSuccess{"Fallback Succeeded?"}
    CheckFallbackSuccess -- Yes --> LogRun
    CheckFallbackSuccess -- No --> GracefulError["Return Clean Error to UI with Recovery Guidance"]
    FallbackCheck -- No --> GracefulError
```

---

## 7. Execution Telemetry & Audit Trail

Every agent run writes a durable telemetry trace to the `agent_runs` table:

```mermaid
flowchart LR
    Run["Agent Run Completed"] --> Audit["run-logger.ts"]
    Audit --> Record1["Model & Token Usage (Input / Output / Cost)"]
    Audit --> Record2["Executed Tools & Step Trace"]
    Audit --> Record3["Schema Expansion History"]
    Audit --> Record4["Announced-Action Verification Check"]

    Record4 --> MismatchRule{"Did Agent Promise an Action in Text<br/>but Execute Zero Tools?"}
    MismatchRule -- Yes --> Flag["Flag: 'unfulfilled_action_detected'<br/>Visible in /api/agent/runs"]
    MismatchRule -- No --> CleanPass["Mark Run Status: 'verified_complete'"]
```

---

## 8. Codebase Implementation & Source Locations

For code reviewers inspecting the agent runtime, memory, and orchestration layer, key implementation files in `platform/` include:

| Subsystem Component | Source Code Path | Architectural Responsibility |
|---|---|---|
| **AI SDK 6 Agent Loop** | [`platform/src/agent/runtime/agent.ts`](../platform/src/agent/runtime/agent.ts) | Core `ToolLoopAgent` orchestration, multi-step execution, dynamic schema expansion, and streaming. |
| **Session Memory & Cryptography** | [`platform/src/agent/memory/chat-memory.ts`](../platform/src/agent/memory/chat-memory.ts) | HMAC-SHA256 signature verification, history sanitization, sliding window, and context compaction. |
| **Account Memory Extraction** | [`platform/src/agent/memory/account-memory.ts`](../platform/src/agent/memory/account-memory.ts) | Extracts deterministic customer facts (signals, invoices, timeline) from Supabase. |
| **Persona Instructions & Allowlist** | [`platform/src/agent/personas/`](../platform/src/agent/personas/) | Persona prompt definitions (`allel-instructions.ts`, `sarah-instructions.ts`, `henry-instructions.ts`, `intent-identity-instructions.ts`). |
| **Run Telemetry & Token Audit** | [`platform/src/agent/runtime/run-logger.ts`](../platform/src/agent/runtime/run-logger.ts) | Writes execution metrics, model costs, tool traces, and unfulfilled action flags to `agent_runs`. |
| **Error Classifier & Fallbacks** | [`platform/src/agent/runtime/error-classifier.ts`](../platform/src/agent/runtime/error-classifier.ts) | Classifies 429/5xx errors, schedules exponential backoff retries, and switches to fallback models. |
| **Chat Streaming API Route** | [`platform/src/app/api/agent/route.ts`](../platform/src/app/api/agent/route.ts) | Edge/Node App Router route streaming agent tokens, tool events, and TimelineNodes to UI. |
| **Run Inspection API** | [`platform/src/app/api/agent/runs/route.ts`](../platform/src/app/api/agent/runs/route.ts) | Inspects and paginates execution traces, step latencies, and tool calls. |
| **Test Matrix: Memory Integrity** | [`platform/src/agent/memory/chat-memory.test.ts`](../platform/src/agent/memory/chat-memory.test.ts) | Validates HMAC tamper detection, session isolation, and turn reconciliation. |
| **Test Matrix: Session Management** | [`platform/src/agent/memory/chat-session.test.ts`](../platform/src/agent/memory/chat-session.test.ts) | Tests scoped session keys, deduplication, and workspace scoping. |
| **Test Matrix: Telemetry Logging** | [`platform/src/agent/runtime/run-inspection.test.ts`](../platform/src/agent/runtime/run-inspection.test.ts) | Tests run serialization, redaction, and token cost attribution. |

