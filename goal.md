# Mission Control: Win Razorpay AI Builder — Track 3, AI Revenue Recovery

> **Submission deadline:** September 5, 2026
>
> **Current planning date:** August 22, 2026
>
> **Time remaining:** 14 full days, plus the deadline day
>
> **Target:** Submit a working, measurable revenue-recovery system—not a feature demo.

## The win condition

Allel wins only if a reviewer can watch one short demonstration and verify this complete loop:

```text
Stripe billing signal + PostHog usage signal
                    ↓
        account risk and root cause
                    ↓
       compliant recovery recommendation
                    ↓
        founder-reviewed rescue draft
                    ↓
     approved send or explicit stop decision
                    ↓
       measured outcome and revenue impact
                    ↓
       timestamped, inspectable audit trail
```

The submission must prove four things:

| Requirement | Evidence the reviewer must see | Current state |
|---|---|---|
| Measured recovery | One reproducible batch with account count, risk count, drafts, approvals, outcomes, MRR at risk, and MRR protected/recovered | **Not yet proven with a completed demo batch** |
| Compliant escalation | Severity-driven Slack/email notification with triggering evidence and no fabricated provider data | **Implemented; live demo verification required** |
| Stopping rules | Read-only detect/verify stages, separated draft stage, founder approval before sending, and clean failure behavior | **Implemented; demonstrate it** |
| Audit trail | One workflow ID showing detect → analyze → draft → verify, tool use, model, timing, failures, and outcome | **Backend implemented; reviewer-facing Workflows UI is still missing** |

## Current verified baseline

Verified on August 22, 2026:

- `npm test` passes: **118/118 tests**.
- `npx tsc --noEmit` passes with no errors.
- Reliable tool routing is implemented: exact matching, conservative fuzzy matching, compound-domain selection, scoped schemas, and in-loop expansion through AI SDK `activeTools` + `prepareStep`.
- Model retries and optional fallback-model recovery are implemented.
- Chat history is workspace/user/session scoped and assistant history is signed.
- Live-provider tools are guarded; a disconnected or unhealthy integration must not silently fall back to demo data.
- Daily, Stripe-webhook, and PostHog-webhook workflows use `detect → analyze → draft → verify` stages.
- Draft approval/send enforcement and outcome tracking exist in the backend.
- `GET /api/metrics/revenue-saved` exists.
- Workflow inspection APIs exist at `GET /api/agent/runs` and `GET /api/agent/runs/[workflowId]`.
- `/dashboard/flows` is still an empty placeholder. The audit trail cannot yet be judged from the product UI.

Do not spend competition time rebuilding the items above. Preserve existing uncommitted work unless a task explicitly overlaps it.

---

## Competition strategy: how Allel becomes the memorable submission

Most entries will stop at “AI detects churn” or show a chatbot producing a nice email. Allel must demonstrate the harder operational loop.

### 1. Lead with recovered revenue, not the number of features

The first result slide and dashboard screen must answer:

- How many accounts were processed?
- How many were correctly flagged?
- How much MRR was at risk?
- How many recovery actions were drafted and approved?
- How many accounts recovered, remained at risk, or churned?
- How much MRR was protected or recovered?

Do not call test-mode money “real customer revenue.” Label it clearly as a **reproducible test-mode recovery simulation**. If genuine pilot data exists, show it separately with customer details anonymized.

### 2. Show one compound-signal case

The hero scenario should combine two sources:

- Stripe: payment failure, overdue invoice, cancellation, or past-due state.
- PostHog: material usage decline or loss of a key activation event.

The output must explain why the combination is more urgent than either signal alone. This demonstrates judgment, not merely API connectivity.

### 3. Show restraint as a feature

Include one control account that the system deliberately leaves alone. Show why it did not draft or escalate. A recovery agent that contacts every customer is unsafe; the stopping decision is part of the product.

Also demonstrate:

- a detect/verify stage cannot use write tools;
- a draft cannot send itself;
- a disconnected provider returns an actionable error instead of synthetic data;
- duplicate webhook delivery does not create duplicate recovery actions.

### 4. Make the audit trail visible

Reviewers should not need to inspect Supabase or read source code. Build the smallest useful Workflows screen from the existing run-inspection APIs:

- workflow status and trigger;
- account and severity;
- four stages in order;
- tools used per stage;
- duration, retry/fallback count, and model used;
- draft/outcome link;
- failure reason when a stage fails.

This screen is competition-critical. It proves compliance, stopping rules, and debuggability simultaneously.

### 5. Make the Razorpay relevance explicit

