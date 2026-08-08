# Allel Product Definition

> Product definition aligned to the codebase as of 2026-04-24.

---

## What The Product Is

This product is best positioned as:

**A founder-facing retention operations product that helps save revenue automatically.**

It is not primarily an "AI tool."
It is not primarily a CRM.
It is not primarily a generic workflow builder.

The strongest current wedge is:
- detect churn risk early
- explain why it is happening
- draft the next action fast
- give the founder one daily operating brief
- let the founder work from a shared dashboard + agent console

---

## Ideal Customer

Best-fit customers:
- founder-led SaaS teams
- 1 to 20 people
- roughly `$1k-$50k MRR`
- still running customer ops manually
- losing customers without clear visibility into why

Core buyer pain:
- "I know signals exist, but they are spread across too many tools."
- "I do not have time to manually triage churn risk."
- "I want one place to see what changed and what to do next."

---

## Product Shape In Code

Current product shape:
- multi-tenant workspace model
- normalized customer/account state
- integrations with syncable, tool-only, and planned capability states
- deterministic founder brief generation
- persona-based agent layer
- workflow-level run logging and inspection APIs
- human approval for sensitive outbound actions

Current primary surfaces:
- dashboard inbox with brief + tasks on the left and chat on the right
- account list and account detail
- draft queue
- settings / integrations
- persona chat

---

## Personas In Product

### Alex
Role:
- cross-functional co-founder
- generalist operator
- full tool access

Best for:
- broad company questions
- cross-tool coordination
- product / ops / internal follow-through

### Henry
Role:
- head of growth
- acquisition / activation / distribution operator

Best for:
- messaging
- channel strategy
- experiments
- outbound / content / growth research

### Sarah
Role:
- head of retention
- churn prevention / billing recovery / save motion operator

Best for:
- at-risk accounts
- billing and renewal issues
- rescue drafts
- evidence-based retention decisions

---

## Core Product Loop

1. connect data sources
2. sync billing, usage, comms, support, and internal signals
3. normalize everything to account state
4. refresh account memory and compact conversation memory
5. generate the founder brief from live state
6. let the agent analyze, draft, and recommend
7. keep humans in approval loops for risky actions
8. log the workflow so it can be inspected later

This is the real loop today.

---

## What Is Strong Already

### Retention story

The product is strongest when framed around:
- churn risk
- revenue leaks
- founder pain
- lack of clarity across tools
- fast next steps

### Tool coverage

The agent surface is broad enough to feel like an operator, not a toy:
- Stripe
- PostHog
- Gmail
- Slack
- Intercom
- HubSpot
- Linear
- Sentry
- Notion
- Airtable
- Calendar
- web research

### Operating model

The system already supports:
- chat
- cron
- webhook-triggered reasoning
- draft workflows
- provider syncs
- workspace-scoped memory and logging
- workflow inspection APIs

### Product shell

The product is no longer only a backend with a thin wrapper.

What is already live:
- a dashboard workspace shell
- a real streaming agent feed
- a shared chat provider across the shell
- a live integrations page with connection state and connect/disconnect flows
- a first run-history screen in the dashboard

---

## What The Product Is Not Yet

This is not yet a deeply autonomous operating system.

What is still missing:
- stronger long-term memory than compact summaries and account snapshots
- a replay-grade run history / trace screen in the UI
- deeper planner / critic style orchestration
- stronger source-aware inspection across every external-content surface
- cleaner server-history hydration in chat on first load

---

## Positioning Guidance

Lead with:
- "Retention agent that saves revenue automatically"
- "You are losing users and do not know why"
- "Daily founder brief with the next best action"
- "See the leak, understand it, act on it"

Avoid leading with:
- generic AI language
- automation-for-automation's-sake
- vague customer intelligence phrasing
- broad "all your ops in one place" messaging

---

## Current Honest Description

If we describe the product precisely today:

**Allel is a founder-facing retention operations product with persona-based agents layered on top of normalized customer data. It is strongest at spotting churn risk, drafting save actions, and giving founders a high-signal operating console.**

---

## Next Product Moves

These are the next moves that most directly improve the product itself.

### Step 1. Make runs visible to founders

Status:
- mostly completed
- backend workflow inspection is live
- a first dashboard run-history surface is live
- richer replay-grade inspection is still ahead

Why it matters for the product:
- once founders rely on automation, they need to see what changed and why

Product effect:
- higher trust
- better supportability
- stronger enterprise story later

### Step 2. Make chat continuity feel native

Status:
- partially completed
- backend persistence, signing, and compaction are live
- the frontend still boots mostly from local persona thread state

Why it matters for the product:
- founders should not lose context when they reload, switch devices, or return to a persona later

Product effect:
- stronger continuity
- less confusing chat resets
- a more serious operator-console feel

### Step 3. Deepen memory quality

Status:
- partially completed
- account memory and compact conversation memory are live
- richer long-horizon recall is still ahead

Why it matters for the product:
- founders expect the system to remember what happened with important accounts without re-explaining it

Product effect:
- stronger rescue follow-through
- better repeat decisions
- less repeated context loading

### Step 4. Make provider readiness clearer

Status:
- partially completed
- backend distinguishes syncable, tool-only, and planned integrations
- the UI now reflects those capability states from one backend catalog
- deeper per-provider "what unlocks after connect" explanation is still ahead

Why it matters for the product:
- "connected" alone is not enough
- founders need to understand what the product can actually do after they connect a source

Product effect:
- better onboarding
- more trustworthy setup
- less confusion around capabilities

---

## Honest Product Summary

Allel is now a credible v1 product, not only a promising backend.

The clearest honest positioning today is:

**A retention-operations product for founder-led SaaS teams, with persona-based operators layered on top of normalized account state and one high-signal operating console at the center.**
