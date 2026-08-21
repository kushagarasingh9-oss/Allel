# 🎯 GOAL: Win Razorpay AI Builder Internship — Track 3: AI Revenue Recovery

> **Deadline**: September 5, 2026
> **Days remaining**: 16
> **Track**: 03 — AI Revenue Recovery
> **Offer**: ₹75,000/month · 6 or 12 months · In-person Bangalore

---

## The Bar (What Razorpay Wants to See)

> *"Don't just identify the problem. Show **measured money recovered across a batch**, with **compliant escalation**, **stopping rules**, and an **audit trail**."*

We need to deliver ALL FOUR:

| Requirement | How Allel Delivers | Status |
|---|---|---|
| **Measured money recovered** | Run pipeline on 15+ test accounts, show X accounts saved, $Y MRR recovered | ❌ Need to build |
| **Compliant escalation** | Severity classification (critical/urgent/info) → Slack alerts → email alerts | ✅ Code exists, needs demo |
| **Stopping rules** | Stage-specific tool access controls (detect=read-only, draft=gated, verify=read-only) + founder approval gates | ✅ Built |
| **Audit trail** | Workflow run logging + inspection APIs + agent_runs table | ✅ Built |

---

## Competition Estimate

| Factor | Estimate |
|---|---|
| Total applicants across all 5 tracks | ~1,000–2,000 (Razorpay is top-tier Indian fintech, student program, ₹75k stipend) |
| Track 3 applicants specifically | ~100–300 (most students will pick Track 1 or Track 5) |
| Interns hired per track | ~3–5 |
| **Your acceptance odds (Track 3)** | **~5–10%** if demo works end-to-end with measured recovery |

### Why your odds are actually higher than average:
- Most students will submit weekend hackathon projects (few hundred lines)
- You have **43,000 lines of production code** with a real scoring engine, real agent pipeline, real integrations
- Track 3 requires understanding of revenue operations — most CS students don't have this
- You already built exactly what they're describing before even seeing this program
- **If the demo works and the video is good, you're top 5% of applicants**

### What could beat you:
- Someone who builds on Razorpay's actual APIs (stronger signal for Razorpay specifically)
- Someone with a cleaner, more focused project (less code, tighter scope, better demo)
- Someone with actual real-world revenue recovery data (not test data)

---

## Phase 1: Codebase Cleanup (Days 1–3)

The codebase has unnecessary test files, stale code, and artifacts from development. Clean it up so it looks production-grade when reviewers look at the repo.

### Tasks

- [ ] Remove unnecessary test files that aren't real tests
- [ ] Remove stale persona references (Henry/Sarah are kept for automation but old persona-switcher UI code may linger)
- [ ] Clean up unused imports and dead code across all files
- [ ] Remove any console.log debug statements
- [ ] Remove scratch files, temp files, development artifacts
- [ ] Clean up .env.example — make it clear and professional
- [ ] Update README.md in /web — make it a strong project README:
  - What Allel is (2 sentences)
  - Architecture diagram (text-based)
  - How to run locally
  - How the 4-stage pipeline works
  - Key files to read
- [ ] Remove or clean up root-level markdown files that are internal notes (chat.md, cover_letters.md, framer.md, NAMES.md)
- [ ] Make sure npm run build passes with 0 errors
- [ ] Make sure npm test passes all 55 tests
- [ ] Add a LICENSE file (MIT is fine)

---

## Phase 2: Stripe Integration — Test Mode Demo (Days 4–7)

Get Stripe fully working in test mode so you can demo the complete revenue recovery pipeline.

### Tasks

- [ ] Create Stripe account (free) if you don't have one
- [ ] Get test-mode API keys (sk_test_...)
- [ ] Set up Stripe CLI locally for webhook testing (stripe listen --forward-to localhost:3000/api/webhooks/stripe)
- [ ] Add STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET to .env.local
- [ ] Create 15 test customers in Stripe test mode with different scenarios:
  - 3 customers: payment_failed (card declined)
  - 2 customers: subscription cancelled
  - 2 customers: invoice overdue
  - 3 customers: active but declining usage (pair with PostHog)
  - 2 customers: past_due payments
  - 3 customers: healthy (control group)
- [ ] Verify Stripe sync works — stripe-sync.ts pulls customers/subscriptions/invoices into Supabase
- [ ] Verify Stripe webhook handler works — payment.failed triggers the 4-stage pipeline
- [ ] Verify the scoring engine produces correct scores for each test customer
- [ ] Verify the agent drafts rescue emails for high-risk accounts
- [ ] Verify the approval flow works — approve a draft, it gets "sent"
- [ ] Verify the outcome tracker records the result

### Deliverable
A working demo where you can show: "15 accounts → 7 flagged at-risk → 5 rescue drafts generated → 3 approved and sent → revenue saved tracked"

---

## Phase 3: PostHog Integration — Verify & Demo (Days 4–7, parallel with Stripe)

PostHog gives usage data that feeds into the scoring engine. Verify it works.

### Tasks

- [ ] Verify PostHog API key works (phx_... — already in .env.local)
- [ ] Verify posthog-sync.ts can pull events and usage data
- [ ] Verify PostHog usage data feeds into the scoring engine's usage factors (usageDelta7d, usageDelta30d, featureBreadth)
- [ ] Set up PostHog test project with sample events if needed
- [ ] Verify PostHog webhook handler triggers pipeline on usage drop events
- [ ] Verify compound signal detection works: Stripe payment_failed + PostHog usage_drop = critical severity