Frame the product as a payment-provider-aware revenue recovery engine, not as a Stripe-specific inbox assistant. Explain that billing events enter through a provider adapter and the recovery pipeline is provider-independent.

Only after the complete Stripe test-mode demo works, consider a narrow Razorpay adapter or event-schema example. Do not jeopardize the working submission by starting a broad new integration during the final week.

### 6. Optimize for reviewer confidence

Every claim in the video must be backed by one of:

- a visible product state;
- a traceable workflow ID;
- a deterministic test;
- a provider event ID;
- a saved outcome row;
- a documented calculation.

Never use line count, tool count, speculative acceptance odds, or architecture complexity as the main proof. A small completed loop beats a large unfinished platform.

---

## Priority 0: the competition-critical path

Complete these in order. Do not add unrelated features before all six gates pass.

### Gate 1 — Freeze a trustworthy build

- [x] Tool-routing redesign implemented and documented.
- [x] Unit tests pass: 118/118.
- [x] TypeScript check passes.
- [ ] Run `npm run lint`; fix new or material errors only.
- [ ] Run `npm run build` with the intended production environment.
- [ ] Confirm no secrets, customer data, temporary files, or debug dumps are included in the repository.
- [ ] Update `web/README.md` with a five-minute local setup, architecture summary, required environment variables, demo command, and known limitations.

**Exit proof:** clean test, typecheck, lint, and production-build transcript.

### Gate 2 — Create a reproducible 15-account competition dataset

Use Stripe test mode and an isolated PostHog test project. Create exactly named, repeatable scenarios instead of manually improvising them during recording.

| Cohort | Count | Required condition |
|---|---:|---|
| Payment failed | 3 | Failed invoice/payment with meaningful MRR |
| Past due | 2 | Subscription remains active but payment is overdue |
| Cancelled | 2 | Recent cancellation with a recoverable reason |
| Usage decline | 3 | Active billing plus a measurable PostHog usage drop |
| Compound risk | 2 | Billing problem and usage decline on the same account |
| Healthy controls | 3 | Active, paid, and stable usage; must not be escalated |

Requirements:

- [ ] Use deterministic customer names and metadata so records can be reset.
- [ ] Write one supported seed/reset procedure; do not depend on undocumented dashboard clicking.
- [ ] Store expected classification and expected action for every account.
- [ ] Ensure the seed is idempotent or documents cleanup precisely.
- [ ] Never commit API keys or personally identifiable information.

**Exit proof:** a fresh test workspace can be populated and produces the same 15 accounts and expected cohort labels.

### Gate 3 — Prove the complete recovery pipeline

- [ ] Run Stripe sync and confirm customers, subscriptions, invoices, and MRR enter the correct workspace.
- [ ] Run PostHog sync and confirm usage signals attach to the intended accounts.
- [ ] Trigger the daily batch and preserve its workflow ID.
- [ ] Trigger one signed `invoice.payment_failed` webhook and preserve its event and workflow IDs.
- [ ] Trigger one signed PostHog usage-drop webhook.
- [ ] Confirm idempotency by replaying one event safely.
- [ ] Verify risk score, severity, root-cause evidence, draft creation, founder approval, send behavior, and final verify stage.
- [ ] Verify one provider failure path produces `needs_attention` with clear remediation and no invented business data.

**Exit proof:** one evidence table mapping every stage to its input, output, timestamp, tool, and database/run record.

### Gate 4 — Produce honest outcome metrics

Define metrics before running the final demo:

```text
flag rate          = flagged accounts / processed accounts
precision          = correctly flagged accounts / flagged accounts
draft rate         = drafts created / eligible at-risk accounts
approval rate      = approved drafts / drafts created
recovery rate      = recovered accounts / contacted at-risk accounts
MRR at risk        = sum of pre-action MRR for eligible at-risk accounts
MRR protected      = sum of MRR for accounts still active after intervention
MRR recovered      = sum of MRR restored after a failed/cancelled state
time to action     = draft created at - triggering signal received at
```

- [ ] Decide and document the exact condition for `recovered`, `protected`, `responded`, `still_at_risk`, and `churned`.
- [ ] Do not count `responded` as fully recovered revenue. If the existing endpoint applies a weighted estimate, label it as an estimate and also show the strict recovered amount.
- [ ] Record denominators and observation window beside every percentage.
- [ ] Export the final result table and retain screenshots.

**Exit proof:** the same source records reproduce every number shown in the dashboard, README, application, and video.

### Gate 5 — Build only the two missing reviewer surfaces

