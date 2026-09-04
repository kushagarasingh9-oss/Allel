# Agent Tool Calling & Dynamic Routing

> **Specialized technical reference.** Start with the repository [`README.md`](../README.md) for the product overview. Agent runtime: [`AGENT.md`](AGENT.md).
> Last source audit: **2026-09-05**. Verified against `platform/src/agent/runtime/agent.ts` (164 tools in `ALL_TOOLS`).

---

## Contents

- [1. The 5-Stage Tool Routing Pipeline](#1-the-5-stage-tool-routing-pipeline)
- [2. Complete 164-Tool Registry Taxonomy](#2-complete-164-tool-registry-taxonomy)
- [3. Dynamic Schema Expansion (`prepareStep`)](#3-dynamic-schema-expansion-preparestep)
- [4. Provider Readiness & Credential Guard](#4-provider-readiness--credential-guard)
- [5. Telemetry & Announced-Action Audit](#5-telemetry--announced-action-audit)

---

## 1. The 5-Stage Tool Routing Pipeline

Allel orchestrates a large registry of **164 registered tools** without overwhelming model context or paying unnecessary token costs. It uses a 5-stage routing pipeline:

```mermaid
flowchart TD
    UserQuery["Incoming User Request"] --> Stage1["STAGE 1: Persona Allowlist Filter<br/>Allel (164) | Sarah (62) | Henry (48)"]
    Stage1 --> Stage2["STAGE 2: Semantic & Levenshtein Keyword Matcher<br/>Extracts domain terms: 'stripe', 'invoice', 'posthog', 'slack'"]
    Stage2 --> Stage3["STAGE 3: Bounded Active Tool Subset<br/>Activates top 8-12 tools for current domains"]
    Stage3 --> Stage4["STAGE 4: ToolLoopAgent Step Execution<br/>Model evaluates prompt with active schemas"]
    Stage4 --> Decision{"Does Model Need Unloaded Tools?"}
    Decision -- Yes --> Expand["STAGE 4b: In-Loop Dynamic Expansion<br/>requestMoreTools -> prepareStep injects schemas"]
    Expand --> Stage4
    Decision -- No --> Stage5["STAGE 5: Provider Readiness & Execution Guard<br/>Verify OAuth status, decrypt tokens, execute tool"]
    Stage5 --> Audit["Persist Telemetry & Stream TimelineNode to UI"]
```

---

## 2. Complete 164-Tool Registry Taxonomy

The 164 tools in `ALL_TOOLS` are organized into 12 functional domains:

```mermaid
flowchart TB
    subgraph Registry["Allel Tool Registry (164 Active Tools)"]
        direction TB
        subgraph Core["Account & Intelligence (14 Tools)"]
            T_Scan["runRevenueRiskScan, getUnifiedCustomerScan, getUnifiedFleetScan"]
            T_Acc["getAccountDetails, getAccountMemory, getAllAccounts, updateAccountRisk"]
            T_Draft["generateFollowUpDraft, createSignal, addTimelineEvent, createRescueDiscountTool"]
        end

        subgraph Billing["Billing & Subscriptions - Stripe (26 Tools)"]
            T_StripeRead["getStripeCustomerOverviewTool, getStripeSubscriptionsTool, getStripeInvoicesTool"]
            T_StripeActions["createStripeCouponTool, cancelStripeSubscriptionTool, refundStripeCharge"]
        end

        subgraph Analytics["Product Analytics - PostHog (18 Tools)"]
            T_PHRead["getPostHogEventsTool, getPostHogFeatureFlagTool, getPostHogTrendsTool"]
            T_PHActions["togglePostHogFeatureFlag, createPostHogCohortTool"]
        end

        subgraph Email["Email & Communications - Gmail (16 Tools)"]
            T_GmailRead["getMyInbox, getGmailThreadDetailTool, searchGmailMessagesTool"]
            T_GmailActions["createDraftEmailTool, sendEmailTool, replyToEmailTool"]
        end

        subgraph Support["Customer Support - Intercom (12 Tools)"]
            T_Intercom["getIntercomConversationsTool, replyIntercomConversationTool, getIntercomCustomerTool"]
        end

        subgraph CRM["Sales & Deals - HubSpot (14 Tools)"]
            T_HubSpot["getHubSpotCompanyTool, getHubSpotDealsTool, updateHubSpotDealStageTool"]
        end

        subgraph Dev["Engineering & Errors - Linear & Sentry (18 Tools)"]
            T_Linear["getLinearIssuesTool, createLinearIssueTool, updateLinearIssueStatusTool"]
            T_Sentry["getSentryProjectErrorsTool, getSentryIssueDetailsTool"]
        end

        subgraph Collab["Collaboration & Knowledge (24 Tools)"]
            T_Slack["postSlackMessageTool, getSlackChannelsTool"]
            T_Calendar["getCalendarEventsTool, createCalendarEventTool"]
            T_Notion["getNotionPageTool, searchNotionDatabaseTool"]
            T_Airtable["getAirtableRecordsTool, updateAirtableRecordTool"]
        end

        subgraph Research["External Intel - Tavily (8 Tools)"]
            T_Tavily["tavilySearchTool, tavilyExtractTool, tavilyCrawlTool"]
        end

        subgraph Synthetic["Dynamic Control (14 Tools)"]
            T_Expand["requestMoreTools, requestAccountContextTool"]
        end
    end
```

---

## 3. Dynamic Schema Expansion (`prepareStep`)

To enable the model to discover tools on the fly without sending all 164 schemas upfront, Allel employs the synthetic `requestMoreTools` tool:

```mermaid
sequenceDiagram
    autonumber
    participant Model as ToolLoopAgent
    participant Expand as prepareStep Hook
    participant Persona as Persona Allowlist
    participant Registry as ALL_TOOLS Registry

    Model->>Model: Analyzes prompt: "Check Acme's recent Linear bugs"
    Note over Model: Active schemas only contain Stripe & PostHog
    Model->>Expand: CALL requestMoreTools({ domain: "linear", reason: "Check open bug tickets" })

    Expand->>Persona: Validate "linear" against active persona allowlist
    alt Domain Not Permitted for Persona
        Persona-->>Model: Error: Domain not permitted for active persona
    else Domain Permitted
        Persona-->>Expand: Approved
        Expand->>Registry: Retrieve Linear tool definitions (10 tools)
        Expand->>Model: Inject schemas into active tool dictionary for Step 2
        Expand->>Model: Update runtime system prompt with Linear usage instructions
        Model->>Model: Step 2: Now successfully calls getLinearIssuesTool({ accountId })
    end
```

---

## 4. Provider Readiness & Credential Guard

Allel wraps all provider-backed tools with a **Provider Readiness Guard** (`platform/src/agent/runtime/agent.ts`). This ensures that missing or broken integrations return structured diagnostic data instead of letting the model hallucinate fabricated responses:

```mermaid
flowchart TD
    ToolCall["Agent Invokes Provider Tool (e.g. getStripeSubscriptionsTool)"] --> Guard["Provider Readiness Guard Wrapper"]
    Guard --> DB_Check{"Check integration_connections table:<br/>Row exists & status == 'connected'?"}
    DB_Check -- No --> RetUnavail["Return Structured JSON:<br/>{ available: false, error: 'Stripe integration is not connected' }"]
    DB_Check -- Yes --> Decrypt{"Decrypt Access Token (AES-256-GCM)"}
    Decrypt -- Decryption Failed --> RetExpired["Return Structured JSON:<br/>{ available: false, error: 'Invalid or expired credentials' }"]
    Decrypt -- Success --> Run["Execute Live API Call with Authenticated Client"]
    Run --> API_Resp{"Provider Response Code"}
    API_Resp -- 200 OK --> FormatResult["Return Verified Evidence Payload to Agent"]
    API_Resp -- 401/403 --> RetAuthFail["Mark Connection 'expired' & Return Explicit Error"]
    API_Resp -- 429/5xx --> RetRateLimit["Return Transient Upstream Error to Agent"]
```

---

## 5. Telemetry & Announced-Action Audit

To prevent agents from falsely promising actions in chat without actually performing them, Allel audits tool calls against model responses:

```mermaid
flowchart LR
    TurnComplete["Agent Turn Completed"] --> Parser["Turn Analyzer"]
    Parser --> CheckText{"Model Output Promises Action?<br/>e.g. 'I have refunded the charge'"}
    Parser --> CheckCalls{"Executed Tool Calls Count"}

    CheckText -- Mentions Action --> EvalMismatch{"Tool Calls >= 1?"}
    EvalMismatch -- Yes --> Clean["Status: 'verified_action_executed'"]
    EvalMismatch -- No --> Flag["FLAG MISMATCH:<br/>'unfulfilled_action_detected'<br/>Recorded in agent_runs table"]

    CheckText -- Neutral Answer --> Pass["Status: 'informational_response'"]
```