### Deliverable
Show that the scoring engine uses BOTH billing (Stripe) AND usage (PostHog) data to produce compound signals.

---

## Phase 4: End-to-End Pipeline Demo (Days 8–10)

Run the full pipeline and document measured results.

### Tasks

- [ ] Deploy to Vercel (free tier) with all env vars configured
- [ ] Set GOOGLE_REDIRECT_URI and NEXT_PUBLIC_APP_URL to production URL
- [ ] Add production URL to Google Cloud Console authorized redirect URIs
- [ ] Run the daily cron pipeline (/api/cron/daily-run) against your 15 test accounts
- [ ] Document the results:
  - How many accounts were flagged
  - What risk scores were assigned
  - What root causes were diagnosed
  - How many drafts were generated
  - What the rescue emails said
  - What outcomes were tracked
- [ ] Trigger a Stripe webhook (payment.failed) and show the real-time pipeline response
- [ ] Show the workflow run logs (audit trail) in the dashboard
- [ ] Take screenshots / screen recordings of every step

### Deliverable
A documented batch run with measured numbers: "X accounts processed, Y flagged, Z drafts created, $W MRR at risk, N recovered"

---

## Phase 5: Record 5-min Pitch Video (Days 11–12)

### Tasks

- [ ] Install Loom (free) or set up OBS
- [ ] Practice the script 2-3 times before recording
- [ ] Record the video following this structure:

| Time | Section | Show |
|------|---------|------|
| 0:00–0:30 | **The Problem** | Face cam. "SaaS founders lose revenue silently. Signals are buried across 10 tools." |
| 0:30–1:30 | **Live Demo — Dashboard** | Screen share: at-risk accounts, churn scores, daily brief, rescue drafts |
| 1:30–2:30 | **Agent in Action** | Screen share: trigger webhook, watch 4-stage pipeline run, see draft generated |
| 2:30–3:30 | **Architecture** | Screen share: scoring engine code, compound signals, workflow pipeline, stage tool controls |
| 3:30–4:15 | **Measured Results** | Screen share: "15 accounts → 7 flagged → 5 drafts → 3 recovered → $X saved" |
| 4:15–5:00 | **Why Me + Close** | Face cam. "Built solo in 3 weeks. 43k lines. 55 tests. Live at allel.co." |

- [ ] Upload to YouTube (unlisted) or Loom
- [ ] Get the shareable link

---

## Phase 6: Submit Application (Day 13)

### Tasks

- [ ] Open the Google Form
- [ ] Select Track 3: AI Revenue Recovery
- [ ] Fill in Project Name: Allel
- [ ] Paste Project Objectives from razorpay_application.md
- [ ] GitHub URL: explain private repo + link to allel.co
- [ ] Paste 5-min Pitch Video Link
- [ ] Paste Build Challenges from razorpay_application.md
- [ ] Check confirmation box
- [ ] **SUBMIT**

---

## Phase 7: Buffer Days (Days 14–16)

- [ ] Fix any bugs found during demo
- [ ] Re-record video if first take wasn't strong enough
- [ ] Polish the landing page at allel.co
- [ ] Prepare for the panel interview (shortlisted builders go straight to a panel)

---

## Daily Schedule

| Day | Date | Focus |
|-----|------|-------|
| 1 | Aug 21 (Thu) | Codebase cleanup: remove dead files, clean imports |
| 2 | Aug 22 (Fri) | Codebase cleanup: update README, clean .env.example |
| 3 | Aug 23 (Sat) | Codebase cleanup: verify build + tests pass, remove scratch files |
| 4 | Aug 24 (Sun) | Stripe test mode setup: create account, get keys, create test customers |
| 5 | Aug 25 (Mon) | Stripe integration: verify sync, webhooks, scoring engine with real test data |
| 6 | Aug 26 (Tue) | PostHog verification: verify sync, usage data in scoring, compound signals |
| 7 | Aug 27 (Wed) | Integration testing: Stripe + PostHog together, compound signal demo |
| 8 | Aug 28 (Thu) | Deploy to Vercel, configure production env |
| 9 | Aug 29 (Fri) | End-to-end pipeline run: daily cron on 15 accounts, document results |
| 10 | Aug 30 (Sat) | End-to-end pipeline: webhook-triggered run, screenshots, screen recordings |
| 11 | Aug 31 (Sun) | Video: practice script, first recording attempt |
| 12 | Sep 1 (Mon) | Video: final recording, upload |
| 13 | Sep 2 (Tue) | **SUBMIT APPLICATION** |
| 14 | Sep 3 (Wed) | Buffer: fix bugs, polish |
| 15 | Sep 4 (Thu) | Buffer: re-record video if needed |
| 16 | Sep 5 (Fri) | **DEADLINE** |

---

## What Will Make You Win

1. **The demo works end-to-end** — not "here's the code," but "watch me trigger a payment failure and see the agent draft a rescue email in 30 seconds"
2. **Measured numbers** — "15 accounts, 7 flagged, 5 drafts, $850 MRR recovered" beats any amount of architecture explanation
3. **The video is energetic and focused** — show the product, not slides
4. **The codebase is clean** — when they look at the repo, it looks professional
5. **You built it solo** — massive signal for a builder internship

## What Will NOT Make You Win

- ❌ More features
- ❌ More integrations
- ❌ A fancier landing page
- ❌ Spending 10 days coding instead of 2 days demoing

**The product is built. Now prove it works.**
