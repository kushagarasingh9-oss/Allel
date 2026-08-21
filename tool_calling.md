# Allel Agent Tool Calling & Routing Architecture

> **Document Type:** System Architecture & Execution Lifecycle  
> **Status:** Active & Authoritative  
> **Coverage:** Prompt Routing, Domain Matching, Keyword Fuzzy/Typo Matching, Fallback Engine, LLM Schema Assembly, Execution & Capability Guarding.

---

## 1. Executive Overview

When a user submits a message in the Allel chat interface, Allel does **not** dump all 133+ internal tools directly into the LLM context. Doing so degrades model routing accuracy, causes parameter confusion, and increases latency/token consumption.

Instead, Allel executes an intelligent **2-Phase Pipeline**:
1. **Deterministic Intent & Domain Router (Pre-LLM):** Scans the newest user prompt and chat context history against domain groups and keyword sets, selecting the optimal subset of tools (~14 tools).
2. **Dynamic LLM Tool Loop Execution (In-LLM):** The Vercel AI SDK invokes the model with only the selected tool schemas. The model picks the appropriate tool, inspects workspace connection states via guards, and streams back responses.

```
┌────────────────────────────────────────────────────────┐
│                   User Types Prompt                    │
│      "now chekmy mails and the calender togragther"     │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│  Phase 1: Pre-LLM Dynamic Tool Selection & Scoring     │
│  File: web/src/lib/agent/agent.ts                      │
│  Function: selectRelevantToolsForPrompt()              │
│                                                        │
│  1. Always-on Core Tools (inspectIntegrations, etc.)   │
│  2. Latest Line Domain Regex Match (Primary)           │
│  3. Historical Messages Regex Match (Secondary)        │
│  4. Extract Previously Invoked Tool Names              │
│  5. Fallback Check: If 0 Signals -> Load Full Schema   │
└───────────────────────────┬────────────────────────────┘
                            │ Selected Sub-Schema (~14 Tools)
                            ▼
┌────────────────────────────────────────────────────────┐
│  Phase 2: LLM Tool Execution Loop                      │
│  File: web/src/app/api/agent/route.ts                  │
│                                                        │
│  - System Prompt + Turn Context Prompt Injected        │
│  - Model runs with scoped Tool Schemas                 │
│  - Model evaluates if tools exist in current sub-schema │
│  - If needed tool missing -> inspectIntegrations called │
│  - Executes live provider API & Formats Co-Founder response
└────────────────────────────────────────────────────────┘
```

---

## 2. Step-by-Step Tool Calling Lifecycle

### Step 1: Prompt Ingestion & Conversation Windowing
When the user sends a message, `route.ts` collects:
- The **latest user message** (e.g., `"checj calender"`).
- The **retained chat history window** (`recentMessages`).
- The plain text concatenation of all user turns (`conversationText`).

### Step 2: Deterministic Domain Keyword Matching
In `web/src/lib/agent/agent.ts`, `selectRelevantToolsForPrompt()` evaluates the prompt:

1. **Always-On Core Tools (Base Set):**
   - `inspectIntegrationConnectionsTool`
   - `getAccountDetails`
   - `getAccountMemory`
   - `getAllAccounts`
   - `getAccountTimeline`
   - `getExistingDrafts`
   - `resolveAccountByContact`

2. **Domain Groups Evaluation:**
   The prompt is split into the `latestText` and `historyText`. Allel matches them against 11 predefined domain groups in `TOOL_DOMAIN_GROUPS`:
   - `google_calendar` (Calendar, meetings, agendas, schedule)
   - `gmail` (Email, inbox, drafts, replies, messages)
   - `stripe` (MRR, billing, revenue, churn, subscriptions, discounts)
   - `slack` (Channels, messages, chat, DMs, team)
   - `notion` (Docs, knowledge base, wiki, notes, pages)
   - `posthog` (Analytics, funnels, cohort, usage, feature flags)
   - `linear` (Issues, tickets, bugs, tasks, kanban)
   - `intercom` (Support, conversations, tickets)
   - `hubspot` (CRM, deals, contacts, companies, pipelines)
   - `sentry` (Errors, crashes, exceptions, logs, stacktraces)
   - `airtable` (Bases, tables, records)
   - `web_research` (Web crawl, scrape, search)

