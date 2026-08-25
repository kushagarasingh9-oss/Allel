# ⚔️ Allel: The Engineering War Stories & Hacker Memoir

> *"If you haven't burned 63,000 tokens in 8 seconds while Azure screams at you to buy Provisioned Throughput, have you even built an AI agent?"*

---

## 📜 Prologue: Building an AI Co-founder is Not for the Faint of Heart

Building **Allel** wasn’t just stitching APIs together. It was a chaotic battle against token limits, rogue agent loops, invisible database vampires, and Azure quota governors.

Here is the unfiltered, slightly sarcastic, highly educational record of the craziest bugs we faced, how everything almost went up in flames, and how we engineered our way out.

---

## 💥 Episode 1: The "100k TPM Evaporation" Incident

### 💀 The Bug:
We were testing `"get me updated for today"`.
- Step 1: Agent calls Google Calendar 🗓️
- Step 2: Agent calls Gmail ✉️
- Step 3: Agent calls Stripe 💳
- Step 4: Red screen of death:  
  `API Rate Limit Exceeded: Your requests to Kimi-K2.6 in eastus have exceeded rate limit.`

### 🕵️ The Crime Scene:
We looked at Azure's dashboard. **100,000 Tokens Per Minute limit wiped out in 8 seconds flat.**
*How?*

Because on *every single tool step* of the multi-step loop, the runtime was sending:
1. All **136 tool schemas** (8,500 tokens of JSON definitions)
2. The entire system prompt (2,500 tokens)
3. The previous tool's uncompressed raw data (4,500 tokens of MIME headers, SIP pins, and internal IDs)

```
Call 1: 11,000 tokens  (Prompt + 136 Schemas)
Call 2: 13,500 tokens  (Prompt + 136 Schemas + Calendar)
Call 3: 18,000 tokens  (Prompt + 136 Schemas + Calendar + Mail)
Call 4: 21,200 tokens  (Prompt + 136 Schemas + Calendar + Mail + Stripe)
─────────────────────────────────────────────────────────────
TOTAL PER MESSAGE: 63,700 TOKENS!
```
If you sent a greeting, then an update within 60 seconds: **63k + 63k = 126k tokens ➔ Instant rate-limit ban.** 💀

### 🛠️ The Fix (Pillars 1 & 2):
1. **Tool Scoping**: Stopped dumping all 136 schemas like an animal. Scoped to the ~14 relevant domain tools (~1,800 tokens).
2. **Payload Whitelisting**: Stripped out raw HTML links, SIP pins, and MIME junk. Calendar went from 2,500 tokens to 280 tokens. Mail went from 4,500 tokens to 420 tokens.
3. **Result**: 63,700 tokens ➔ **4,700 tokens**. From 1.5 runs/minute to **20+ runs/minute** capacity. 🚀

---

## 🧛 Episode 2: The Invisible Database Vampire (The HMAC Ghost)

### 💀 The Bug:
A founder sends a message. The agent executes tools, streams thinking, and gives a brilliant response.  
The founder refreshes the page.  
**POOF.** 💨 Everything disappears. The chat resets to a blank screen like nothing ever happened.

### 🕵️ The Crime Scene:
We checked Supabase: The messages were written in the `agent_conversations` table!
So why wasn't the frontend showing them?

We dug into `chat-memory.ts`. When the server loaded its *own database records*, it was running them through `sanitizeClientUiMessages()`.
This function had a cryptographic HMAC SHA-256 signature verification designed for *untrusted client browser payloads*.

Because streaming UI `parts` formatted slightly differently when saved to JSON, the server's own verification failed by 1 byte, and the code **silently threw away every single assistant response in the database**:
```ts
if (hasValidTrustedMetadata(candidate, context)) return true
rejectedAssistantCount += 1
return false // 💀 "I don't trust my own database, delete the message"
```
The server was literally gaslighting itself into amnesia.

### 🛠️ The Fix:
Created `sanitizePersistedDatabaseMessages()` which trusts database rows authenticated by the service role. Also switched session tracking from transient `sessionStorage` to persistent `localStorage`.  
**Result:** History now restores 100% permanently across reloads, browser restarts, and new tabs. 💾

---

## 🌊 Episode 3: Azure's "Buy Provisioned Throughput" Peak-Load Tantrum

### 💀 The Bug:
The agent was running mid-stream when Azure returned an HTTP 400 with a message that read:
> *"The system is currently experiencing high demand and cannot process your request. Your request exceeds the maximum usage size allowed during peak load. For improved capacity reliability, consider switching to Provisioned Throughput."*

Basically, Microsoft's data center was busy, and it was telling us to upgrade to an enterprise tier that costs thousands of dollars a month.

### 🕵️ The Crime Scene:
Azure OpenAI Global Standard has a dynamic surge governor. When regional traffic spikes, it temporarily drops the allowed request payload size. Because our Step 3 request had raw mail bodies + all schemas, Azure's surge gate slammed shut on us.

Furthermore, Azure wasn't sending standard `retry-after` HTTP headers; it was sending `x-ratelimit-reset-tokens: "24s"`. Because our code was looking for `retry-after`, it guessed 1.2 seconds, retried 4 times before Azure even had time to breathe, and crashed.

### 🛠️ The Fix (Pillar 4):
1. Taught `fetchWithBackoff` to parse Microsoft's custom `x-ratelimit-reset-tokens`, `x-ratelimit-reset-requests`, and `retry-after-ms` headers.
2. If Azure says *"I need 12 seconds to reset tokens"*, the agent silently pauses for exactly 12s with random jitter and retries without breaking the UI stream.
3. Catching peak load messages and transparently retrying.  
**Result:** Zero crashes, zero red banners. Smooth sailing. ⛵

---

## 🤯 Episode 4: The "Thinking" Inception

### 💀 The Bug:
In the UI timeline, before every single tool call, the agent rendered:
```
Identifying user needs (3 steps)
  └── > Thinking
  └── 🔍 inspectIntegrationConnectionsTool
  └── > Thinking
  └── 💳 Scanning customer accounts
  └── > Thinking
  └── ✉️ Checking draft responses
```
It looked like the agent was having an existential crisis before touching every button.

### 🕵️ The Crime Scene:
Kimi-K2.6 is a chain-of-thought model. It generates internal reasoning before every action. AI SDK v6 emits a `reasoning` chunk on every step, and our React component was happily creating a brand new `<MonologueBlock />` accordion for each one.

### 🛠️ The Fix:
Consolidated all reasoning steps into a **single, clean `> Thinking` block** at the top of the batch for initial intent analysis, while mapping `inspectIntegrationConnectionsTool` to a clean **⚡ Verifying active connections** label.  
**Result:** Clean, executive timeline UI. 🎨

---

## 🏆 The Moral of the Story

| What We Learned | The Hard Truth |
|---|---|
| **Never dump raw API data** | The LLM doesn't care about your SIP dial-in pins or MIME boundaries. Trim it. |
| **Never pass 60+ tools simultaneously** | Schema definitions are silent token assassins. Scope them by domain. |
| **Don't verify HMAC signatures on your own DB** | The database is your friend. Don't let your security code delete your own records. |
| **Respect provider reset headers** | Azure doesn't follow standard RFC headers. Parse `x-ratelimit-reset-tokens`. |

---

*Written with caffeine, late-night git commits, and a deep appreciation for lean token budgets.* ☕🔥