1. **Workflows:** replace the empty `/dashboard/flows` page using the existing run-inspection endpoints. Show the four-stage audit trail and failures.
2. **Results:** expose the revenue-saved endpoint in a compact card/table showing strict recovered MRR, protected MRR, pending outcomes, and observation window.

No broad redesign is allowed here. Reuse the current dashboard visual system. No command palette, new persona, extra integration, or landing-page animation until these two surfaces work.

**Exit proof:** a reviewer can understand one recovery from signal to outcome without opening developer tools.

### Gate 6 — Package and submit

- [ ] Create a clean public repository or reviewer-accessible snapshot.
- [ ] Add architecture, setup, demo, security, and limitations to the README.
- [ ] Prepare a one-page result sheet with final metrics and a workflow ID.
- [ ] Record the five-minute video.
- [ ] Complete the application by September 3.
- [ ] Submit by September 4, keeping September 5 only as emergency buffer.
- [ ] Verify every submitted link in a logged-out/private browser window.

---

## Five-minute pitch structure

| Time | Story | Visible proof |
|---|---|---|
| 0:00–0:25 | Revenue leaks hide across billing and product usage | One sentence and the 15-account batch |
| 0:25–1:10 | Allel combines signals and ranks intervention | At-risk list plus one healthy control |
| 1:10–2:10 | Live recovery workflow | Trigger webhook → diagnosis → draft |
| 2:10–2:45 | Human control and stopping rules | Founder approval and blocked-write example |
| 2:45–3:30 | Auditability and failure honesty | Workflows timeline, tool calls, provider failure |
| 3:30–4:15 | Measured result | Funnel, MRR at risk, protected/recovered amount |
| 4:15–4:45 | Architecture | Provider adapters → four-stage pipeline → outcomes |
| 4:45–5:00 | Close | Why this is ready for Razorpay's revenue stack |

Video rules:

- Show the product before source code.
- Use one continuous hero scenario, not a tour of every integration.
- Keep architecture to one diagram and 30 seconds.
- State “test-mode simulation” wherever applicable.
- Do not say “fully autonomous” when founder approval is required.
- End with the measured result and repository/demo link.

---

## Remaining-day schedule

| Date | Non-negotiable output |
|---|---|
| Aug 22 | Freeze baseline; finalize this execution plan |
| Aug 23 | Reproducible 15-account Stripe/PostHog test dataset |
| Aug 24 | Stripe and PostHog sync verified against the seeded workspace |
| Aug 25 | Daily batch run completed; failures documented |
| Aug 26 | Stripe and PostHog webhook runs completed; idempotency verified |
| Aug 27 | Workflows audit-trail page usable |
| Aug 28 | Outcome/revenue result surface usable |
| Aug 29 | Full stopping-rule, approval, and provider-failure rehearsal |
| Aug 30 | Final measured batch; evidence table and screenshots frozen |
| Aug 31 | README, architecture diagram, and result sheet complete |
| Sep 1 | First full five-minute recording |
| Sep 2 | Fix only demo blockers; record final version |
| Sep 3 | Application answers and all links finalized |
| Sep 4 | Submit and verify receipt |
| Sep 5 | Emergency buffer only |

If a day slips, remove polish before removing proof. Do not move submission work onto September 5 unless an external dependency forces it.

---

## Final evidence checklist

The submission is ready only when every box is checked:

- [ ] Public/reviewer-accessible product URL works in a private browser.
- [ ] Repository instructions work from a clean clone.
- [ ] Tests, typecheck, lint, and production build pass.
- [ ] Fifteen deterministic test accounts are visible.
- [ ] At least one compound Stripe + PostHog risk is demonstrated.
- [ ] At least one healthy account is correctly left untouched.
- [ ] One signed Stripe webhook completes the four-stage workflow.
- [ ] One duplicate webhook is safely ignored or handled idempotently.
- [ ] One founder-approved draft is sent through the intended path.
- [ ] One disallowed or unapproved action is visibly stopped.
- [ ] One integration failure is surfaced honestly without fake data.
- [ ] Workflow UI shows the complete audit trail.
- [ ] Result UI shows reproducible metrics with denominators and time window.
- [ ] All monetary claims distinguish test-mode simulation from real recovery.
- [ ] Five-minute video stays under the limit and contains no secrets.
- [ ] Application is submitted before the final day.

## Scope lock

Until the checklist above is complete, do not build:

- additional integrations;
- more personas;
- multi-agent orchestration;
- vector/RAG memory;
- a command palette;
- a landing-page redesign;
- generalized automation-rule builders;
- speculative features added only to increase code size.

The product is technically substantial. The remaining job is to make its value measurable, reproducible, visible, and impossible for a reviewer to miss.
