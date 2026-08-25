# TOKEN OPTIMISATION AND MULTI-TOOL CALLING

While building Allel's autonomous AI Co-founder, we hit a massive wall: multi-step tool execution was burning through Azure’s 100k TPM rate limit in just 8 seconds by repeatedly re-sending 136 unpruned tool schemas—costing over 63,000 tokens for a single turn. To solve this, we introduced dynamic domain tool scoping to load only the active tools needed, and aggressively pruned API return payloads from Google Calendar, Gmail, and Stripe to keep only decision-critical data. We then consolidated sequential reasoning loops into a single parallel execution step, backed by Azure rate-limit header parsing with jitter retries. This dropped our token footprint by 92%—from 63,700 tokens down to just 4,750—allowing 20+ live co-founder workflows to run concurrently with zero rate-limit crashes and seamless chat history persistence.

---

## 🚀 Key Features & Capabilities

* 🌐 **Real-Time Web Intelligence & Market Research**  
  Powered by Tavily AI (`webSearchTool`, `webExtractTool`, `webCrawlTool`, `webMapTool`) for live competitor teardowns, SaaS industry benchmarks, and internet search.

* ⚡ **Parallel Multi-Tool Orchestration**  
  Autonomous parallel execution across 136 specialized integration tools (Google Calendar, Gmail, Stripe, PostHog, Linear, Slack, Sentry, HubSpot, Intercom, Notion, Airtable).

* 📉 **4-Pillar Token & TPM Optimization**  
  Domain schema scoping, output projection whitelisting, history compaction, and provider-aware jitter backoff (slashing token burn from `63,700` to `4,750` tokens).

* 💾 **Persistent Chat History & Long-Term Memory**  
  Full conversation threads survive browser restarts and reloads with rolling executive memory compaction.

* 🎨 **Platform SVG Brand Badging**  
  Clean UI timeline nodes and inline brand icons for all connected services.