3. **Routing Signal & Fallback Decision:**
   ```ts
   const hasRoutingSignal = domainMatchedTools.size > 0 || historyToolNames.length > 0
   if (!hasRoutingSignal) {
     return [...availableToolNames] // Fallback: Return all 133 tools
   }
   return [...new Set([...availableCoreTools, ...domainMatchedTools, ...historyToolNames])]
   ```

### Step 3: Schema Construction & Model Invocation
`getAgentForPersona()` creates an AI SDK `ToolLoopAgent` containing **only** the selected tool definitions.

The system prompt explicitly declares the active tools in the `Runtime Contract`:
```text
Available tools in this run:
inspectIntegrationConnectionsTool, getMyInbox, sendGmailReply, ...
```

---

## 3. Why the Calendar "Not Loaded" Issue Occurred

### The Exact Bug Scenario:
1. **The Prompt:** `"now chekmy mails and the calender togragther"`
2. **What Happened in Domain Matching:**
   - `"mails"` matched the `gmail` regex `\b(mail|mails|email...)\b` ✅
   - `"calender"` (with an **`e`**) was checked against `google_calendar` regex `\b(calendar|cal|meeting...)\b`. Because of the `e`, it **failed word-boundary matching** ❌
3. **The Resulting Tool Set:**
   - `domainMatchedTools` was **NOT empty** (it contained Gmail tools).
   - Because it was not empty, `hasRoutingSignal` was `true`.
   - The Fallback Engine (which loads all tools when confused) was **bypassed**.
   - Output tool set: `[Core Tools + Gmail Tools]`. Calendar tools were omitted!
4. **Why the AI Explained:** *"Your Google Calendar is connected, but the tool isn't loaded in this chat session"*:
   - The AI wanted to check the calendar.
   - It checked its active tools list and saw `listCalendarEventsTool` was missing.
   - The system instructions state:
     > *"A tool missing from this turn's list is a routing fact about this turn only. Never tell the founder a capability does not exist or is disconnected when it is not. Before declaring any action impossible, call inspectIntegrationConnectionsTool."*
   - The AI called `inspectIntegrationConnectionsTool`, verified Google Calendar was `connected: true`, and accurately synthesized the answer:
     > *"Your Google Calendar is connected and synced. The calendar tool isn't loaded in this chat turn, but it's live in your workspace."*

---

## 4. Architectural Improvements for Resilient Tool Matching

To make tool matching 100% robust against typos, slang, and compound intents:

### 1. Typo-Tolerant Domain Regexes
Expand `TOOL_DOMAIN_GROUPS` to include common typos and contractions:
- **Calendar:** `calendar|calender|calndr|gcal|cal|meeting|meetings|schdule|schedule|schedual|event|events`
- **Gmail:** `email|emails|mail|mails|gmail|gamil|mial|inbox|imbox|drafts`
- **Stripe:** `stripe|strpi|strip|billing|mrr|churn|revenue|invoice|subsciption`
- **Notion:** `notion|knowlege|knowlee|knowledge|doc|docs|notes`

### 2. Multi-Domain Intent Awareness
When multiple domain terms are detected in a prompt (e.g. "mails and calendar"), all corresponding domain tool sets are unioned into the active tool surface.

### 3. Graceful Fuzzy Fallback
If any word in the prompt has a Levenshtein distance $\le 1$ to a domain keyword, activate that domain toolset.

---

## 5. Summary Table: Tool Flow Matrix

| Layer | Input | Output / Action |
|---|---|---|
| **Chat Input** | `"check mails and calender"` | Raw prompt string |
| **Token Scorer** | Regex Token Matcher | Matches `gmail` + `google_calendar` |
| **Tool Filter** | 133 Available Persona Tools | Filters down to 14 active tools (Gmail + Calendar + Core) |
| **System Prompt Injection** | Active Tool Surface list | Injects active tool names into the runtime context block |
| **LLM Inference** | User message + Scoped Schemas | Model calls `getMyInbox()` & `listCalendarEventsTool()` in parallel |
| **Guard & Execution** | `wrapToolWithLiveIntegrationGuard` | Verifies DB connection row, executes API, sanitizes untrusted data |
| **Streaming UI** | Tool result chunks | Renders executive summary + clean thinking blocks |
