# Allel Revenue Recovery: Authoritative Build Blueprint

> Competition: Razorpay AI Builder, Track 3
>
> Planning date: August 22, 2026
>
> Submission deadline: September 5, 2026
>
> Build window: 14 full days plus the deadline day
>
> Document role: implementation source of truth for the remaining build
>
> Scope of this edit: planning only; no source code is changed by this document

---

## 0. How to use this document

This is not a product wish list.

This is the engineering contract for turning the current Allel repository into a real-time, testable, production-shaped revenue-recovery system.

Every implementation task must trace back to a requirement, invariant, state transition, parameter, or acceptance test in this file.

If code and this document disagree during the build, first determine whether the code already implements a safer behavior.

Then update the implementation or deliberately revise this document.

Do not silently create a third architecture.

The order of authority is:

1. Financial and customer truth from verified provider events.
2. Deterministic safety and policy invariants in code.
3. Durable database state and immutable audit records.
4. Typed workflow contracts.
5. Model-generated analysis and language.
6. UI summaries and competition narrative.

The implementation is complete only when the system passes the acceptance criteria near the end of this document.

Line count is not a success metric.

The purpose of the detail is to remove ambiguity during a short build window.

---

## 1. Mission

Build Allel into a founder-controlled AI revenue-recovery system that detects real risk across billing and product behavior, opens a durable recovery case, proposes a safe intervention, sends only after explicit authorization, and attributes the eventual outcome to verifiable provider evidence.

The winning demonstration must show this complete loop:

```text
signed Stripe or PostHog event
→ durable ingestion and deduplication
→ stable account identity resolution
→ canonical feature recomputation
→ deterministic risk, severity, and action policy
→ one durable recovery case
→ cited AI synthesis and draft
→ deterministic verification
→ founder approval
→ Gmail send
→ Stripe, PostHog, or Gmail outcome evidence
→ strict revenue and product-recovery metrics
→ inspectable workflow timeline
```

The product must answer five reviewer questions without opening the database:

1. What happened?
2. Why does it matter?
3. What did the system decide to do or deliberately not do?
4. Who authorized any customer-facing action?
5. What measurable outcome occurred afterward?

The hero message is:

> Allel turns fragmented billing, usage, and customer communication signals into safe, attributable recovery actions.

The system is not a generic chatbot.

The system is not a mass-email automation tool.

The system is not a trained churn-prediction model.

The system is a durable decision and evidence pipeline with an AI synthesis layer.

---

## 2. Competition truth contract

### 2.1 Claims Allel may make

Allel may claim that it:

- ingests signed provider events;
- combines billing, usage, and communication evidence;
- computes a deterministic risk index;
- applies explicit action and stopping policy;
- uses an LLM to synthesize evidence and generate a proposed draft;
- requires founder approval before customer-facing email is sent;
- records workflow stages, tool use, timing, retries, and failure state;
- observes replies, product recovery, and billing restoration;
- calculates strict recovered MRR from verified billing outcomes;
- calculates protected MRR under a separately labeled definition;
- supports a reproducible test-mode evaluation suite.

### 2.2 Claims Allel must not make

Allel must not claim that:

- test-mode Stripe money is real recovered customer revenue;
- a synthetic scenario manifest is a trained dataset;
- the risk index is a calibrated churn probability;
- a customer reply equals recovered revenue;
- usage rebound equals payment recovery;
- an LLM independently authorized a send;
- a serverless `after()` callback is a durable job queue;
- a provider is healthy when the live provider call failed;
- missing data proves healthy behavior;
- all workflows are autonomous when founder approval is required;
- a returned string such as `"unlocked"` dynamically changes AI SDK tool schemas;
- a demo result generalizes to production customers without pilot evidence.

### 2.3 Required disclosure language

All financial demo surfaces must include:

> Test-mode recovery simulation. No production customer funds are represented.

All score surfaces must include:

> Risk index, not a predicted probability of churn.

All evaluation reports must include:

- manifest version;
- policy version;
- scoring version;
- observation window;
- denominators;
- provider mode;
- run timestamp.

### 2.4 No trained dataset

The competition build does not require model training.

Do not spend the remaining time collecting a pseudo-dataset or fine-tuning a model.

Use a deterministic, labeled scenario manifest for evaluation.

The scenario manifest exists to test behavior.

It is not represented as historical customer data.

The LLM is not responsible for learning thresholds from 15 examples.

Thresholds are explicit configuration and are tuned only to remove obvious policy errors revealed by the scenario suite.

---

## 3. Provider scope: exactly three proof APIs

### 3.1 Stripe Test Mode

Stripe is the source of truth for:

- customer billing identity;
- subscription status;
- plan and price;
- MRR baseline;
- invoice status;
- payment failures;
- past-due state;
- cancellation;
- reactivation;
- successful recovery payment.

Required Stripe proof events are:

- `invoice.payment_failed`;
- `invoice.paid`;
- `customer.subscription.updated`;
- `customer.subscription.deleted`.

Useful optional events are:

- `payment_intent.payment_failed`;
- `customer.subscription.created`;
- `invoice.finalized`.

Stripe must run only in test mode for the competition scenario suite.

Every seeded customer must include deterministic metadata:

- `allel_workspace_id`;
- `allel_scenario_id`;
- `posthog_distinct_id`;
- `contact_email`.

### 3.2 PostHog test project

PostHog is the source of truth for:

- recent product activity;
- prior product activity baseline;
- key-feature usage;
- cancellation intent;
- account-level usage rebound.

The competition project must be isolated from unrelated analytics data.

Every scenario event must include:

- `distinct_id`;
- `allel_workspace_id`;
- `allel_scenario_id`;
- `account_external_id`;
- event timestamp;
- test-run identifier.

Required event names are:

- `allel_session_active`;
- `allel_key_action`;
- `allel_cancel_intent`;
- `allel_recovery_action`.

The existing `$pageview` cancellation-page signal may remain supported.

The deterministic test suite should prefer `allel_cancel_intent` because it is easier to seed and assert.

### 3.3 Gmail controlled accounts

Gmail is the source of truth for:

- the founder-approved outbound message;
- provider message ID;
- provider thread ID;
- delivery attempt result;
- controlled customer reply;
- reply timestamp;
- thread continuity.

Use one connected sender account and controlled recipient accounts or aliases.

Never send competition test messages to real customers.

Required Gmail proof actions are:

- save a draft in Allel;
- approve the exact content hash;
- send once;
- capture Gmail message and thread IDs;
- receive or sync one controlled reply;
- attach the reply to the same account and recovery case.

### 3.4 Providers outside the required proof loop

Slack may remain an optional founder notification channel.

Slack is not one of the three required proof APIs.

Linear, Intercom, Help Scout, Notion, Airtable, and other current integrations are outside the critical path.

Do not remove them.

Do not expand them during the competition build.

Do not let their unavailable data reduce or inflate the new risk score.

---

## 4. Definition of real time

For Allel, real time means:

- a provider event is acknowledged only after durable storage;
- duplicate delivery cannot create duplicate customer action;
- processing begins without waiting for a daily batch;
- workflow state survives a serverless process ending;
- retry is automatic and bounded;
- the UI can display the current case state;
- outcome events update the case as soon as they are observed.

Real time does not require a browser WebSocket for the competition.

Polling the Allel API every 3 to 5 seconds is acceptable for the workflow UI.

The target latency service levels are:

| Interval | Target | Hard demo ceiling |
|---|---:|---:|
| Provider request to durable event | 500 ms p95 | 2 seconds |
| Durable event to claimed job | 2 seconds p95 | 10 seconds |
| Claimed job to case open/update | 3 seconds p95 | 15 seconds |
| Case open to verified draft | 20 seconds p95 | 60 seconds |
| Approval to Gmail send result | 5 seconds p95 | 20 seconds |
| Observed billing recovery to case resolution | 5 seconds p95 | 30 seconds |
| Gmail reply poll interval, competition mode | 60 seconds | 2 minutes |

`Next.js after()` may be used as a best-effort accelerator.

It must not be the only mechanism that causes a durable workflow to continue.

---

## 5. Current repository baseline

### 5.1 Verified working baseline

The repository already contains substantial working infrastructure.

Verified on August 22, 2026:

- commit `1428040` contains the tool-routing redesign;
- `npm test` passes 118 of 118 tests;
- `npx tsc --noEmit` passes;
- exact tool matching exists;
- conservative fuzzy tool matching exists;
- compound-domain selection exists;
- scoped tool schemas exist;
- AI SDK `activeTools` and `prepareStep` expansion exists;
- provider connection guards exist;
- model retry exists;
- optional fallback model recovery exists;
- chat history is workspace, user, and session scoped;
- assistant history signing exists;
- Stripe webhook ingestion exists;
- PostHog webhook ingestion exists;
- Gmail send and sync exist;
- daily cron orchestration exists;
- `detect → analyze → draft → verify` workflow jobs exist;
- stage-specific tool allowlists exist;
- founder draft approval exists;
- draft send enforcement exists;
- draft outcome tracking exists;
- workflow run logging exists;
- run inspection APIs exist;
- connection-health failure paths exist;
- deterministic score and action-selector code exists.

Preserve these capabilities unless a later section explicitly replaces their ownership or contract.

### 5.2 Current reviewer surfaces

Current dashboard surfaces include:

- `/dashboard` for the founder brief;
- `/dashboard/accounts` for account risk ordering;
- `/dashboard/accounts/[id]` for signals, contacts, drafts, and timeline;
- `/dashboard/drafts` for the review queue;
- `/dashboard/settings` for integrations;
- `/dashboard/flows` as an empty placeholder.

The account detail page already provides a useful visual foundation.

The flows page is only seven lines and does not expose the available run-inspection data.

The competition build should extend the current visual system, not redesign the product.

### 5.3 Current database primitives worth keeping

Keep and migrate forward:

- `workspaces`;
- `workspace_members`;
- `integration_connections`;
- `integration_tokens`;
- `customer_accounts`;
- `account_contacts`;
- `account_signals`;
- `account_timeline`;
- `follow_up_drafts`;
- `founder_briefs`;
- `webhook_events`;
- `agent_runs`;
- `score_snapshots`;
- `draft_outcomes`.

### 5.4 Current code that becomes the migration seam

Primary files to refactor are:

- `web/src/app/api/webhooks/stripe/route.ts`;
- `web/src/app/api/webhooks/posthog/route.ts`;
- `web/src/app/api/cron/daily-run/route.ts`;
- `web/src/lib/integrations/stripe-sync.ts`;
- `web/src/lib/integrations/posthog-sync.ts`;
- `web/src/lib/integrations/gmail-sync.ts`;
- `web/src/lib/engine/score-engine.ts`;
- `web/src/lib/engine/action-selector.ts`;
- `web/src/lib/engine/score-history.ts`;
- `web/src/lib/engine/compound-signals.ts`;
- `web/src/lib/agent/workflows.ts`;
- `web/src/lib/drafts/draft-workflows.ts`;
- `web/src/lib/drafts/send-draft.ts`;
- `web/src/lib/drafts/outcome-tracker.ts`;
- `web/src/lib/notifications/notify-founder.ts`;
- `web/src/lib/agent/run-logger.ts`;
- `web/src/lib/agent/run-inspection.ts`.

### 5.5 Confirmed architectural defects to fix

The existing webhooks schedule critical follow-up work in `after()`.

That work can be lost after the HTTP acknowledgment.

Webhook rows can be marked processed before the agent workflow is finished.

The Stripe route may catch processing errors and still return success without durable retry.

Idempotency uses a select-then-insert pattern without the required unique composite constraint.

Concurrent duplicate requests can both pass the select.

Unmapped PostHog events may return before the raw payload is durably retained.

Workspace and account identity resolution relies too heavily on email, name, or JSON blobs.

Stripe sync, PostHog sync, and Gmail sync can each overwrite `customer_accounts.risk_score`.

There is no single feature and score owner.

Stripe sync infers failed-payment counts from subscription status instead of invoice attempt evidence.

Stripe sync and Gmail sync can create drafts directly while the agent workflow can also create drafts.

PostHog sync deletes and recreates usage signals instead of maintaining incremental state.

PostHog sync reads broad event windows instead of a durable cursor.

Stripe cancellation can set MRR to zero before the recoverable revenue baseline is captured.

`recordDraftSent()` snapshots current MRR, which can already be zero for a cancelled account.

`invoice.paid` can restore account state without deterministically resolving the associated case.

Draft outcomes wait for later time windows instead of reacting immediately to provider outcomes.

The current revenue-saved calculation counts a reply as 50 percent saved revenue.

That is not acceptable as strict recovered revenue.

`score_snapshots` and compound-signal code exist but are not consistently called.

`churn_scores` and `score_snapshots` duplicate score-history responsibility.

The current workflow runner can continue later stages after an earlier stage fails.

Stage output is primarily prose and tool side effects rather than a typed case-state transition.

Founder notifications can be fire-and-forget and therefore lost.

PostHog signature comparison is not timing-safe.

Raw payload retention and redaction are not explicitly governed.

### 5.6 What not to rebuild

Do not replace Supabase.

Do not replace Next.js.

Do not replace the AI SDK.

Do not replace the current OAuth/token encryption system during the competition build.

Do not invent a microservice architecture.

Do not build a vector database.

Do not build multi-agent delegation.

Do not train a model.

Do not expand the integration catalog.

Do not redesign the landing page.

Do not confuse agent chat tool routing with the durable recovery workflow.

---

## 6. Target system architecture

### 6.1 End-to-end topology

```text
Stripe Test Mode ─────┐
                     │
PostHog Test Project ├─→ signed ingress routes
                     │          │
Gmail API ───────────┘          ▼
                       webhook_events
                       unique dedupe key
                              │
                              ▼
                       workflow_jobs
                    lease + retry + DLQ
                              │
                              ▼
                    provider identity map
                              │
                              ▼
                    canonical account features
                              │
                              ▼
                  deterministic decision engine
               score + severity + policy + priority
                              │
                              ▼
                       recovery_cases
                              │
               ┌──────────────┼──────────────┐
               ▼              ▼              ▼
            analyze          draft         verify
          cited JSON      typed content   code gates
               └──────────────┼──────────────┘
                              ▼
                       founder approval
                              │
                              ▼
                          Gmail send
                              │
                              ▼
                    event-driven outcomes
                              │
                              ▼
                  strict metrics + workflow UI
```

### 6.2 Architectural unit of work

The recovery case is the unit of work.

A webhook is evidence, not the workflow.

A risk score is a decision input, not the workflow.

A draft is an artifact, not the workflow.

An agent run is an execution record, not the workflow.

An outcome row is a measurement, not the workflow.

One recovery case links all of them.

### 6.3 Component ownership

The ingress layer owns:

- request size limits;
- signature verification;
- raw payload hashing;
- event normalization envelope;
- atomic event and job insertion;
- fast provider acknowledgment.

The queue layer owns:

- pending work;
- leases;
- attempts;
- retry timing;
- dead-letter state;
- job idempotency.

The identity layer owns:

- provider-to-account mapping;
- mapping confidence;
- conflicts;
- unmapped-event state;
- manual resolution.

The feature projector owns:

- canonical billing features;
- canonical usage features;
- canonical communication features;
- source freshness;
- missing-domain state;
- one write path to current feature state.

The decision engine owns:

- risk component values;
- availability-aware risk index;
- score confidence;
- severity;
- hard-event overrides;
- action policy;
- stopping rules;
- revenue priority;
- policy version.

The case service owns:

- open-or-update deduplication;
- legal transitions;
- MRR baseline;
- case evidence links;
- action lifecycle;
- final resolution.

The AI layer owns:

- evidence synthesis;
- concise root-cause explanation;
- draft language;
- optional language-quality critique.

The AI layer does not own:

- identity;
- money;
- state transitions;
- score computation;
- severity overrides;
- suppression policy;
- approval;
- send authorization;
- idempotency;
- outcome classification.

The notification layer owns durable founder alerts.

The UI owns a faithful projection of durable state.

The UI must not recalculate metrics differently from the backend.

### 6.4 Transaction boundaries

Ingress transaction:

1. insert or identify `webhook_events` row;
2. insert one unique `workflow_jobs` row;
3. commit;
4. return provider acknowledgment.

Case decision transaction:

1. lock the affected account or case key;
2. read canonical features;
3. compute deterministic decision;
4. append score snapshot;
5. open or update the recovery case;
6. append case event;
7. enqueue next job;
8. commit.

Approval transaction:

1. lock the draft and case;
2. verify current content hash;
3. verify case is awaiting approval;
4. record actor and timestamp;
5. transition case to approved;
6. enqueue unique send job;
7. commit.

Outcome transaction:

1. resolve event to account and case;
2. verify outcome evidence;
3. append outcome evidence;
4. classify resolution deterministically;
5. transition the case;
6. update metric projection;
7. commit.

---

## 7. Global invariants

The following invariants are non-negotiable.

1. No customer-facing send occurs without a durable approval row or fields tied to the exact content hash.
2. One provider event produces at most one process-event job.
3. One recovery case and action version produce at most one active draft.
4. One approved draft produces at most one logical Gmail send.
5. Missing provider data never becomes healthy evidence.
6. Unmapped events are retained and visible.
7. A score cannot be written by provider sync modules.
8. A case captures MRR before destructive subscription-state mutation.
9. A reply cannot increment strict recovered MRR.
10. Usage recovery cannot increment strict recovered MRR.
11. Billing recovery requires a verified Stripe state transition.
12. The LLM cannot bypass suppression, approval, or legal state transitions.
13. A failed prerequisite blocks dependent workflow stages.
14. Every terminal case has a resolution reason and evidence.
15. Every external side effect has an idempotency key.
16. Every case records scoring and policy versions.
17. Every event and case is scoped to a workspace.
18. Service-role operations validate workspace ownership in application code.
19. Raw secrets never enter model prompts, run logs, or UI payloads.
20. Test-mode records cannot be mislabeled as production financial results.

---

## 8. Canonical event envelope

Every provider event must be normalized into this conceptual shape before business processing:

```ts
type CanonicalProviderEvent = {
  eventId: string
  workspaceId: string | null
  provider: 'stripe' | 'posthog' | 'gmail'
  providerEventId: string
  dedupeKey: string
  eventType: string
  occurredAt: string
  receivedAt: string
  endpointId: string | null
  providerAccountId: string | null
  primaryExternalIdentity: string | null
  secondaryExternalIdentities: string[]
  scenarioId: string | null
  payloadHash: string
  payloadVersion: number
  testMode: boolean
}
```

Normalization must not discard the original provider event ID.

Normalization must not trust client-provided workspace IDs without validating them against the webhook endpoint or integration connection.

Provider timestamps are evidence.

Server receipt timestamps are the ordering fallback.

If the provider timestamp is too far in the future, retain it but use `received_at` for queue scheduling.

The raw payload remains stored under the retention rules in the security section.

The model receives a redacted evidence projection, never the unrestricted raw payload.

---

## 9. Database redesign

### 9.1 Migration strategy

Implement additive migrations first.

Keep compatibility columns during the competition window.

Move writers to the new ownership model.

Backfill deterministic fields.

Move readers to the new model.

Only then deprecate duplicate paths.

Recommended migration files are:

```text
supabase/migrations/20260822_recovery_core.sql
supabase/migrations/20260822_recovery_queue.sql
supabase/migrations/20260822_recovery_drafts_and_outcomes.sql
supabase/migrations/20260822_recovery_rls_and_rpc.sql
```

The filenames may use the repository's actual creation date.

Keep the logical split.

Every migration must be rerunnable where the repository convention uses `if not exists`.

Every constraint must be named.

Every new table must enable RLS.

Every workspace-scoped table must have a workspace index.

### 9.2 `provider_identities`

Purpose:

Map stable external identities from all three providers to one `customer_accounts` row.

Required columns:

```sql
id uuid primary key default gen_random_uuid()
workspace_id uuid not null references workspaces(id) on delete cascade
customer_account_id uuid not null references customer_accounts(id) on delete cascade
provider text not null
identity_type text not null
external_id text not null
normalized_external_id text not null
is_primary boolean not null default false
verification_status text not null default 'verified'
source text not null
metadata jsonb not null default '{}'
first_seen_at timestamptz not null default now()
last_seen_at timestamptz not null default now()
created_at timestamptz not null default now()
updated_at timestamptz not null default now()
```

Allowed `provider` values for the competition are:

- `stripe`;
- `posthog`;
- `gmail`.

Allowed `identity_type` values are:

- `customer_id`;
- `subscription_id`;
- `invoice_customer_id`;
- `distinct_id`;
- `person_email`;
- `email_address`;
- `gmail_thread_id`.

Allowed `verification_status` values are:

- `verified`;
- `inferred`;
- `conflict`;
- `revoked`.

Required uniqueness:

```sql
unique (workspace_id, provider, identity_type, normalized_external_id)
```

Required indexes:

- `(workspace_id, customer_account_id)`;
- `(workspace_id, provider, normalized_external_id)`;
- partial index on conflicts.

Normalization rules:

- Stripe IDs remain case-sensitive and unchanged;
- PostHog distinct IDs remain byte-for-byte except surrounding whitespace is rejected;
- email addresses are trimmed and lowercased;
- Gmail thread IDs remain unchanged;
- empty strings are rejected;
- identities longer than the configured maximum are rejected before insertion.

Backfill rules:

- create Gmail email identities from `account_contacts.email`;
- create provider identities from known `account_contacts.external_ids` keys;
- never auto-map ambiguous values;
- write conflicts to the audit trail;
- preserve `account_contacts` for display names and roles.

`account_contacts` remains the human contact table.

`provider_identities` becomes the machine identity table.

### 9.3 `account_features`

Purpose:

Create one current, canonical feature row per account.

No sync module may write risk scores after this table is introduced.

Required columns:

```sql
workspace_id uuid not null references workspaces(id) on delete cascade
customer_account_id uuid primary key references customer_accounts(id) on delete cascade
billing_available boolean not null default false
billing_status text
stripe_customer_id text
stripe_subscription_id text
current_mrr_cents integer
pre_cancel_mrr_cents integer
last_invoice_id text
last_invoice_status text
failed_payment_count_7d integer not null default 0
failed_payment_count_30d integer not null default 0
last_payment_failed_at timestamptz
last_payment_succeeded_at timestamptz
cancel_at_period_end boolean
cancelled_at timestamptz
usage_available boolean not null default false
usage_current_7d integer
usage_previous_7d integer
usage_delta_percent numeric
key_feature_current_7d integer
key_feature_previous_7d integer
key_feature_missing boolean
cancel_intent_at timestamptz
last_product_activity_at timestamptz
communication_available boolean not null default false
last_outbound_at timestamptz
last_inbound_at timestamptz
unreplied_outbound_count integer not null default 0
gmail_thread_id text
billing_fresh_at timestamptz
usage_fresh_at timestamptz
communication_fresh_at timestamptz
source_watermarks jsonb not null default '{}'
feature_version text not null
computed_at timestamptz not null default now()
updated_at timestamptz not null default now()
```

Constraints:

- MRR values must be non-negative;
- event counts must be non-negative;
- usage delta is nullable when unavailable or below minimum volume;
- provider IDs are nullable but never empty strings;
- `feature_version` is always populated;
- one row exists per account after the first successful projection.

`customer_accounts` remains the fast dashboard projection.

Only the feature projector and decision engine may update these `customer_accounts` fields:

- `account_status`;
- `mrr_cents`;
- `risk_score`;
- `risk_level`;
- `usage_delta_percent`;
- `summary`;
- `next_action`.

### 9.4 `recovery_cases`

Purpose:

Represent one durable revenue-risk incident from detection through resolution.

Required columns:

```sql
id uuid primary key default gen_random_uuid()
workspace_id uuid not null references workspaces(id) on delete cascade
customer_account_id uuid not null references customer_accounts(id) on delete cascade
case_key text not null
trigger_provider text not null
trigger_event_type text not null
trigger_event_id uuid references webhook_events(id) on delete set null
scenario_id text
status text not null
resolution text
severity text not null
risk_score integer not null
score_confidence numeric not null
revenue_priority numeric not null
mrr_baseline_cents integer not null
currency text not null default 'usd'
score_version text not null
policy_version text not null
feature_version text not null
action_type text not null
action_reason text not null
suppression_reason text
root_cause_summary text
evidence_snapshot jsonb not null default '[]'
opened_at timestamptz not null default now()
last_signal_at timestamptz not null default now()
awaiting_approval_at timestamptz
approved_at timestamptz
sent_at timestamptz
monitoring_started_at timestamptz
resolved_at timestamptz
outcome_deadline_at timestamptz
failed_at timestamptz
created_at timestamptz not null default now()
updated_at timestamptz not null default now()
```

Allowed `status` values:

- `open`;
- `analyzing`;
- `action_proposed`;
- `awaiting_approval`;
- `approved`;
- `sent`;
- `monitoring`;
- `resolved`;
- `suppressed`;
- `failed`.

Allowed `resolution` values:

- `strictly_recovered`;
- `protected`;
- `product_recovered`;
- `engaged`;
- `churned`;
- `no_action_required`;
- `suppressed`;
- `expired_unknown`;
- `duplicate`;
- `operator_closed`.

Required constraints:

- risk score is between 0 and 100;
- score confidence is between 0 and 1;
- MRR baseline is non-negative;
- resolved rows have `resolved_at` and `resolution`;
- unresolved rows do not claim a terminal resolution;
- suppressed rows have `suppression_reason`;
- sent or monitoring rows have `sent_at`;
- approved or later customer-contact rows have `approved_at`.

Required uniqueness:

```sql
unique (workspace_id, case_key)
```

Required indexes:

- `(workspace_id, status, severity, updated_at desc)`;
- `(workspace_id, customer_account_id, opened_at desc)`;
- `(workspace_id, resolution, resolved_at desc)`;
- `(workspace_id, scenario_id)` where scenario ID is not null;
- `(workspace_id, revenue_priority desc)` for open cases.

### 9.5 Case-key construction

The case key prevents the same incident from opening many cases.

Construct it from stable deterministic fields.

Examples:

```text
billing_failure:{account_id}:{stripe_invoice_id}
subscription_cancel:{account_id}:{stripe_subscription_id}:{cancelled_at_date}
cancel_intent:{account_id}:{calendar_date}
usage_decline:{account_id}:{usage_window_end_date}
compound:{account_id}:{primary_incident_key}
```

An existing open case may absorb related evidence.

A compound signal should generally upgrade the open primary case instead of opening a parallel case.

Open a new case when:

- the old case is terminal;
- the new incident has a distinct provider object;
- the configured recurrence cooldown has elapsed;
- merging would corrupt attribution.

### 9.6 `recovery_case_events`

Purpose:

Provide an immutable case transition and evidence audit log.

Required columns:

```sql
id uuid primary key default gen_random_uuid()
workspace_id uuid not null references workspaces(id) on delete cascade
recovery_case_id uuid not null references recovery_cases(id) on delete cascade
event_type text not null
from_status text
to_status text
actor_type text not null
actor_id text
source_provider text
source_event_id uuid references webhook_events(id) on delete set null
workflow_job_id uuid
agent_run_id uuid references agent_runs(id) on delete set null
detail jsonb not null default '{}'
created_at timestamptz not null default now()
```

Allowed `actor_type` values:

- `system`;
- `provider`;
- `agent`;
- `founder`;
- `worker`.

Important event types include:

- `case_opened`;
- `evidence_attached`;
- `score_computed`;
- `severity_changed`;
- `action_selected`;
- `analysis_completed`;
- `draft_created`;
- `verification_passed`;
- `verification_failed`;
- `approval_granted`;
- `approval_rejected`;
- `send_succeeded`;
- `send_failed`;
- `reply_observed`;
- `usage_recovered`;
- `billing_recovered`;
- `case_resolved`;
- `job_dead_lettered`.

Application code must not update or delete case events.

### 9.7 `workflow_jobs`

Purpose:

Provide the durable outbox and worker queue missing from the current architecture.

Required columns:

```sql
id uuid primary key default gen_random_uuid()
workspace_id uuid references workspaces(id) on delete cascade
recovery_case_id uuid references recovery_cases(id) on delete cascade
webhook_event_id uuid references webhook_events(id) on delete cascade
job_type text not null
idempotency_key text not null
status text not null default 'pending'
priority integer not null default 100
payload jsonb not null default '{}'
attempt_count integer not null default 0
max_attempts integer not null default 8
next_attempt_at timestamptz not null default now()
lease_owner text
lease_expires_at timestamptz
started_at timestamptz
completed_at timestamptz
last_error_code text
last_error_message text
last_error_at timestamptz
created_at timestamptz not null default now()
updated_at timestamptz not null default now()
```

Allowed `status` values:

- `pending`;
- `running`;
- `completed`;
- `failed`;
- `dead_letter`;
- `cancelled`.

Initial `job_type` values:

- `process_provider_event`;
- `project_account_features`;
- `evaluate_recovery_case`;
- `run_case_analysis`;
- `generate_case_draft`;
- `verify_case_draft`;
- `notify_founder`;
- `send_approved_draft`;
- `sync_gmail_history`;
- `classify_case_outcome`;
- `refresh_founder_brief`;
- `reconcile_provider_state`.

Required uniqueness:

```sql
unique (idempotency_key)
```

The idempotency key must include workspace scope.

Examples:

```text
ws:{workspace}:event:{webhook_event}:process:v1
ws:{workspace}:case:{case}:analyze:v2
ws:{workspace}:case:{case}:draft:{action_version}:v1
ws:{workspace}:draft:{draft}:send:{content_hash}
ws:{workspace}:gmail:{history_id}:sync
```

Required indexes:

- claim index on `(status, next_attempt_at, priority, created_at)`;
- lease-expiry index on running jobs;
- `(workspace_id, recovery_case_id, created_at)`;
- `(webhook_event_id)`;
- partial dead-letter index.

### 9.8 Job-claim RPC

Create a database function such as `claim_workflow_jobs`.

It must:

- accept worker ID and batch size;
- select pending jobs whose `next_attempt_at <= now()`;
- include running jobs whose lease expired;
- order by priority ascending and creation time ascending;
- use `for update skip locked`;
- increment attempt count;
- set running status;
- set lease owner;
- set lease expiry;
- return claimed rows;
- complete in one transaction.

The service role may call it.

Authenticated browser clients may not call it.

### 9.9 `contact_policies`

Purpose:

Enforce channel-level suppression before draft generation and again before send.

Required columns:

```sql
id uuid primary key default gen_random_uuid()
workspace_id uuid not null references workspaces(id) on delete cascade
customer_account_id uuid references customer_accounts(id) on delete cascade
channel text not null
address text
policy text not null
reason text not null
source text not null
expires_at timestamptz
created_at timestamptz not null default now()
updated_at timestamptz not null default now()
```

Allowed `policy` values:

- `allow`;
- `do_not_contact`;
- `transactional_only`;
- `manual_review_only`.

Most restrictive applicable policy wins.

### 9.10 `provider_sync_cursors`

Purpose:

Stop broad destructive syncs and make PostHog and Gmail incremental.

Required columns:

```sql
id uuid primary key default gen_random_uuid()
workspace_id uuid not null references workspaces(id) on delete cascade
provider text not null
stream text not null
scope_key text not null default 'workspace'
cursor text
watermark_at timestamptz
last_attempt_at timestamptz
last_success_at timestamptz
status text not null default 'idle'
error text
metadata jsonb not null default '{}'
created_at timestamptz not null default now()
updated_at timestamptz not null default now()
```

Required uniqueness:

```sql
unique (workspace_id, provider, stream, scope_key)
```

Streams include:

- `stripe_customers`;
- `stripe_subscriptions`;
- `posthog_events`;
- `gmail_history`.

### 9.11 Changes to `webhook_events`

Add:

- `dedupe_key text`;
- `endpoint_id text`;
- `payload_hash text`;
- `occurred_at timestamptz`;
- `status text`;
- `processing_started_at timestamptz`;
- `completed_at timestamptz`;
- `identity_status text`;
- `customer_account_id uuid`;
- `recovery_case_id uuid`;
- `retention_expires_at timestamptz`;
- `test_mode boolean`;
- `scenario_id text`.

Make `workspace_id` nullable only if unmapped ingress truly cannot be associated with an endpoint workspace.

Prefer workspace-specific webhook endpoint IDs so the workspace is known before event processing.

Keep `processed` temporarily for compatibility.

Set it only when the durable event-processing job is completed.

Add a required unique index for mapped provider events:

```sql
unique (workspace_id, provider, external_id)
where external_id is not null and workspace_id is not null
```

Also make `dedupe_key` unique when populated.

Do not use select-then-insert as the concurrency control.

Use `insert ... on conflict` and inspect the returned row.

### 9.12 Changes to `score_snapshots`

Choose `score_snapshots` as the canonical score-history table.

Stop writing new `churn_scores` rows after cutover.

Add to `score_snapshots`:

- `recovery_case_id uuid`;
- `score_confidence numeric`;
- `severity text`;
- `revenue_priority numeric`;
- `features jsonb`;
- `available_domains text[]`;
- `hard_overrides text[]`;
- `score_version text`;
- `policy_version text`;
- `trigger_event_id uuid`.

Keep factors as machine-readable JSON.

Do not store only prose evidence.

Backfill is not required for missing historical detail.

Mark older snapshots with a legacy version.

### 9.13 Changes to `follow_up_drafts`

Add:

- `recovery_case_id uuid`;
- `recipient_email text`;
- `body_full text`;
- `content_hash text`;
- `approved_content_hash text`;
- `action_version integer`;
- `superseded_at timestamptz`;
- `approval_expires_at timestamptz`;
- `provider_message_id text`;
- `provider_thread_id text`;
- `send_idempotency_key text`;
- `send_error text`;
- `sent_at timestamptz` if it is not already present.

The current `body_preview` may remain a display projection.

The full send body must not be reconstructed from the preview.

Required uniqueness:

- one active draft per case and action version;
- one logical send idempotency key;
- one provider message ID where non-null.

An edit after approval clears approval and returns the case to awaiting approval.

### 9.14 Changes to `draft_outcomes`

Add:

- `recovery_case_id uuid`;
- `outcome_type text`;
- `evidence_provider text`;
- `evidence_event_id uuid`;
- `evidence_external_id text`;
- `occurred_at timestamptz`;
- `attribution_rule text`;
- `attribution_version text`;
- `mrr_baseline_cents integer`;
- `strict_recovered_cents integer`;
- `protected_cents integer`;
- `is_test_mode boolean`.

Retain the old fields during migration.

Stop using `mrr_cents_at_send` as the canonical recoverable baseline.

Use `recovery_cases.mrr_baseline_cents`.

### 9.15 Changes to `agent_runs`

Keep the normalized fields already added by workflow-hardening migrations.

Add `recovery_case_id` and `workflow_job_id`.

Every automated case stage must record:

- workflow ID;
- case ID;
- job ID;
- stage;
- provider;
- model ID when applicable;
- prompt version when applicable;
- attempt number;
- retry count;
- duration;
- input evidence IDs;
- output schema version;
- error code;
- token and cost estimate when available.

Do not log full customer email bodies by default.

### 9.16 RLS policy rules

Workspace members may read recovery cases in their workspace.

Workspace members may read redacted case events in their workspace.

Workspace members may read jobs but may not claim or mutate jobs from the browser.

Workspace owners and admins may approve or reject drafts through server routes.

Only service-role backend paths may:

- ingest raw provider payloads;
- claim jobs;
- update canonical features;
- compute and store decisions;
- transition cases from provider evidence;
- record send results.

Integration tokens remain inaccessible in ordinary browser queries.

If existing RLS currently permits token reads to all workspace members, tighten it after confirming server-side settings flows do not depend on direct token access.

### 9.17 Database rollout checks

Before application cutover, verify:

- new tables exist;
- RLS is enabled;
- required policies exist;
- unique indexes are valid;
- claim RPC uses `skip locked`;
- service-role queue claim succeeds;
- authenticated queue claim fails;
- duplicate event inserts resolve to one row;
- duplicate job inserts resolve to one row;
- illegal case states fail constraints;
- legacy dashboard reads still work.

---

## 10. Identity resolution

### 10.1 Resolution order

Resolve an account in this strict order:

1. Exact verified provider identity.
2. Exact cross-provider identity supplied by trusted seeded metadata.
3. Exact normalized email with exactly one account match.
4. Manual mapping.
5. Unmapped state.

Never use fuzzy company-name matching for automatic customer action.

Never allow the LLM to choose an account ID.

Never choose the first of multiple matches.

### 10.2 Stripe identity rules

Primary key is Stripe customer ID.

Subscription and invoice events resolve their customer ID first.

Subscription IDs are secondary identities.

Seed metadata may bootstrap mappings only when:

- the workspace ID matches the receiving integration;
- the scenario ID is in test mode;
- there is no conflicting existing identity;
- the mapping is written as an audited identity event.

Customer email is a fallback, not the primary Stripe key.

### 10.3 PostHog identity rules

Primary key is `distinct_id`.

Person email may bootstrap a mapping only when it uniquely matches one verified contact.

Once a `distinct_id` is mapped, later person-property email changes do not silently move it to another account.

Create a conflict for operator review.

Use PostHog alias events deliberately if multiple distinct IDs represent one person.

Do not infer an organization from a shared email domain.

### 10.4 Gmail identity rules

Normalize envelope addresses.

Ignore the connected founder's own address when resolving the customer side of a thread.

Resolve recipient or sender email to a verified account contact.

After a draft is sent, bind the Gmail thread ID to the recovery case and account.

A matching thread ID outranks an email-only match for replies.

Do not bind automated bounce or system messages as customer replies.

### 10.5 Confidence values

Use deterministic identity confidence values:

| Match | Confidence |
|---|---:|
| Exact verified provider ID | 1.00 |
| Exact verified Gmail thread ID | 1.00 |
| Trusted test metadata bootstrap | 0.95 |
| Exact unique verified email | 0.90 |
| Exact unverified email | 0.75 |
| Conflict or ambiguous match | 0.00 |
| No match | 0.00 |

Automatic customer outreach requires identity confidence at or above 0.90.

A lower-confidence event may update an unmapped queue but may not update account state.

### 10.6 Unmapped-event handling

An unmapped event must:

- remain stored;
- have `identity_status = 'unmapped'`;
- complete ingestion successfully;
- avoid mutating any account;
- enqueue a low-priority resolution job if new identities may now exist;
- appear in the Workflows or Settings attention surface;
- support manual mapping and replay.

Manual mapping must append an audit event.

Replay must reuse the original webhook event row.

Replay must not create a second provider event.

### 10.7 Conflict handling

A conflict occurs when one provider identity points to multiple accounts or a trusted external ID disagrees with an existing verified mapping.

On conflict:

- stop account mutation;
- set identity status to conflict;
- mark the integration or event as needing attention;
- notify the founder once;
- do not send customer outreach;
- retain both candidate mappings in structured detail;
- require explicit operator resolution.

---

## 11. Durable ingestion and queue execution

### 11.1 Webhook route responsibilities

Each webhook route must do only bounded ingress work.

The route must:

1. enforce HTTP method;
2. enforce maximum body size;
3. read the raw body exactly once;
4. verify the provider signature;
5. determine endpoint workspace;
6. extract stable provider event ID;
7. calculate payload hash;
8. atomically insert event and process job;
9. return the provider-appropriate success code.

The route must not:

- call the LLM;
- generate a draft;
- refresh a founder brief;
- send a notification;
- perform broad provider sync;
- mark the full workflow complete.

### 11.2 Stripe signature behavior

Use Stripe's official signature construction with the raw body.

Reject missing secret configuration with server error.

Reject invalid signature with 400.

Enforce Stripe's timestamp tolerance.

Persist only after signature verification.

Return 2xx after the event and job transaction commits.

Use Stripe event ID as external ID.

### 11.3 PostHog signature behavior

Calculate the expected HMAC from the raw body.

Decode both actual and expected signatures into equal-length buffers.

Use `timingSafeEqual`.

Reject unequal length before comparison.

Use PostHog event UUID when present.

If absent, compute a stable dedupe key from endpoint ID, distinct ID, event name, timestamp, and payload hash.

Do not use `no-ts` as a reusable long-term identifier.

### 11.4 Gmail observation behavior

Competition mode may enqueue `sync_gmail_history` every 60 seconds.

Use the Gmail History API cursor stored in `provider_sync_cursors`.

Process only new history records.

If the history ID has expired:

- mark the cursor stale;
- run a bounded reconciliation window;
- store the new cursor;
- avoid treating old messages as new replies.

Production extension may use Gmail `watch` with Google Pub/Sub.

Do not make Pub/Sub a competition blocker.

### 11.5 Worker endpoint

Create a protected worker route, for example:

```text
POST /api/internal/workflows/drain
```

Authenticate it with `CRON_SECRET` or a dedicated worker secret.

The route must:

- claim a bounded batch;
- process jobs with bounded concurrency;
- heartbeat or extend leases for long model calls;
- complete each job independently;
- return counts by status;
- never expose job payloads to unauthenticated callers.

The route may be invoked by:

- Vercel Cron;
- a local demo loop;
- a test harness;
- a best-effort post-ingress kick.

Durability comes from the database queue, not the invocation mechanism.

### 11.6 Job dependency graph

The normal event path is:

```text
process_provider_event
→ project_account_features
→ evaluate_recovery_case
→ run_case_analysis
→ generate_case_draft
→ verify_case_draft
→ notify_founder
→ wait for approval
→ send_approved_draft
→ sync or receive outcome evidence
→ classify_case_outcome
```

Healthy or suppressed decisions stop before analysis and draft generation.

An outcome event may enter directly through:

```text
process_provider_event
→ project_account_features
→ classify_case_outcome
```

### 11.7 Dependency failure rule

A failed stage must not enqueue its dependent stage.

Specifically:

- failed identity resolution blocks feature projection;
- failed feature projection blocks scoring;
- failed scoring blocks analysis;
- failed analysis blocks draft generation unless a documented deterministic fallback is used;
- failed draft generation blocks verification;
- failed verification blocks approval;
- absent approval blocks send;
- failed send does not mark the case monitoring;
- failed outcome classification does not close the case.

This replaces the current behavior where later jobs may continue after an earlier failure.

### 11.8 Retry classification

Retry transient failures:

- provider 429;
- provider 5xx;
- network timeout;
- database connection interruption;
- model rate limit;
- temporary model unavailable;
- lease loss before side effect;
- Gmail temporary send failure.

Do not retry permanent failures without a state change:

- invalid signature;
- malformed payload;
- invalid schema;
- revoked credentials;
- suppression policy;
- ambiguous identity;
- illegal case transition;
- invalid email address;
- content verification failure.

Permanent failures enter `failed` or `dead_letter` with an actionable code.

### 11.9 Retry schedule

Default maximum attempts: 8.

Base backoff: 2 seconds.

Multiplier: 2.

Maximum backoff: 15 minutes.

Jitter: full jitter from 0 to computed delay.

Conceptual schedule before jitter:

```text
2s, 4s, 8s, 16s, 32s, 64s, 128s, 256s
```

Provider `Retry-After` overrides the local delay when longer and within the maximum.

Model calls use the existing in-call retry behavior for very short retryable faults.

The durable job attempt remains the outer recovery boundary.

### 11.10 Lease rules

Default lease duration: 60 seconds.

Model jobs may use 120 seconds.

Heartbeat at one-third of the lease duration.

A worker may complete only a job it currently leases.

An expired lease makes the job reclaimable.

Side effects must still use their own idempotency key because lease expiry can cause duplicate execution.

### 11.11 Dead-letter behavior

When attempts are exhausted:

- set status to `dead_letter`;
- preserve the final error code and message;
- append `job_dead_lettered` case event if a case exists;
- transition the case to failed only if the job is case-critical;
- notify the founder once;
- show a retry action in the workflow UI;
- require an explicit operator replay or relevant integration repair.

Replaying creates a new job version or resets the same job under an audited action.

Do not erase attempt history.

### 11.12 Reconciliation jobs

Webhooks are the fast path.

Reconciliation is the correctness backstop.

Run bounded reconciliation for:

- Stripe subscription and invoice state;
- PostHog usage windows;
- Gmail history cursor;
- stuck cases;
- expired approvals;
- monitoring deadlines.

Daily cron should enqueue reconciliation jobs.

It should no longer perform the entire workflow synchronously.

---

## 12. Recovery-case state machine

### 12.1 Legal transitions

```text
open → analyzing
open → suppressed
open → resolved(no_action_required)
open → failed

analyzing → action_proposed
analyzing → suppressed
analyzing → failed

action_proposed → awaiting_approval
action_proposed → suppressed
action_proposed → failed

awaiting_approval → approved
awaiting_approval → suppressed
awaiting_approval → resolved(operator_closed)
awaiting_approval → failed

approved → sent
approved → awaiting_approval   # content changed or approval expired
approved → failed

sent → monitoring
sent → failed

monitoring → resolved
monitoring → failed

failed → open                 # explicit retry only
failed → resolved(operator_closed)
```

No other transition is legal.

### 12.2 Transition guard

All transitions go through one case service function.

The function must:

- load the case for update;
- verify current status;
- verify requested transition;
- verify required fields;
- apply timestamps;
- append a case event;
- enqueue dependent work when needed;
- commit atomically.

Do not update status directly from webhook, sync, draft, or UI modules.

### 12.3 Case open behavior

When a trigger requires a case:

- calculate case key;
- lock or upsert on the unique key;
- capture MRR baseline before account mutation;
- attach trigger event;
- capture feature snapshot;
- capture score and confidence;
- select severity and action;
- create `case_opened` and `score_computed` events;
- enqueue analysis only if policy permits.

### 12.4 Case update behavior

Related evidence on an open case may:

- increase score;
- increase severity;
- increase confidence;
- change action before approval;
- supersede an unapproved draft;
- update the outcome deadline;
- add a compound-signal override.

Related evidence must not:

- lower severity solely because one provider is temporarily unavailable;
- alter approved content without clearing approval;
- rewrite MRR baseline;
- erase earlier evidence;
- reopen a resolved case without a new incident key.

### 12.5 Case suppression behavior

Suppress a case when:

- contact policy is `do_not_contact`;
- identity confidence is below the automatic threshold;
- no valid recipient exists;
- the same action is inside cooldown;
- the account is a healthy control;
- all risk inputs are stale or unavailable;
- the case is a duplicate;
- the integration is disconnected and fresh provider evidence is required.

Suppression is a visible decision.

It is not silent dropping.

### 12.6 Case failure versus suppression

Use suppression when the system correctly decides not to act.

Use failure when required processing did not complete.

Examples:

- do-not-contact is suppression;
- healthy account is no action;
- ambiguous identity is suppression plus attention;
- model timeout after retries is failure;
- invalid generated draft is failure or deterministic fallback;
- Gmail 401 is failure plus integration needs attention.

### 12.7 Terminal resolution rules

`strictly_recovered` requires verified Stripe billing restoration.

`protected` requires a credible risk incident followed by retained active billing through the defined observation checkpoint, without a preceding lost-revenue state.

`product_recovered` requires usage restoration but does not claim recovered MRR.

`engaged` requires a verified reply or other engagement but does not claim recovered MRR.

`churned` requires verified cancelled or terminal unpaid state at the outcome deadline.

`expired_unknown` means the observation window ended without sufficient evidence.

`no_action_required` means deterministic policy found no intervention necessary.

### 12.8 Concurrent event behavior

If Stripe and PostHog events arrive together:

- both are durably stored;
- both jobs may project features;
- account/case locking serializes decision writes;
- the later decision sees the latest canonical features;
- one case absorbs both pieces of evidence when keys relate;
- duplicate analysis jobs collapse by idempotency key;
- an unapproved draft may be superseded once;
- an approved draft requires reapproval if material evidence changes its content.

---

## 13. Provider-specific processing

### 13.1 Stripe event projection

For every supported event:

1. resolve Stripe customer ID;
2. resolve account identity;
3. read the current account and feature row;
4. capture pre-mutation MRR when cancellation or downgrade is involved;
5. normalize invoice or subscription facts;
6. update billing feature fields;
7. update identity last-seen timestamps;
8. append account timeline evidence;
9. enqueue decision evaluation.

### 13.2 `invoice.payment_failed`

Required feature changes:

- billing available becomes true;
- billing status becomes failed or past due based on authoritative invoice/subscription state;
- last invoice ID and status update;
- failure count is computed from invoice attempts or events;
- last failure timestamp updates;
- MRR remains the active subscription MRR;
- account status becomes past due when appropriate.

Required decision behavior:

- first failure creates high billing risk;
- repeated failure within seven days triggers critical override;
- case key uses invoice ID;
- action defaults to billing recovery;
- discounts are not auto-offered.

### 13.3 `invoice.paid`

Required feature changes:

- update last successful payment timestamp;
- update invoice status;
- restore current billing state from Stripe;
- do not erase historical failure counts;
- set account active if Stripe subscription is active.

Required outcome behavior:

- find an open case for the same customer and invoice or subscription;
- require payment time after case open;
- require the case to represent failed or past-due billing;
- append billing-recovered evidence;
- set strict recovered cents to case baseline MRR;
- resolve as strictly recovered;
- do not require waiting seven or thirty days.

An unrelated paid invoice must not close a cancellation case.

### 13.4 `customer.subscription.updated`

Detect:

- active to past due;
- cancel-at-period-end false to true;
- cancel-at-period-end true to false;
- plan downgrade;
- plan upgrade;
- reactivation;
- MRR change.

Capture the prior subscription projection before overwriting it.

For cancel-at-period-end:

- capture current MRR as baseline;
- severity is high or critical based on proximity and usage evidence;
- action is cancellation rescue or founder review.

For reactivation:

- match the open cancellation case;
- resolve strictly recovered only if lost billing had occurred;
- otherwise resolve protected if cancellation intent was reversed before revenue loss.

### 13.5 `customer.subscription.deleted`

Before writing zero current MRR:

- read current projected MRR;
- calculate from event subscription items if missing;
- persist it to case baseline and `pre_cancel_mrr_cents`;
- open or update the cancellation case.

Then update the current account projection to cancelled and zero MRR.

Never use the post-cancellation zero as recoverable MRR.

### 13.6 Stripe reconciliation

The reconciliation job must:

- page through changed Stripe objects with bounded limits;
- honor provider pagination;
- use test-mode credentials in the scenario workspace;
- upsert identities;
- project authoritative state;
- avoid creating drafts directly;
- enqueue evaluation only when material state changed;
- update the cursor after successful page commit.

Do not infer failure count from subscription status alone.

### 13.7 PostHog window projection

For each account, compute:

- current seven-day event count;
- previous seven-day event count;
- current seven-day key-feature count;
- previous seven-day key-feature count;
- usage delta when volume is sufficient;
- last product activity time;
- latest cancellation intent;
- source freshness.

Use half-open windows:

```text
current:  [now - 7d, now)
previous: [now - 14d, now - 7d)
```

Pin `now` to the evaluation run time.

Do not let different queries use different window endpoints.

### 13.8 PostHog decline formula

When previous volume meets the minimum:

```text
usage_delta_percent = ((current - previous) / previous) * 100
```

Round only for display.

Keep full numeric precision for threshold comparison.

When previous volume is zero:

- current zero means unavailable trend, not stable;
- current positive means new or growing usage;
- do not divide by zero;
- do not classify a decline.

When prior volume is below the minimum:

- store raw counts;
- set trend unavailable;
- reduce confidence;
- do not flag percentage volatility.

### 13.9 Key-feature disappearance

Set key feature missing when:

- previous key-feature count is at least the configured minimum;
- current key-feature count is zero;
- the feature stream is fresh.

This is stronger evidence than a general event-count decline.

It may trigger a high usage component even if overall usage is stable.

### 13.10 Cancellation intent

An `allel_cancel_intent` event or configured cancellation-page visit is a hard event.

It must:

- update `cancel_intent_at`;
- append a timeline event;
- trigger immediate evaluation;
- open or update a case;
- select cancellation rescue subject to suppression;
- notify the founder through the durable job path.

### 13.11 PostHog recovery evidence

Product recovery may be observed when:

- current usage returns to at least 80 percent of the prior baseline; or
- the missing key feature is used again; or
- an explicit `allel_recovery_action` occurs.

Product recovery updates the case evidence immediately.

It does not create strict recovered MRR.

It may resolve a usage-only case as `product_recovered`.

### 13.12 PostHog incremental sync

Do not delete all existing usage signals.

Ingest new events since the cursor.

Recompute affected accounts only.

Maintain a bounded overlap window to tolerate late-arriving events.

Deduplicate by PostHog UUID or stable event fingerprint.

Advance the cursor only after affected projections are committed.

### 13.13 Gmail outbound projection

On successful send:

- persist provider message ID;
- persist provider thread ID;
- persist sent timestamp;
- append `email_sent` timeline event;
- bind thread identity;
- create or update outcome monitoring row;
- transition case to sent and then monitoring;
- schedule next Gmail history sync.

On uncertain send result:

- query Gmail by message or thread metadata before retry;
- do not blindly resend;
- use the send idempotency key and a deterministic marker header when supported.

### 13.14 Gmail inbound projection

A message counts as a customer reply only when:

- it is in the bound Gmail thread or uniquely resolves to the account;
- sender is a verified account contact;
- sender is not the connected founder;
- message is newer than the outbound send;
- it is not an automated bounce, vacation response, or mailing-list message;
- it has not already been processed.

On valid reply:

- append `email_received` timeline event;
- attach redacted message metadata to the case;
- mark engagement evidence;
- enqueue outcome classification;
- optionally enqueue a founder notification;
- never mark strict revenue recovered from the reply alone.

### 13.15 Disconnected-provider behavior

When required provider credentials are disconnected or unhealthy:

- return a structured `connection_guard` result;
- do not substitute seeded or cached data as live truth;
- preserve last known state with freshness timestamp;
- lower confidence because the domain is stale;
- block action if fresh evidence is required;
- mark the case or job needs attention;
- show Settings remediation;
- avoid repeated founder notifications inside the dedupe window.

---

## 14. Canonical feature ownership

### 14.1 Single writer rule

Only `projectAccountFeatures()` writes `account_features`.

Only `evaluateAccountDecision()` writes current risk projections on `customer_accounts`.

Stripe sync cannot write risk score.

PostHog sync cannot write risk score.

Gmail sync cannot write risk score.

Draft workflows cannot write risk score.

Webhook routes cannot write risk score.

### 14.2 Projection inputs

The projector may read:

- verified provider event payloads;
- provider API responses;
- provider identities;
- current sync cursors;
- existing account feature row;
- immutable timeline evidence;
- integration health.

The projector must not read model prose as a feature.

### 14.3 Material-change detection

After projection, compare normalized feature hashes.

Enqueue decision evaluation only when:

- a risk-relevant feature changed;
- data freshness crossed a stale boundary;
- an outcome event arrived;
- policy or score version changed;
- an operator requested re-evaluation.

Do not run the LLM for no-op provider events.

### 14.4 Feature freshness

Each domain has its own freshness timestamp.

The domain is available only when:

- the integration is connected;
- the latest successful sync or event is within the configured freshness limit;
- the identity mapping is valid;
- required source fields are present.

Stale data remains visible as last known state.

Stale data does not count as fully available for confidence.

### 14.5 Snapshot reproducibility

Every score snapshot must contain enough feature values to recompute the score offline.

At minimum store:

- component inputs;
- component outputs;
- availability flags;
- freshness values;
- identity confidence;
- hard overrides;
- score version;
- policy version;
- evaluation timestamp.

Do not require a future live API call to explain a historical decision.

---

## 15. Deterministic scoring model

### 15.1 Meaning of the score

The score is a 0-to-100 risk index.

It ranks urgency from available evidence.

It is not a statistical probability.

It is not trained.

It is not directly comparable across score versions without the stored version.

### 15.2 Active competition domains

The first production-shaped version uses only domains supported by the three proof APIs:

- billing;
- usage;
- communication.

The current engine's support, renewal, and engagement fields may remain in legacy code.

Do not feed them conservative-looking defaults and count them as evidence.

Add those domains later only when a real source and freshness contract exist.

### 15.3 Initial domain weights

Use these versioned initial weights:

| Domain | Weight | Rationale |
|---|---:|---|
| Billing | 0.50 | Direct revenue state and strongest recovery truth |
| Usage | 0.35 | Product abandonment and cancellation intent |
| Communication | 0.15 | Outreach fatigue and engagement context |

Weights sum to 1.00.

These are configuration, not magic constants scattered through modules.

### 15.4 Availability-aware formula

For each domain `i`:

- `component_i` is from 0 to 100;
- `weight_i` is the configured domain weight;
- `available_i` is 1 when sufficiently fresh and supported, otherwise 0.

Compute:

```text
weighted_sum = Σ(component_i × weight_i × available_i)
available_weight = Σ(weight_i × available_i)
base_score = weighted_sum / available_weight
```

If available weight is zero:

- score is null internally;
- dashboard projection may show 0 only with `insufficient_data`;
- confidence is zero;
- action policy is no automatic contact.

Do not treat unavailable components as zero risk.

### 15.5 Confidence formula

Compute three confidence factors:

```text
coverage = available_weight / total_weight
freshness = weighted freshness multiplier across available domains
identity = deterministic identity confidence
```

Then:

```text
score_confidence = clamp(coverage × freshness × identity, 0, 1)
```

Initial freshness multipliers are:

| Age of source | Multiplier |
|---|---:|
| Up to 1 hour | 1.00 |
| Over 1 hour to 6 hours | 0.95 |
| Over 6 hours to 24 hours | 0.85 |
| Over 24 hours to 72 hours | 0.60 |
| Over 72 hours | 0.00 |

Hard provider events use freshness 1.00 at ingestion.

### 15.6 Billing component

Initial billing component values:

| Condition | Component value |
|---|---:|
| Current and paid | 0 |
| Invoice open but not overdue | 20 |
| One payment failure | 80 |
| Subscription past due | 75 |
| Two failures in 7 days | 95 |
| Three or more failures in 30 days | 100 |
| Cancel at period end | 90 |
| Subscription cancelled | 100 |
| Verified reactivation after cancellation | 0 current, outcome evidence retained |

When multiple conditions apply, take the maximum and record every contributing fact.

Do not sum billing facts beyond 100.

### 15.7 Usage component

Initial usage component values:

| Condition | Component value |
|---|---:|
| Stable or growing with adequate volume | 0 |
| Decline worse than 20% but less than 40% | 35 |
| Decline of 40% through less than 60% | 65 |
| Decline of 60% or more | 85 |
| Key feature disappeared | 90 |
| Explicit cancellation intent | 100 |
| Insufficient prior volume | unavailable trend |

Use exact comparison rules in code.

Recommended boundaries:

```text
delta > -20                         → 0
-40 < delta <= -20                 → 35
-60 < delta <= -40                 → 65
delta <= -60                       → 85
key_feature_missing                → max(current, 90)
cancel_intent                      → 100
```

The boundary tests must cover exactly -20, -40, and -60.

### 15.8 Communication component

Communication is context, not the primary trigger in this build.

Initial values after an Allel outreach:

| Condition | Component value |
|---|---:|
| Customer replied | 0 |
| No reply for less than 3 days | 10 |
| No reply for 3 through 6 days | 30 |
| No reply for 7 through 13 days | 55 |
| No reply for 14 or more days | 70 |
| No previous outbound | unavailable |

A reply may lower communication risk.

It may not overwrite billing or usage risk.

### 15.9 Hard-event overrides

After the availability-aware base score, apply floors:

| Hard event | Score floor | Severity floor |
|---|---:|---|
| Subscription cancelled | 95 | critical |
| Cancel at period end | 90 | critical |
| Cancellation intent | 90 | critical |
| Repeated payment failure | 90 | critical |
| Single payment failure | 80 | high |
| Past due | 75 | high |
| Key feature disappearance | 75 | high |
| Billing risk plus severe usage decline | 95 | critical |

Hard overrides do not increase confidence.

They increase risk and severity because the observed event itself is decisive.

Record every applied override.

### 15.10 Compound-signal logic

A compound billing-plus-usage incident exists when:

- billing component is at least 75;
- usage component is at least 65;
- both domains are fresh;
- both resolve to the same verified account;
- evidence timestamps fall within the compound window.

Default compound window: 72 hours.

Compound behavior:

- score floor becomes 95;
- severity becomes critical;
- action reason cites both domains;
- founder notification priority increases;
- a single case absorbs the evidence;
- the draft addresses the root problem without exposing internal surveillance detail.

Call the existing compound-signal logic from the canonical evaluation path or replace it with this versioned rule.

Do not leave it as unused library code.

### 15.11 Severity thresholds

After hard overrides:

| Score | Default severity |
|---|---|
| 0–44 | low |
| 45–69 | medium |
| 70–84 | high |
| 85–100 | critical |

Severity may be raised by an override.

Severity may not be lowered below an override floor.

### 15.12 Confidence gates

| Confidence | Allowed behavior |
|---|---|
| Below 0.50 | No automatic case outreach; request data repair |
| 0.50–0.74 | Case and founder review; no automatic draft by default |
| 0.75–0.89 | Draft allowed for high/critical risk; mandatory warning |
| 0.90–1.00 | Normal policy path |

Identity confidence below 0.90 blocks customer-facing outreach regardless of overall score confidence.

### 15.13 Score version

Initial version string:

```text
risk-v2-three-source-2026-08
```

The exact value may change before implementation.

It must be constant in one config module and persisted with every snapshot and case.

### 15.14 Score explanation contract

The deterministic engine returns:

```ts
type RiskDecision = {
  score: number | null
  confidence: number
  severity: 'low' | 'medium' | 'high' | 'critical'
  components: {
    billing: ComponentResult
    usage: ComponentResult
    communication: ComponentResult
  }
  availableDomains: string[]
  missingDomains: string[]
  hardOverrides: string[]
  scoreVersion: string
  evaluatedAt: string
}
```

Each component result includes:

- value;
- available;
- freshness;
- input facts;
- evidence IDs;
- rule IDs.

### 15.15 Revenue priority

Risk and revenue value are separate dimensions.

Calculate priority for queue ordering and founder display:

```text
severity_multiplier:
  critical = 1.00
  high     = 0.75
  medium   = 0.40
  low      = 0.10

revenue_priority = mrr_baseline_cents
                 × severity_multiplier
                 × max(score_confidence, 0.25)
```

Do not add MRR into the risk score.

A low-MRR critical failure remains critical.

A high-MRR healthy account remains healthy.

Priority answers what the founder should inspect first among similarly valid cases.

### 15.16 Velocity

Score velocity is optional context.

It does not change the initial action policy unless explicitly versioned.

If retained:

- compute from recent canonical snapshots;
- query the newest seven snapshots, not the oldest seven;
- require at least two distinct timestamps;
- record span days;
- show it only when meaningful.

Do not let multiple same-minute evaluations create a misleading per-day slope.

### 15.17 Score tests

Unit tests must cover:

- every component boundary;
- every hard override;
- no domains available;
- one domain missing;
- all domains fresh;
- stale domain;
- low identity confidence;
- insufficient usage volume;
- zero previous usage;
- key feature disappearance;
- compound signal inside window;
- signals outside compound window;
- score clamping;
- severity floors;
- version persistence;
- revenue priority independent from risk score.

---

## 16. Deterministic action policy

### 16.1 Policy output

The policy engine returns:

```ts
type ActionDecision = {
  actionType:
    | 'no_action'
    | 'founder_review'
    | 'billing_recovery_email'
    | 'cancellation_rescue_email'
    | 'usage_checkin_email'
    | 'compound_recovery_email'
    | 'monitor_only'
  allowed: boolean
  requiresApproval: boolean
  urgency: 'none' | 'this_week' | 'today' | 'immediate'
  reasonCode: string
  suppressionReason: string | null
  policyVersion: string
  cooldownUntil: string | null
}
```

### 16.2 Initial action matrix

| Evidence | Minimum confidence | Action | Urgency |
|---|---:|---|---|
| Healthy, score below 45 | any valid | no action | none |
| Medium risk without hard event | 0.75 | monitor or founder review | this week |
| One payment failure | 0.75 | billing recovery draft | today |
| Repeated payment failure | 0.75 | billing recovery draft | immediate |
| Cancel at period end | 0.75 | cancellation rescue draft | immediate |
| Subscription cancelled | 0.75 | cancellation rescue draft | immediate |
| Severe usage decline | 0.75 | usage check-in draft | today |
| Cancellation intent | 0.75 | cancellation rescue draft | immediate |
| Compound billing and usage | 0.75 | compound recovery draft | immediate |
| Low confidence | below 0.75 | founder review | today |
| Do-not-contact | any | suppressed | none |

### 16.3 Stopping rules

Stop before draft generation when:

- score is below the action threshold;
- action type is no action;
- identity is insufficient;
- recipient is missing;
- provider evidence is stale;
- contact policy suppresses outreach;
- an equivalent draft exists;
- cooldown is active;
- case is terminal;
- case is already approved or sent;
- required integration is unhealthy.

Stop before send when:

- approval is absent;
- approval expired;
- approved hash differs from current hash;
- draft is superseded;
- recipient changed after approval;
- case is not approved;
- contact policy changed;
- Gmail is disconnected;
- send idempotency key already completed;
- case has already resolved;
- draft verification no longer passes.

### 16.4 Cooldowns

Initial cooldowns:

| Action | Cooldown |
|---|---:|
| Billing recovery email | 72 hours per invoice |
| Cancellation rescue email | 7 days per subscription incident |
| Usage check-in email | 7 days per account |
| Compound recovery email | 7 days per case |
| Founder critical notification | 60 minutes per case |
| Integration-failure notification | 6 hours per provider |

New decisive evidence may override a cooldown for founder notification.

It does not automatically authorize another customer email.

### 16.5 Discount policy

The current action selector suggests rescue discounts as secondary actions.

Do not issue or promise discounts automatically in the competition build.

A model may not invent a percentage, duration, coupon, or billing term.

If a workspace-configured offer exists, the draft may reference only the exact approved offer fields.

Otherwise use empathy, support, and a clear next step.

### 16.6 Policy version

Initial version string:

```text
action-policy-v2-founder-approved
```

Persist it with cases, drafts, and outcome attribution.

### 16.7 Policy tests

Test:

- each matrix row;
- every stopping rule;
- cooldown boundary;
- expired approval;
- changed content hash;
- suppression added after approval;
- disconnected Gmail after approval;
- case resolved before send;
- exact configured offer allowed;
- invented offer rejected.

---

## 17. Agent workflow design

### 17.1 Design principle

The durable workflow is an orchestrated state machine with model steps.

It is not a model improvising the state machine.

Keep the existing four conceptual stages:

```text
detect → analyze → draft → verify
```

Change their contracts.

### 17.2 Detect stage

Detect is deterministic.

It performs:

- event validation;
- identity resolution;
- feature projection;
- score computation;
- severity selection;
- action policy;
- case open or update.

Detect does not require an LLM.

The detect stage output is the stored `RiskDecision` and `ActionDecision`.

### 17.3 Analyze stage

Analyze uses the model only after deterministic policy permits it.

Analyze input contains:

- case ID;
- account display name;
- verified facts;
- evidence IDs;
- timestamps;
- risk decision;
- action decision;
- MRR baseline;
- permitted offer data;
- recent outbound context;
- explicit missing-data list.

Analyze output schema:

```ts
type CaseAnalysis = {
  caseId: string
  primaryCause: 'billing' | 'usage' | 'compound' | 'cancellation_intent'
  summary: string
  customerSafeReason: string
  evidence: Array<{
    evidenceId: string
    claim: string
  }>
  uncertainty: string[]
  recommendedTone: 'helpful' | 'concise' | 'empathetic' | 'urgent'
  recommendedNextStep: string
  prohibitedClaims: string[]
}
```

Analysis must cite only supplied evidence IDs.

Unknown evidence IDs fail validation.

### 17.4 Analyze tool policy

Analyze may use read-only tools when fresh data must be fetched.

Allowed categories:

- get verified Stripe account state;
- get bounded PostHog usage summary;
- get Gmail thread metadata;
- read account timeline;
- read case evidence.

Analyze may not:

- create a coupon;
- send email;
- modify account state;
- approve a draft;
- close a case.

The current stage allowlist mechanism should enforce this.

### 17.5 Draft stage

Draft input is the validated case analysis and deterministic action.

Draft output schema:

```ts
type RecoveryDraft = {
  caseId: string
  actionType: string
  recipientEmail: string
  subject: string
  bodyText: string
  evidenceIdsUsed: string[]
  offerId: string | null
  callToAction: string
  safetyNotes: string[]
}
```

Draft may create a durable `follow_up_drafts` record.

Draft may not send it.

Draft may not approve it.

Draft may not create a provider-side coupon.

### 17.6 Draft language constraints

The customer email must:

- be concise;
- use a human founder voice;
- state a helpful reason for reaching out;
- include one clear next step;
- avoid claiming hidden behavioral surveillance;
- avoid mentioning a risk score;
- avoid mentioning churn prediction;
- avoid fabricated facts;
- avoid fabricated discounts;
- avoid false urgency;
- avoid exposing internal event names;
- avoid sensitive payment detail;
- avoid multiple competing calls to action.

Recommended maximum body length: 180 words.

Recommended subject maximum: 78 characters.

### 17.7 Verify stage

Verification has two layers.

Layer one is deterministic and mandatory.

Layer two is optional model critique.

Deterministic checks:

- schema valid;
- case exists;
- case status permits draft;
- action matches policy;
- recipient matches verified contact;
- contact is not suppressed;
- evidence IDs belong to case;
- claims are supported;
- no forbidden financial promise;
- no secrets or raw IDs exposed;
- subject and body length within limits;
- one call to action;
- no send tool used;
- content hash computed.

Optional model critique checks:

- tone;
- clarity;
- empathy;
- repetition;
- customer-safe wording.

The model critique cannot override a deterministic failure.

### 17.8 Verification output

```ts
type DraftVerification = {
  caseId: string
  draftId: string
  passed: boolean
  deterministicChecks: Array<{
    ruleId: string
    passed: boolean
    detail: string
  }>
  critique: string[]
  contentHash: string
  verifierVersion: string
}
```

A passing result moves the case to awaiting approval.

A failure moves the draft to needs review or failed according to reason.

### 17.9 Structured output enforcement

Use Zod schemas already available in the repository.

Validate model output before persistence.

On a schema error:

- allow one constrained repair attempt;
- supply only validation errors and original safe context;
- do not broaden tools;
- persist both attempt results in agent runs;
- fail the stage if repair remains invalid.

### 17.10 Model choice

The workflow should use the best reliable configured model available through the existing AI abstraction.

Do not hardcode a competition claim around an unavailable future model.

Keep model ID configurable.

Keep the existing fallback model behavior.

Record which model produced each analysis and draft.

Do not silently use fallback output without marking it.

### 17.11 Model parameters

Initial model-call parameters:

| Stage | Temperature | Max output tokens | Timeout |
|---|---:|---:|---:|
| Analyze | 0.1 | 900 | 30 seconds |
| Draft | 0.3 | 700 | 30 seconds |
| Critique | 0.0 | 500 | 20 seconds |

If the selected provider does not expose temperature for the model, omit it rather than emulating it.

Use explicit schemas to control variability.

### 17.12 Prompt versioning

Store prompts as versioned constants or files.

Initial logical versions:

```text
case-analysis-v1
recovery-draft-v1
draft-critique-v1
```

Every agent run records prompt version.

Do not edit prompts without changing the version before final evaluation.

### 17.13 Context minimization

Provide only the evidence required for the case.

Do not send:

- OAuth tokens;
- API keys;
- unredacted webhook payloads;
- unrelated account timelines;
- unrelated Gmail threads;
- full PostHog person profiles;
- internal secrets;
- other workspace data.

Redact card fragments and sensitive payment fields.

### 17.14 Tool expansion truth

Keep the implemented AI SDK `activeTools` and `prepareStep` behavior for chat workflows that need scoped expansion.

Do not model a tool call that merely returns `"unlocked"` and pretend later tools became available.

For durable recovery stages, construct the agent step with the exact stage allowlist.

If a later stage needs a different schema:

- end the prior stage;
- persist its typed result;
- enqueue the next job;
- create the next agent execution with its own tools.

### 17.15 Agent failure fallback

If analysis fails after retries:

- keep the case open or failed;
- preserve deterministic decision;
- show founder evidence directly;
- do not draft automatically unless a reviewed deterministic template exists.

If draft generation fails:

- optionally generate a deterministic safe template for billing failure only;
- label it as template-generated;
- still require verification and approval;
- do not use a generic template for cancellation or compound-risk nuance without review.

If critique fails:

- deterministic verification remains authoritative;
- do not block a valid draft solely because optional critique is unavailable;
- record the degraded path.

### 17.16 Agent cost controls

Do not call the model for:

- invalid signatures;
- duplicate events;
- unmapped events;
- healthy accounts;
- suppressed cases;
- no-op feature projections;
- already-resolved cases;
- outcome classification;
- metric calculation.

Cache nothing that could cross workspace or case boundaries.

Track model calls per case.

Initial maximum model calls per action version: 4.

### 17.17 Agent tests

Test:

- schema-valid analysis;
- unknown evidence citation rejection;
- fabricated offer rejection;
- send tool absent from draft stage;
- write tools absent from detect and verify;
- stage stops after failure;
- one schema repair attempt;
- fallback model marked;
- deterministic fallback marked;
- prompt version logged;
- secrets absent from prompts;
- unrelated workspace context absent;
- exact stage tools constructed.

---

## 18. Approval and send safety

### 18.1 Approval object

Approval must bind:

- workspace ID;
- case ID;
- draft ID;
- recipient;
- subject;
- full body content hash;
- action version;
- approving actor;
- approval timestamp;
- expiry timestamp.

Approval of a preview is insufficient if the sent full body can differ.

### 18.2 Content hash

Canonicalize:

- normalized recipient;
- subject with stable newline handling;
- full body with stable newline handling;
- offer ID;
- case ID;
- action version.

Hash with SHA-256.

Store the digest as lowercase hex.

Any material edit changes the hash.

### 18.3 Approval expiry

Default approval lifetime: 24 hours.

Shorten it to 2 hours for critical billing state if provider state can change quickly.

On expiry:

- clear approved status;
- return case to awaiting approval;
- re-run current-state verification;
- notify the founder only if the case remains actionable.

### 18.4 Approval authorization

Approve and reject routes must:

- authenticate the user;
- load workspace membership;
- require owner or admin role for send approval;
- verify CSRF protections provided by the app flow;
- lock the draft;
- verify draft workspace;
- verify current hash;
- append audit event;
- never accept actor identity from request body.

### 18.5 Send job

The API approval request enqueues a send job.

It does not call Gmail inline.

The send job rechecks every stopping rule.

The send job records a `send_started` event before the provider call.

The send job records provider IDs on success.

The send job transitions the case only after confirmed success.

### 18.6 Send idempotency

Logical send key:

```text
workspace + draft_id + approved_content_hash
```

Before a retry:

- check the stored provider message ID;
- search the bound Gmail thread or deterministic marker if result was uncertain;
- mark success if the prior send is discovered;
- send again only when prior non-delivery is confirmed.

### 18.7 Rejection

Founder rejection must:

- record reason;
- set draft to rejected or superseded state;
- append case event;
- leave the case open for operator choice;
- not automatically regenerate repeatedly;
- allow explicit regenerate action with a new action version.

### 18.8 Draft UI requirements

The review card must show:

- account;
- case severity;
- MRR baseline;
- trigger;
- concise evidence;
- confidence;
- recipient;
- subject;
- full body;
- any missing-data warning;
- any offer reference;
- approve;
- edit;
- reject;
- open case timeline.

The button must say `Approve and queue send` rather than implying the email was already sent.

---

## 19. Outcome truth and attribution

### 19.1 Outcome dimensions

Track separate dimensions:

- customer responded;
- customer engaged;
- product usage recovered;
- billing protected;
- billing strictly recovered;
- customer churned;
- still at risk;
- pending;
- unknown.

Do not collapse them into one optimistic number.

### 19.2 Strictly recovered definition

Strict recovered revenue requires:

- a case with nonzero MRR baseline;
- an initial verified failed, past-due, or cancelled billing state;
- a later verified paid or reactivated billing state;
- matching Stripe customer and relevant subscription or invoice;
- outcome timestamp after case open;
- outcome inside attribution window;
- no earlier unrelated case claiming the same recovery event.

Strict recovered amount for an active monthly subscription is the case MRR baseline.

Do not use invoice total as MRR unless the product explicitly normalizes it.

### 19.3 Protected definition

Protected revenue applies when:

- the case captured credible cancellation intent or cancel-at-period-end;
- billing had not yet been lost;
- the intent was reversed or the subscription remained active through the checkpoint;
- attribution evidence exists;
- the case did not also qualify as strict recovery.

Protected MRR is reported separately.

It is not added to strict recovered MRR.

### 19.4 Product recovered definition

Product recovery applies when:

- a usage-only or compound case had severe usage evidence;
- later usage reached the configured recovery threshold;
- the source was fresh;
- the event occurred after case open;
- the same account identity was used.

Product recovery may strengthen the protected case narrative.

It is not direct financial recovery.

### 19.5 Engaged definition

Engaged means:

- verified Gmail reply; or
- another explicit, configured engagement event after outreach.

Engaged is a funnel step.

It is not a revenue result.

### 19.6 Churned definition

Churned means:

- subscription remains cancelled at deadline; or
- terminal unpaid state meets the configured age; or
- operator confirms lost account with evidence.

A single payment failure is not churn.

A missing PostHog event is not churn.

### 19.7 Event attribution order

Attribute an outcome to:

1. exact case-linked provider object;
2. exact account with one compatible open case;
3. most recent compatible open case within window;
4. unresolved attribution queue.

Never select a case with incompatible trigger type merely because it is recent.

### 19.8 Attribution windows

Initial windows:

| Case type | Attribution window |
|---|---:|
| Invoice payment failure | 30 days |
| Past-due subscription | 30 days |
| Cancellation or reactivation | 45 days |
| Cancellation intent | 30 days |
| Usage decline | 21 days |
| Gmail engagement | 14 days |

Store the deadline on the case at open time.

Changing configuration later must not silently alter old case deadlines.

### 19.9 Outcome event examples

Failed invoice followed by `invoice.paid`:

- strictly recovered;
- recovered cents equals case MRR baseline;
- case resolves immediately.

Cancel-at-period-end reversed before cancellation:

- protected;
- protected cents equals case MRR baseline;
- strict recovered cents remains zero.

Customer replies but invoice remains unpaid:

- engaged;
- strict recovered cents remains zero;
- case remains monitoring.

Usage returns but subscription remains past due:

- product recovered evidence;
- strict recovered cents remains zero;
- billing case remains open.

Subscription cancels after a friendly reply:

- churned;
- engaged may remain true;
- recovered and protected cents remain zero.

### 19.10 Metric formulas

```text
processed_event_count
  = count of unique verified provider events completed

evaluated_account_count
  = distinct accounts with canonical score snapshots in the run

flagged_account_count
  = distinct accounts with action-eligible cases

healthy_suppression_rate
  = healthy controls receiving no customer action / all healthy controls

precision
  = correctly flagged labeled scenarios / all flagged labeled scenarios

recall
  = correctly flagged labeled risk scenarios / all labeled risk scenarios

draft_rate
  = verified drafts / action-eligible unsuppressed cases

approval_rate
  = approved drafts / verified drafts presented

send_success_rate
  = confirmed sends / approved send jobs

engagement_rate
  = cases with verified engagement / confirmed sent cases

strict_recovery_rate
  = strictly recovered billing cases / contacted recoverable billing cases

mrr_at_risk
  = sum of baseline MRR for unique open action-eligible cases

strict_recovered_mrr
  = sum of strict_recovered_cents across attributed cases

protected_mrr
  = sum of protected_cents across attributed cases

outcome_coverage
  = cases with terminal or explicit pending classification / monitored cases

duplicate_action_rate
  = duplicate customer sends / all customer sends
```

### 19.11 Financial deduplication

Do not sum MRR twice when multiple cases overlap one subscription.

For current MRR at risk:

- group by workspace and subscription identity;
- choose the highest-severity active case;
- count the baseline once.

For recovered MRR:

- one Stripe recovery event can satisfy at most one financial case;
- store the claiming outcome or case ID;
- enforce uniqueness where possible.

### 19.12 Replace the current revenue-saved behavior

The current code gives a replied case 50 percent of MRR as saved.

Remove that from the strict financial metric.

Expose separate fields:

```ts
type RecoveryMetrics = {
  strictRecoveredCents: number
  protectedCents: number
  atRiskCents: number
  engagedCaseCount: number
  productRecoveredCaseCount: number
  churnedCaseCount: number
  pendingCaseCount: number
  unknownCaseCount: number
  observationStart: string
  observationEnd: string
  testMode: boolean
}
```

The old endpoint may retain a compatibility field only if clearly labeled estimate.

The new UI must lead with strict fields.

### 19.13 Event-driven and scheduled outcomes

Process outcome evidence immediately when Stripe, PostHog, or Gmail provides it.

Run scheduled classification for:

- case deadlines;
- protected checkpoints;
- stale monitoring cases;
- missing provider events;
- reconciliation corrections.

Do not wait seven days to record an immediately observed payment recovery.

### 19.14 Outcome tests

Test:

- failed invoice then paid;
- paid invoice unrelated to case;
- cancellation then reactivation;
- cancel intent reversed before cancellation;
- reply without payment;
- usage rebound without payment;
- reply then churn;
- recovery outside window;
- duplicate recovery event;
- two cases for one subscription;
- MRR baseline preserved through cancellation;
- zero current MRR with nonzero baseline;
- strict and protected totals never overlap.

---

## 20. Parameter registry

All parameters live in one typed configuration module, for example:

```text
web/src/lib/recovery/config.ts
```

Configuration must be validated at startup with Zod.

The defaults below form the initial competition policy.

### 20.1 Ingress parameters

| Parameter | Default | Allowed guidance | Why it matters |
|---|---:|---|---|
| `WEBHOOK_MAX_BODY_BYTES` | 1,048,576 | 64 KB–2 MB | Prevents memory abuse while allowing normal payloads |
| `WEBHOOK_ACK_TARGET_MS` | 500 | observational | Measures ingress performance |
| `WEBHOOK_ACK_HARD_MS` | 2,000 | 1–5 seconds | Demo and provider reliability guard |
| `STRIPE_SIGNATURE_TOLERANCE_SECONDS` | 300 | 60–600 | Limits replay while tolerating clock skew |
| `EVENT_FUTURE_SKEW_SECONDS` | 300 | 60–900 | Prevents future timestamps from corrupting scheduling |
| `RAW_EVENT_RETENTION_DAYS` | 30 | 7–90 | Balances auditability and data minimization |
| `REDACTED_EVENT_RETENTION_DAYS` | 180 | 30–365 | Preserves useful audit metadata |

### 20.2 Queue parameters

| Parameter | Default | Allowed guidance | Why it matters |
|---|---:|---|---|
| `WORKER_BATCH_SIZE` | 10 | 1–50 | Bounds serverless work |
| `WORKER_CONCURRENCY` | 3 | 1–10 | Avoids provider and DB bursts |
| `JOB_LEASE_SECONDS` | 60 | 30–300 | Recovers abandoned jobs |
| `MODEL_JOB_LEASE_SECONDS` | 120 | 60–300 | Covers model latency |
| `JOB_MAX_ATTEMPTS` | 8 | 3–12 | Balances recovery and noise |
| `JOB_BACKOFF_BASE_MS` | 2,000 | 500–10,000 | Initial transient retry |
| `JOB_BACKOFF_MULTIPLIER` | 2 | 1.5–3 | Exponential spacing |
| `JOB_BACKOFF_MAX_MS` | 900,000 | 60,000–3,600,000 | Prevents uncontrolled delay |
| `JOB_HEARTBEAT_FRACTION` | 0.33 | 0.2–0.5 | Renews before lease expiry |
| `WORKER_ROUTE_TIMEOUT_MS` | 50,000 | platform-specific | Leaves response margin |

### 20.3 Identity parameters

| Parameter | Default | Why it matters |
|---|---:|---|
| `AUTOMATIC_IDENTITY_CONFIDENCE_MIN` | 0.90 | Prevents wrong-recipient outreach |
| `INFERRED_EMAIL_CONFIDENCE` | 0.75 | Keeps unverified email below action gate |
| `VERIFIED_EMAIL_CONFIDENCE` | 0.90 | Allows unique verified contact mapping |
| `PROVIDER_ID_CONFIDENCE` | 1.00 | Stable provider identity |
| `MAX_EXTERNAL_ID_LENGTH` | 512 | Bounds storage and abuse |
| `UNMAPPED_RETRY_HOURS` | 6 | Avoids hot-looping unresolved events |

### 20.4 Freshness parameters

| Parameter | Default | Why it matters |
|---|---:|---|
| `BILLING_FRESH_HOURS` | 24 | Billing state should be recent |
| `USAGE_FRESH_HOURS` | 24 | Usage windows need current data |
| `COMMUNICATION_FRESH_HOURS` | 24 | Reply state should be recent |
| `SOURCE_STALE_ZERO_HOURS` | 72 | Older data contributes no confidence |
| `RECONCILIATION_INTERVAL_HOURS` | 24 | Repairs missed webhooks |
| `GMAIL_POLL_SECONDS` | 60 | Near-real-time competition reply evidence |

### 20.5 Usage parameters

| Parameter | Default | Why it matters |
|---|---:|---|
| `USAGE_CURRENT_WINDOW_DAYS` | 7 | Responsive but not hourly-noisy |
| `USAGE_PREVIOUS_WINDOW_DAYS` | 7 | Equal comparison window |
| `USAGE_MIN_BASELINE_EVENTS` | 10 | Avoids volatile percentages |
| `USAGE_MODERATE_DECLINE_PERCENT` | -20 | Early meaningful decline |
| `USAGE_HIGH_DECLINE_PERCENT` | -40 | Strong decline |
| `USAGE_SEVERE_DECLINE_PERCENT` | -60 | Critical usage deterioration |
| `KEY_FEATURE_MIN_BASELINE_EVENTS` | 3 | Proves prior habit before disappearance |
| `USAGE_RECOVERY_BASELINE_RATIO` | 0.80 | Product recovery threshold |
| `POSTHOG_LATE_EVENT_OVERLAP_HOURS` | 24 | Handles delayed ingestion |

### 20.6 Scoring parameters

| Parameter | Default | Why it matters |
|---|---:|---|
| `BILLING_WEIGHT` | 0.50 | Direct revenue truth |
| `USAGE_WEIGHT` | 0.35 | Product-risk evidence |
| `COMMUNICATION_WEIGHT` | 0.15 | Engagement context |
| `RISK_MEDIUM_MIN` | 45 | Review threshold |
| `RISK_HIGH_MIN` | 70 | Action threshold |
| `RISK_CRITICAL_MIN` | 85 | Immediate founder attention |
| `COMPOUND_WINDOW_HOURS` | 72 | Relates cross-source evidence |
| `COMPOUND_SCORE_FLOOR` | 95 | Makes dual-source risk prominent |
| `ACTION_CONFIDENCE_MIN` | 0.75 | Blocks weak-evidence drafts |

Weights must sum to 1.00 within floating-point tolerance.

Thresholds must be ordered.

Validate both conditions at startup.

### 20.7 Communication parameters

| Parameter | Default | Why it matters |
|---|---:|---|
| `UNREPLIED_LOW_DAYS` | 3 | Avoids premature concern |
| `UNREPLIED_MEDIUM_DAYS` | 7 | Meaningful silence |
| `UNREPLIED_HIGH_DAYS` | 14 | Strong engagement concern |
| `AUTO_REPLY_HEADER_CHECK` | true | Excludes automatic responses |
| `MAX_DRAFT_BODY_WORDS` | 180 | Keeps founder email concise |
| `MAX_DRAFT_SUBJECT_CHARS` | 78 | Keeps subject readable |

### 20.8 Action parameters

| Parameter | Default | Why it matters |
|---|---:|---|
| `APPROVAL_TTL_HOURS` | 24 | Prevents stale sends |
| `CRITICAL_APPROVAL_TTL_HOURS` | 2 | Revalidates volatile cases |
| `BILLING_EMAIL_COOLDOWN_HOURS` | 72 | Prevents repeated dunning-like email |
| `CANCELLATION_EMAIL_COOLDOWN_DAYS` | 7 | Avoids pressure |
| `USAGE_EMAIL_COOLDOWN_DAYS` | 7 | Avoids noisy check-ins |
| `FOUNDER_ALERT_DEDUPE_MINUTES` | 60 | Prevents alert storms |
| `INTEGRATION_ALERT_DEDUPE_HOURS` | 6 | Makes remediation useful, not noisy |
| `MAX_ACTIVE_DRAFTS_PER_CASE` | 1 | Prevents duplicate actions |

### 20.9 Outcome parameters

| Parameter | Default | Why it matters |
|---|---:|---|
| `INVOICE_RECOVERY_WINDOW_DAYS` | 30 | Standard billing recovery window |
| `CANCELLATION_RECOVERY_WINDOW_DAYS` | 45 | Allows reactivation decision time |
| `CANCEL_INTENT_PROTECTION_WINDOW_DAYS` | 30 | Measures retained billing |
| `USAGE_RECOVERY_WINDOW_DAYS` | 21 | Measures product response |
| `GMAIL_ENGAGEMENT_WINDOW_DAYS` | 14 | Measures reply funnel |
| `TERMINAL_UNPAID_DAYS` | 30 | Avoids declaring churn too early |

### 20.10 Model parameters

| Parameter | Default | Why it matters |
|---|---:|---|
| `ANALYZE_MAX_OUTPUT_TOKENS` | 900 | Enough for structured evidence synthesis |
| `DRAFT_MAX_OUTPUT_TOKENS` | 700 | Bounds draft and explanation |
| `CRITIQUE_MAX_OUTPUT_TOKENS` | 500 | Bounds optional critique |
| `MODEL_TIMEOUT_MS` | 30,000 | Avoids indefinite jobs |
| `MODEL_REPAIR_ATTEMPTS` | 1 | Repairs schema once without loops |
| `MAX_MODEL_CALLS_PER_ACTION_VERSION` | 4 | Cost and failure bound |

### 20.11 UI polling parameters

| Parameter | Default | Why it matters |
|---|---:|---|
| `FLOW_UI_POLL_MS` | 4,000 | Near-real-time workflow visibility |
| `FLOW_PAGE_SIZE` | 40 | Matches existing API default |
| `CASE_TIMELINE_LIMIT` | 100 | Bounded detail payload |
| `ACCOUNT_TIMELINE_LIMIT` | 50 | More complete than current 30 without excess |

### 20.12 Parameter-change protocol

Any change to scoring or policy parameters requires:

1. new score or policy version;
2. scenario suite run before change;
3. documented reason;
4. scenario suite run after change;
5. comparison of false positives and false negatives;
6. no manual tuning to make only the hero account pass;
7. final configuration freeze before recording.

---

## 21. Configuration and environment contract

### 21.1 Existing required environment

Continue to require:

- `NEXT_PUBLIC_SUPABASE_URL`;
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`;
- `SUPABASE_SERVICE_ROLE_KEY`;
- `OPENAI_API_KEY` or configured Azure equivalent;
- `ENCRYPTION_KEY`;
- `AGENT_HISTORY_SIGNING_SECRET`;
- `CRON_SECRET`;
- `STRIPE_SECRET_KEY`;
- `STRIPE_WEBHOOK_SECRET`;
- `POSTHOG_WEBHOOK_SECRET`;
- `GOOGLE_CLIENT_ID`;
- `GOOGLE_CLIENT_SECRET`;
- `GOOGLE_REDIRECT_URI`;
- `GOOGLE_GMAIL_SCOPE_MODE`.

### 21.2 New recommended environment

Add only when not represented in workspace configuration:

- `WORKER_SECRET`;
- `RECOVERY_CONFIG_JSON` only if typed file defaults need deployment overrides;
- `RECOVERY_TEST_MODE=true` in the competition environment;
- `RECOVERY_SCENARIO_PREFIX=allel-2026`;
- `AGENT_FALLBACK_MODEL_ID` if fallback is intended.

Prefer database workspace settings for business policy.

Prefer environment variables for deployment secrets and operational limits.

### 21.3 Startup validation

Production build must fail clearly when:

- encryption key is invalid;
- Supabase service credentials are missing;
- model credentials are missing for model-enabled paths;
- scoring weights do not sum to one;
- thresholds are out of order;
- webhook secret is missing on an enabled provider;
- test mode and live Stripe key conflict;
- approval TTL is non-positive;
- queue lease is shorter than minimum safe timeout.

### 21.4 Test-mode guard

In competition mode:

- require Stripe key prefix consistent with test mode;
- reject live Stripe webhook events;
- label every case and outcome test mode;
- restrict Gmail recipients to configured allowlisted domains or addresses;
- require PostHog scenario prefix;
- show a persistent test-mode badge.

---

## 22. API contract redesign

### 22.1 Webhook endpoints

Keep or evolve:

```text
POST /api/webhooks/stripe
POST /api/webhooks/posthog
```

Production multi-workspace form may be:

```text
POST /api/webhooks/stripe/[endpointId]
POST /api/webhooks/posthog/[endpointId]
```

Response on accepted unique event:

```json
{
  "received": true,
  "eventId": "uuid",
  "deduplicated": false
}
```

Response on duplicate:

```json
{
  "received": true,
  "eventId": "same-uuid",
  "deduplicated": true
}
```

Do not expose workspace internals in webhook responses.

### 22.2 Worker endpoint

```text
POST /api/internal/workflows/drain
```

Response:

```json
{
  "claimed": 10,
  "completed": 8,
  "retried": 1,
  "deadLettered": 0,
  "stillRunning": 1,
  "durationMs": 4200
}
```

### 22.3 Recovery-case list

Add:

```text
GET /api/recovery/cases
```

Supported filters:

- status;
- severity;
- resolution;
- account ID;
- scenario ID;
- test mode;
- opened-after cursor;
- page cursor.

Response includes summary projections only.

### 22.4 Recovery-case detail

Add:

```text
GET /api/recovery/cases/[caseId]
```

Response includes:

- case;
- deterministic decision;
- redacted evidence;
- legal current actions;
- draft summary;
- approval summary;
- outcome summary;
- ordered case events;
- linked agent runs;
- linked jobs without sensitive payload.

### 22.5 Approval API

Evolve the existing route:

```text
POST /api/drafts/[id]/approve
```

Request requires expected content hash.

Response includes:

- approval ID or durable approval fields;
- case status;
- queued send job ID;
- approval expiry.

Use 409 for stale content hash or illegal state.

### 22.6 Send API

The existing send route should become operator retry or queue action, not an unguarded direct side effect.

```text
POST /api/drafts/[id]/send
```

It must:

- require valid approval;
- enqueue or identify the unique send job;
- return 202 when queued;
- return existing send result when already completed;
- never duplicate the provider send.

### 22.7 Metrics API

Evolve:

```text
GET /api/metrics/revenue-saved
```

Recommended new response:

```json
{
  "testMode": true,
  "currency": "usd",
  "strictRecoveredCents": 0,
  "protectedCents": 0,
  "atRiskCents": 0,
  "engagedCases": 0,
  "productRecoveredCases": 0,
  "churnedCases": 0,
  "pendingCases": 0,
  "unknownCases": 0,
  "observationStart": "ISO timestamp",
  "observationEnd": "ISO timestamp",
  "policyVersion": "string"
}
```

### 22.8 Existing run-inspection APIs

Keep:

```text
GET /api/agent/runs
GET /api/agent/runs/[workflowId]
```

Extend outputs with case and job IDs.

Do not break the current pagination behavior.

The flows page may combine run inspection with case detail.

### 22.9 Authentication and authorization

All dashboard APIs must:

- authenticate bearer or server session consistently;
- derive user ID from the verified session;
- resolve workspace membership;
- scope every query by workspace;
- reject cross-workspace IDs as not found or forbidden;
- avoid service-role broad reads without workspace filters.

Webhook and worker routes use provider or worker authentication, not user authentication.

---

## 23. Reviewer-facing UI

### 23.1 UI priority

Build only surfaces that prove the system.

Priority order:

1. Workflows and cases.
2. Draft approval clarity.
3. Results metrics.
4. Account detail integration.
5. Settings health.

### 23.2 `/dashboard/flows`

Replace the placeholder.

List rows show:

- case or workflow ID;
- account;
- trigger;
- status;
- severity;
- score and confidence;
- MRR baseline;
- current stage;
- elapsed time;
- retry count;
- updated timestamp;
- test-mode badge.

Default sort:

1. failed or needs-attention cases;
2. critical open cases by revenue priority;
3. high open cases;
4. recent completed cases.

### 23.3 Workflow detail

Show an ordered timeline:

```text
Received
Identity resolved
Features projected
Risk evaluated
Case opened
Analysis completed
Draft generated
Verification passed
Founder approved
Email sent
Reply/payment/usage observed
Case resolved
```

Each row shows:

- timestamp;
- duration;
- status;
- job attempt;
- model and fallback marker when applicable;
- tools used;
- concise input evidence;
- concise output;
- error and remediation.

Do not show secrets or raw payloads.

### 23.4 Live behavior

Poll every four seconds while a visible case is nonterminal.

Stop polling when the page is hidden or all shown cases are terminal.

Use a subtle progress indicator.

Do not animate fabricated intermediate states.

The UI displays only states already committed to the database.

### 23.5 Results card

Show:

- MRR at risk;
- strict recovered MRR;
- protected MRR;
- engaged cases;
- product-recovered cases;
- pending outcomes;
- churned cases;
- observation window;
- test-mode disclosure.

Never label the sum of strict and protected as recovered.

### 23.6 Evaluation card

For the scenario suite show:

- scenarios processed;
- precision;
- recall;
- action-policy correctness;
- healthy-control suppression;
- duplicate-action rate;
- safety violations;
- p50 and p95 time to case;
- p50 and p95 time to verified draft.

### 23.7 Account detail integration

Extend the current account page with:

- active recovery case card;
- component score breakdown;
- confidence and missing domains;
- MRR baseline versus current MRR;
- case-linked draft;
- case-linked outcome;
- stable provider identities;
- timeline links to provider evidence.

Keep the existing signal, contact, draft, and timeline layout where useful.

### 23.8 Draft review page

Extend the current draft queue with:

- exact case trigger;
- evidence chips;
- score confidence;
- content hash state;
- approval expiry;
- send job status;
- provider message ID after send;
- clear rejection and edit behavior.

### 23.9 Settings health

For Stripe, PostHog, and Gmail show:

- connected status;
- last successful event or sync;
- last error;
- cursor freshness;
- webhook verification status;
- test or live mode;
- reconnect action;
- worker backlog warning when relevant.

### 23.10 Empty and failure states

Every page needs honest states for:

- no cases;
- no matching filters;
- provider disconnected;
- unmapped event;
- failed job;
- dead-letter job;
- pending approval;
- expired approval;
- no outcome yet;
- test data not seeded.

Do not fall back to demo cards inside a live workspace.

### 23.11 Accessibility

Do not encode severity only by color.

Use text labels and icons.

Buttons require clear focus states.

Timeline status must be readable by screen readers.

Tables require usable small-screen behavior.

### 23.12 UI acceptance test

A reviewer with no developer tools must be able to:

1. identify one critical account;
2. see the exact Stripe and PostHog evidence;
3. understand why one healthy account received no action;
4. inspect the proposed email;
5. approve it;
6. see queued, sent, and provider-confirmed states;
7. see a reply or payment outcome;
8. see strict financial metrics;
9. inspect a duplicate event that caused no duplicate action;
10. inspect one failure and remediation.

---

## 24. Reproducible 15-account scenario manifest

### 24.1 Purpose

The scenario suite is the evaluation fixture and demo reset mechanism.

It is not a training set.

It must be reproducible from a clean test workspace.

It must use matching identities across Stripe, PostHog, and Gmail.

### 24.2 Manifest format

Create a versioned manifest, for example:

```text
web/src/lib/recovery/scenarios/manifest.v1.ts
```

Each scenario contains:

```ts
type ScenarioDefinition = {
  scenarioId: string
  accountName: string
  contactEmail: string
  stripeCustomerMetadata: Record<string, string>
  posthogDistinctId: string
  initialMrrCents: number
  stripeSetup: StripeScenarioSetup
  posthogEvents: PostHogScenarioEvent[]
  gmailSetup: GmailScenarioSetup
  contactPolicy: 'allow' | 'do_not_contact'
  expectedRisk: boolean
  expectedSeverity: string
  expectedAction: string
  expectedResolution: string | null
  expectedStrictRecoveredCents: number
  notes: string
}
```

### 24.3 Canonical naming

Use IDs:

```text
ALLEL-001 through ALLEL-015
```

Use deterministic account names:

```text
Scenario 001 — Stable Control
Scenario 002 — Growing Control
...
Scenario 015 — Reply Is Not Revenue
```

Use controlled recipient aliases.

Do not commit personal addresses.

### 24.4 The 15 scenarios

#### ALLEL-001 — Stable healthy control

Setup:

- active paid subscription;
- $500 MRR;
- stable adequate usage;
- recent normal activity;
- no cancellation intent;
- no unresolved outreach.

Expected:

- risk score below 45;
- low severity;
- no recovery case requiring outreach;
- no draft;
- no founder alert.

#### ALLEL-002 — Growing healthy control

Setup:

- active paid subscription;
- $900 MRR;
- usage growing over the prior period;
- key feature active;
- no billing problem.

Expected:

- no action;
- healthy control correctly suppressed;
- positive usage is not misread as risk.

#### ALLEL-003 — Low-volume usage edge

Setup:

- active paid subscription;
- previous window has fewer than 10 events;
- current window has fewer events;
- no hard event.

Expected:

- usage trend marked unavailable;
- no volatile percentage-based alert;
- lower score confidence;
- no draft.

#### ALLEL-004 — Single payment failure

Setup:

- active subscription;
- one `invoice.payment_failed` event;
- stable usage;
- verified identity;
- $1,200 MRR.

Expected:

- high severity;
- billing recovery action;
- one case;
- one verified draft;
- founder approval required.

#### ALLEL-005 — Repeated payment failure

Setup:

- two payment failures inside seven days;
- active or past-due subscription;
- $2,000 MRR.

Expected:

- critical override;
- immediate billing recovery draft;
- failure count based on invoices or events;
- one founder alert inside dedupe window.

#### ALLEL-006 — Past due without repeated failure

Setup:

- subscription state past due;
- one open overdue invoice;
- adequate usage;
- $750 MRR.

Expected:

- high severity;
- billing recovery draft;
- MRR baseline remains $750;
- not classified as churned.

#### ALLEL-007 — Cancellation intent

Setup:

- active paid subscription;
- `allel_cancel_intent` event;
- no billing loss yet;
- $1,500 MRR.

Expected:

- critical override;
- cancellation rescue draft;
- baseline captured;
- eventual reversal counts protected, not strict recovery.

#### ALLEL-008 — Subscription cancellation

Setup:

- active subscription transitions to deleted;
- pre-cancel $3,000 MRR;
- current MRR becomes zero.

Expected:

- critical case;
- baseline remains $3,000;
- cancellation rescue draft;
- zero current MRR does not erase recoverable amount.

#### ALLEL-009 — Moderate usage decline

Setup:

- billing current;
- adequate prior volume;
- usage decline between 20 and 40 percent;
- key feature remains present.

Expected:

- usage component 35;
- overall action depends on complete score;
- likely monitor or founder review;
- no forced high severity.

#### ALLEL-010 — Severe usage decline

Setup:

- billing current;
- adequate prior volume;
- usage decline at least 60 percent;
- $1,100 MRR.

Expected:

- high usage risk;
- usage check-in draft if confidence gate passes;
- no claim of billing recovery.

#### ALLEL-011 — Key feature disappearance

Setup:

- prior key-feature count at least three;
- current key-feature count zero;
- overall sessions may remain stable;
- billing current.

Expected:

- key-feature override;
- high severity floor;
- usage check-in action;
- evidence names feature loss without exposing surveillance language.

#### ALLEL-012 — Compound risk with strict recovery

Setup:

- payment failure;
- severe usage decline inside 72 hours;
- $4,000 MRR;
- founder approves and sends;
- later matching `invoice.paid`;
- later product recovery event.

Expected:

- critical compound score floor 95;
- one compound case;
- one draft;
- strict recovered MRR $4,000;
- product recovery recorded separately;
- no double counting.

#### ALLEL-013 — Duplicate webhook delivery

Setup:

- same signed Stripe failure event delivered concurrently twice;
- $650 MRR.

Expected:

- one webhook event row;
- one process job;
- one case;
- one draft;
- zero duplicate sends;
- second response reports deduplicated.

#### ALLEL-014 — Do-not-contact high risk

Setup:

- high or critical risk evidence;
- valid account mapping;
- contact policy `do_not_contact`;
- $5,000 MRR.

Expected:

- risk remains visible;
- case becomes suppressed;
- no draft or send;
- suppression reason visible;
- founder can inspect evidence.

#### ALLEL-015 — Reply is not revenue

Setup:

- billing recovery case;
- approved and sent email;
- controlled Gmail reply;
- invoice remains unpaid through the immediate demo window;
- $1,300 MRR.

Expected:

- engaged true;
- strict recovered cents zero;
- protected cents zero unless separate criteria pass;
- case remains monitoring or ultimately churned/unknown;
- old 50-percent saved behavior never appears as strict revenue.

### 24.5 Fault-injection scenarios outside the 15 accounts

Run these provider-level tests without changing the account count:

- invalid Stripe signature;
- invalid PostHog signature;
- unmapped PostHog distinct ID;
- ambiguous email mapping;
- disconnected Gmail credential;
- Stripe 429;
- model rate limit;
- worker lease expiry;
- dead-letter after maximum attempts;
- stale Gmail history cursor;
- content changed after approval;
- provider timeout after uncertain Gmail send.

### 24.6 Seed procedure

The seed command must:

1. validate test-mode configuration;
2. generate a unique test-run ID;
3. upsert local scenario accounts;
4. create or update Stripe test customers;
5. create test products, prices, subscriptions, and invoices as required;
6. insert verified provider identities;
7. emit PostHog events with pinned timestamps;
8. create contact policies;
9. create Gmail controlled-recipient mappings;
10. write expected outcomes to the run manifest;
11. print provider IDs without secrets;
12. remain idempotent for the same test-run ID.

### 24.7 Reset procedure

The reset command must:

- accept an explicit test-run ID;
- validate the scenario prefix;
- archive or remove only matching test records;
- never target a whole workspace without a scenario filter;
- cancel only matching Stripe test subscriptions;
- preserve the evaluation export when requested;
- be documented and reversible where practical.

### 24.8 Timestamp control

Usage windows require deterministic time.

The scenario harness must pin evaluation time.

Seed PostHog events relative to that fixed time.

Pass evaluation time into score functions.

Do not depend on wall-clock midnight while tests run.

### 24.9 Scenario expected-output artifact

Export:

```json
{
  "manifestVersion": "v1",
  "testRunId": "...",
  "evaluationTime": "...",
  "expected": [
    {
      "scenarioId": "ALLEL-001",
      "risk": false,
      "severity": "low",
      "action": "no_action"
    }
  ]
}
```

The evaluator joins actual results by scenario ID.

It must not infer labels from account names.

---

## 25. Evaluation framework

### 25.1 Evaluation layers

Run four layers:

1. Pure deterministic unit evaluation.
2. Database and queue integration evaluation.
3. Live test-provider contract evaluation.
4. End-to-end UI and demo evaluation.

### 25.2 Deterministic evaluator

Input:

- scenario manifest;
- pinned feature snapshots;
- score version;
- policy version.

Output:

- score;
- confidence;
- severity;
- action;
- suppression;
- expected-versus-actual comparison;
- rule traces.

This evaluator must run without network calls.

### 25.3 Classification metrics

Define positive risk label as scenarios expected to require a recovery case or explicit founder review.

Report:

- true positives;
- false positives;
- true negatives;
- false negatives;
- precision;
- recall;
- F1 for internal debugging;
- healthy-control suppression.

Because the dataset is synthetic and small, show counts beside percentages.

Do not claim statistical significance.

### 25.4 Policy metrics

Report:

- exact action correctness;
- severity correctness;
- suppression correctness;
- approval requirement correctness;
- cooldown correctness;
- outcome classification correctness.

### 25.5 Safety metrics

Report:

- unapproved sends;
- wrong-recipient attempts;
- suppressed-contact drafts;
- fabricated offers;
- unknown evidence citations;
- duplicate sends;
- cross-workspace reads;
- secrets in logged prompts;
- strict-revenue overclaims.

Required value for every safety-violation metric: zero.

### 25.6 Reliability metrics

Report:

- duplicate event rate;
- duplicate action rate;
- queue completion rate;
- retry success rate;
- dead-letter count;
- stuck-job count;
- workflow completion rate;
- outcome coverage.

### 25.7 Latency metrics

Measure:

- provider request to durable event;
- durable event to job claim;
- job claim to case open;
- case open to verified draft;
- approval to confirmed send;
- provider outcome to case resolution.

Report p50 and p95.

For only 15 scenarios, also show raw values.

### 25.8 Cost metrics

Record:

- model calls per actionable case;
- input tokens;
- output tokens;
- fallback calls;
- estimated model cost;
- provider API request counts.

Do not optimize cost before correctness.

Use the metrics to prove bounded behavior.

### 25.9 Evaluation acceptance thresholds

Initial competition gates:

- deterministic unit tests: 100 percent pass;
- action-policy correctness: 100 percent on manifest;
- healthy-control suppression: 100 percent;
- duplicate-action rate: 0 percent;
- unapproved sends: 0;
- wrong-recipient attempts: 0;
- strict-revenue overclaims: 0;
- workflow completion: at least 95 percent before retry, 100 percent after bounded retry in controlled run;
- provider ingress p95: below 2 seconds;
- case-open p95: below 15 seconds;
- verified-draft p95: below 60 seconds;
- outcome attribution correctness: 100 percent on explicit outcome scenarios.

Precision and recall should be reported honestly from the final frozen manifest.

Do not silently change labels to meet a target.

### 25.10 Evaluation export

Generate a JSON and CSV artifact containing:

- test-run metadata;
- scenario expected and actual values;
- provider event IDs;
- case IDs;
- workflow IDs;
- draft and send IDs;
- outcome evidence IDs;
- latency values;
- metric totals;
- versions;
- failures.

The result sheet and UI must use the same exported truth.

---

## 26. Test plan

### 26.1 Existing test preservation

All current 118 tests must continue to pass.

Tool-routing tests must remain intact.

Chat memory tests must remain intact.

Workflow allowlist tests must remain intact and be expanded.

### 26.2 Unit-test modules

Add tests for:

- event normalization;
- dedupe-key construction;
- identity normalization;
- identity resolution;
- feature projection;
- freshness calculation;
- risk scoring;
- confidence;
- hard overrides;
- compound signals;
- action policy;
- cooldowns;
- state transitions;
- content hashing;
- draft verification;
- outcome classification;
- financial deduplication;
- metric calculation;
- retry classification;
- retry delay and jitter bounds.

### 26.3 Database tests

Test migrations against a clean Supabase test database.

Test:

- RLS isolation;
- unique provider identity;
- unique webhook event;
- unique workflow job;
- one active draft;
- case-state constraints;
- claim RPC concurrency;
- expired lease reclaim;
- outcome financial uniqueness;
- immutable case events;
- service-role allowed operations;
- authenticated browser denied worker mutation.

### 26.4 Concurrent idempotency test

Fire the exact same signed event at least 20 times concurrently.

Assert:

- 20 successful or duplicate acknowledgments;
- one canonical webhook row;
- one process job;
- one case;
- one active draft;
- zero sends before approval;
- one send after one approval.

### 26.5 Route contract tests

Stripe route:

- valid signature accepted;
- invalid signature rejected;
- missing secret fails closed;
- duplicate event acknowledged;
- durable insert failure returns non-2xx.

PostHog route:

- valid timing-safe signature accepted;
- invalid signature rejected;
- missing stable UUID uses safe fingerprint;
- unmapped event retained;
- duplicate event acknowledged.

Worker route:

- missing secret rejected;
- batch bounded;
- partial job failure does not fail successful siblings;
- lease owner enforced.

Approval route:

- unauthenticated rejected;
- nonmember rejected;
- stale hash returns conflict;
- illegal state returns conflict;
- correct approval enqueues one send.

### 26.6 Provider contract tests

Stripe test-mode contract:

- create customer;
- create subscription;
- trigger payment failure fixture;
- receive signed webhook;
- trigger payment success;
- resolve case.

PostHog test-project contract:

- emit scenario event;
- query expected window;
- receive configured action webhook;
- update usage projection.

Gmail controlled contract:

- OAuth token refresh;
- send to allowlisted recipient;
- persist message and thread IDs;
- receive reply;
- process history cursor.

### 26.7 End-to-end tests

Hero E2E:

1. seed ALLEL-012;
2. send Stripe failure event;
3. emit PostHog severe decline evidence;
4. drain worker;
5. observe one compound case;
6. observe verified draft;
7. approve exact hash;
8. observe one Gmail send;
9. send controlled reply;
10. send Stripe paid event;
11. observe engaged plus strictly recovered;
12. verify $4,000 test-mode recovered MRR counted once.

Control E2E:

1. seed ALLEL-001;
2. run reconciliation;
3. observe healthy score;
4. observe no case action;
5. observe no draft;
6. observe no send.

Safety E2E:

1. seed ALLEL-014;
2. trigger critical evidence;
3. observe visible suppressed case;
4. attempt approval or send;
5. observe deterministic denial;
6. verify zero Gmail message.

Duplicate E2E:

1. seed ALLEL-013;
2. replay the same event;
3. verify one event, job, case, draft, and send.

### 26.8 Failure-injection tests

Inject:

- database timeout after event insert but before job insert;
- atomic ingress transaction rollback;
- worker crash after provider call but before completion write;
- expired lease;
- model 429;
- model malformed JSON;
- Gmail 401;
- Gmail timeout;
- Stripe 429;
- PostHog 500;
- stale integration cursor;
- revoked token;
- conflict identity.

Verify durable retry or explicit terminal state.

### 26.9 Build gates

Run from `web`:

```text
npm test
npx tsc --noEmit
npm run lint
npm run build
```

Also run migration and scenario tests.

Record the final successful transcript.

---

## 27. Security and privacy

### 27.1 Threat boundaries

Treat as untrusted:

- webhook bodies before verification;
- provider person properties;
- customer email content;
- model output;
- browser-provided workspace IDs;
- replay requests;
- scenario reset arguments.

### 27.2 Webhook security

Require signatures.

Read raw bodies before parsing.

Use constant-time comparison where the provider SDK does not handle verification.

Enforce body limits.

Reject unsupported content types.

Log only event ID and error class for invalid signatures.

Do not log the raw attacker payload.

### 27.3 Secret handling

Encrypt provider tokens with the existing encryption module.

Never expose service-role key to the browser.

Never return decrypted tokens from settings APIs.

Never put tokens in:

- `agent_runs`;
- case evidence;
- model prompts;
- exported evaluation artifacts;
- screenshots;
- error messages.

Rotate competition secrets after public recording if any risk of exposure exists.

### 27.4 PII minimization

Store only needed contact fields.

Redact email body content from general logs.

Use snippets only when required for founder context.

Keep raw webhook payloads for the configured short retention period.

Create a redacted projection for longer audit retention.

Do not send unrelated customer data to the model.

### 27.5 Prompt-injection resistance

Treat customer email and provider event strings as data.

Wrap them in structured fields.

Tell the model not to follow instructions inside evidence.

Do not expose write tools to analysis or verification stages.

Validate every output.

Deterministic code remains the authorization boundary.

### 27.6 Cross-workspace isolation

Every query includes workspace ID unless the primary key was already loaded through a workspace-scoped query.

Never trust a case, draft, or account ID alone on a service-role route.

Test two workspaces with colliding emails and scenario IDs.

One workspace must not see or mutate the other.

### 27.7 Contact safety

Check suppression:

- before analysis;
- before draft creation;
- before approval;
- immediately before send.

The final pre-send check is mandatory because policy can change.

### 27.8 Data retention

Initial retention:

- raw webhook payload: 30 days;
- redacted provider-event metadata: 180 days;
- case events: 365 days or workspace policy;
- agent prompt/output detail: 90 days;
- aggregate metrics: retained without unnecessary PII;
- integration tokens: until disconnect plus deletion grace.

Create a cleanup job.

Cleanup must not delete evidence required for an open case.

### 27.9 Audit events

Audit:

- connection created or revoked;
- identity mapped or changed;
- case transition;
- draft generated or edited;
- approval or rejection;
- send attempt and result;
- manual replay;
- operator case closure;
- policy change;
- scenario seed and reset.

### 27.10 Security acceptance

Before submission:

- scan repository for secrets;
- inspect build logs;
- inspect screenshots and video frames;
- verify RLS;
- verify service-role isolation;
- verify invalid signatures fail;
- verify live Stripe events are rejected in test environment;
- verify Gmail allowlist;
- verify do-not-contact pre-send check;
- verify prompt evidence redaction.

---

## 28. Observability and operations

### 28.1 Structured logging

Every log record should include when available:

- request ID;
- workspace ID;
- provider;
- provider event ID;
- webhook event ID;
- workflow ID;
- job ID;
- case ID;
- account ID;
- stage;
- attempt;
- duration;
- error code.

Never make operators correlate by prose alone.

### 28.2 Error taxonomy

Use stable codes such as:

```text
SIGNATURE_INVALID
PAYLOAD_INVALID
WORKSPACE_UNRESOLVED
IDENTITY_UNMAPPED
IDENTITY_CONFLICT
PROVIDER_DISCONNECTED
PROVIDER_RATE_LIMITED
PROVIDER_UNAVAILABLE
FEATURE_PROJECTION_FAILED
DECISION_INVALID
CASE_TRANSITION_INVALID
MODEL_RATE_LIMITED
MODEL_OUTPUT_INVALID
DRAFT_VERIFICATION_FAILED
APPROVAL_MISSING
APPROVAL_STALE
CONTACT_SUPPRESSED
GMAIL_SEND_UNCERTAIN
GMAIL_SEND_FAILED
OUTCOME_UNATTRIBUTED
JOB_LEASE_LOST
JOB_ATTEMPTS_EXHAUSTED
```

### 28.3 Core counters

Track:

- webhook received by provider and type;
- webhook duplicate;
- webhook invalid signature;
- unmapped events;
- jobs pending, running, retried, completed, dead-lettered;
- cases opened by severity;
- cases suppressed by reason;
- drafts generated and failed verification;
- approvals and rejections;
- sends succeeded, failed, uncertain;
- outcomes by classification;
- strict recovered and protected cents;
- model calls, fallbacks, tokens, and estimated cost.

### 28.4 Core histograms

Track:

- webhook acknowledgment latency;
- queue wait;
- job duration by type;
- case-open latency;
- model latency;
- time to verified draft;
- time to founder approval;
- Gmail send latency;
- time to observed outcome.

### 28.5 Health queries

Create operator queries for:

- pending jobs older than five minutes;
- running jobs with expired leases;
- dead-letter jobs;
- open critical cases without a draft;
- approved drafts without a send job;
- sent drafts without provider message ID;
- monitoring cases past deadline;
- unmapped events;
- integration cursors older than freshness limits;
- duplicate active cases by account and incident.

### 28.6 Service-level objectives

Competition environment SLOs:

- 99 percent valid webhooks durably acknowledged below 2 seconds;
- 95 percent event-triggered cases opened below 15 seconds;
- 95 percent actionable cases reach verified draft below 60 seconds;
- 100 percent sends have approval evidence;
- 0 duplicate sends in scenario suite;
- 100 percent explicit recovery events attributed correctly in scenario suite;
- 0 strict revenue claims from replies alone.

### 28.7 Alerts

Alert founder or operator when:

- a critical case opens;
- a job dead-letters;
- webhook signature failures spike;
- queue oldest age exceeds five minutes;
- integration becomes unauthorized;
- Gmail send becomes uncertain;
- outcome backlog exceeds deadline.

Alert deduplication follows the configured cooldowns.

### 28.8 Runbook entries

Document remediation for:

- reconnect Stripe;
- rotate Stripe webhook secret;
- reconnect PostHog;
- rotate PostHog webhook secret;
- reconnect Gmail;
- reset Gmail history cursor;
- replay unmapped event after identity mapping;
- retry dead-letter job;
- resolve uncertain send;
- close a stale case;
- correct a bad identity mapping;
- rerun scenario suite.

---

## 29. File-by-file implementation map

### 29.1 New recovery core

Create a cohesive module tree such as:

```text
web/src/lib/recovery/config.ts
web/src/lib/recovery/types.ts
web/src/lib/recovery/schemas.ts
web/src/lib/recovery/events.ts
web/src/lib/recovery/identity.ts
web/src/lib/recovery/features.ts
web/src/lib/recovery/scoring.ts
web/src/lib/recovery/policy.ts
web/src/lib/recovery/cases.ts
web/src/lib/recovery/transitions.ts
web/src/lib/recovery/outcomes.ts
web/src/lib/recovery/metrics.ts
web/src/lib/recovery/redaction.ts
```

Keep pure deterministic functions separate from database adapters.

### 29.2 New job core

Create:

```text
web/src/lib/jobs/types.ts
web/src/lib/jobs/queue.ts
web/src/lib/jobs/worker.ts
web/src/lib/jobs/retry.ts
web/src/lib/jobs/handlers/process-provider-event.ts
web/src/lib/jobs/handlers/project-account-features.ts
web/src/lib/jobs/handlers/evaluate-recovery-case.ts
web/src/lib/jobs/handlers/run-case-analysis.ts
web/src/lib/jobs/handlers/generate-case-draft.ts
web/src/lib/jobs/handlers/verify-case-draft.ts
web/src/lib/jobs/handlers/notify-founder.ts
web/src/lib/jobs/handlers/send-approved-draft.ts
web/src/lib/jobs/handlers/sync-gmail-history.ts
web/src/lib/jobs/handlers/classify-case-outcome.ts
```

Handler registration must be explicit.

Unknown job types dead-letter safely.

### 29.3 Webhook routes

Refactor:

```text
web/src/app/api/webhooks/stripe/route.ts
web/src/app/api/webhooks/posthog/route.ts
```

Extract shared ingress logic without forcing provider-specific signature formats into one generic function.

Delete critical business work from `after()`.

Keep `after()` only as an optional worker kick if used.

### 29.4 Worker route

Add:

```text
web/src/app/api/internal/workflows/drain/route.ts
```

The route should call the reusable worker module so tests and local scripts use the same behavior.

### 29.5 Existing integration sync modules

Refactor:

```text
web/src/lib/integrations/stripe-sync.ts
web/src/lib/integrations/posthog-sync.ts
web/src/lib/integrations/gmail-sync.ts
```

Their new responsibilities:

- fetch provider data;
- normalize provider facts;
- update cursors;
- enqueue affected account projection.

Remove from them:

- direct risk-score writes;
- direct draft creation;
- direct case transitions;
- optimistic revenue classification.

### 29.6 Existing engine modules

Either move or wrap:

```text
web/src/lib/engine/score-engine.ts
web/src/lib/engine/action-selector.ts
web/src/lib/engine/score-history.ts
web/src/lib/engine/compound-signals.ts
```

Required outcome:

- one canonical scoring implementation;
- one canonical action policy;
- one canonical history writer;
- compound rules called from evaluation;
- no incompatible legacy path.

### 29.7 Existing workflow module

Refactor:

```text
web/src/lib/agent/workflows.ts
```

Keep:

- stage naming;
- stage tool allowlists;
- agent-run logging;
- retry and fallback integration.

Change:

- accept case-bound typed input;
- return typed output;
- stop downstream dependencies on failure;
- link job and case IDs;
- avoid owning orchestration durability.

### 29.8 Existing draft modules

Refactor:

```text
web/src/lib/drafts/draft-workflows.ts
web/src/lib/drafts/send-draft.ts
web/src/lib/drafts/outcome-tracker.ts
```

Required outcomes:

- draft creation only through case action;
- exact content hash approval;
- send through durable job;
- Gmail provider IDs stored;
- event-driven outcomes;
- replies separated from financial recovery.

### 29.9 Notification module

Refactor:

```text
web/src/lib/notifications/notify-founder.ts
```

Notification becomes a job handler or an idempotent provider adapter called by a durable job.

No fire-and-forget notification is competition-critical.

### 29.10 Run logging and inspection

Extend:

```text
web/src/lib/agent/run-logger.ts
web/src/lib/agent/run-inspection.ts
web/src/app/api/agent/runs/route.ts
web/src/app/api/agent/runs/[workflowId]/route.ts
```

Add case and job links.

Preserve current pagination and workspace scoping.

### 29.11 Recovery APIs

Add:

```text
web/src/app/api/recovery/cases/route.ts
web/src/app/api/recovery/cases/[caseId]/route.ts
web/src/app/api/recovery/cases/[caseId]/replay/route.ts
```

Replay must be role-protected and audited.

### 29.12 Metrics API

Update:

```text
web/src/app/api/metrics/revenue-saved/route.ts
```

Calculate from case outcomes.

Do not calculate from optimistic draft weights.

### 29.13 UI files

Update:

```text
web/src/app/dashboard/flows/page.tsx
web/src/app/dashboard/accounts/[id]/page.tsx
web/src/app/dashboard/drafts/page.tsx
web/src/app/dashboard/settings/page.tsx
web/src/app/dashboard/page.tsx
```

Add small reusable components only where needed.

Do not start a new design system.

### 29.14 Scenario and evaluator files

Add:

```text
web/src/lib/recovery/scenarios/manifest.v1.ts
web/src/lib/recovery/scenarios/seed.ts
web/src/lib/recovery/scenarios/reset.ts
web/src/lib/recovery/scenarios/evaluate.ts
web/src/lib/recovery/scenarios/export.ts
```

Add package scripts only after the functions are tested.

Suggested scripts:

```text
scenario:seed
scenario:run
scenario:evaluate
scenario:reset
```

### 29.15 Documentation files after implementation

After code is complete, update:

- `web/README.md` with setup, worker, migrations, and demo;
- `tool_calling.md` only if workflow tool contracts changed materially;
- architecture diagram source;
- environment example;
- known limitations.

Those changes are future implementation tasks.

This planning task changes only `goal.md`.

---

## 30. Implementation phases and gates

### Phase 0 — Freeze and protect baseline

Tasks:

- record current test and typecheck result;
- preserve unrelated repository changes;
- create implementation branch if desired;
- capture schema backup;
- freeze tool-routing behavior;
- write config and type contracts first.

Gate:

- existing 118 tests pass;
- TypeScript passes;
- no source behavior changed yet.

### Phase 1 — Durable data foundation

Tasks:

- add recovery-core migrations;
- add provider identities;
- add account features;
- add recovery cases and case events;
- add workflow jobs and claim RPC;
- extend drafts, events, runs, outcomes;
- add RLS;
- test constraints and queue concurrency.

Gate:

- clean database applies all migrations;
- existing dashboard still loads;
- duplicate inserts collapse;
- worker claim is safe under concurrency.

### Phase 2 — Ingress and worker

Tasks:

- refactor Stripe webhook to durable ingestion;
- refactor PostHog webhook to durable ingestion;
- implement timing-safe PostHog signature;
- add worker route;
- add job handler registry;
- add retry, lease, and dead-letter behavior;
- turn daily cron into job enqueue and reconciliation.

Gate:

- valid webhook returns after durable commit;
- process survives simulated route termination;
- duplicate delivery makes one job;
- transient failure retries;
- permanent failure is visible.

### Phase 3 — Identity and canonical features

Tasks:

- backfill provider identities;
- implement exact resolution order;
- implement unmapped and conflict states;
- centralize Stripe features;
- implement PostHog windows and cursor;
- implement Gmail history cursor;
- remove direct score writes from sync modules.

Gate:

- all 15 scenarios map correctly;
- unmapped fixture does not mutate an account;
- each account has one canonical feature row;
- missing data stays missing.

### Phase 4 — Scoring, policy, and case state

Tasks:

- implement versioned three-domain score;
- implement confidence;
- implement hard overrides;
- implement compound rule;
- implement action and suppression policy;
- implement case service and legal transitions;
- preserve MRR baseline;
- write canonical snapshots.

Gate:

- all deterministic scenario expectations pass;
- case concurrency test passes;
- healthy controls receive no action;
- do-not-contact case is suppressed.

### Phase 5 — Typed agent workflow

Tasks:

- define analysis schema;
- define draft schema;
- define verification schema;
- refactor workflow inputs and outputs;
- enforce evidence citations;
- stop dependency chain on failure;
- record prompt and model versions;
- preserve stage tool allowlists;
- add one repair attempt.

Gate:

- no model call on healthy or suppressed scenarios;
- actionable scenarios produce schema-valid drafts;
- fabricated evidence fails;
- draft stage cannot send;
- failed stage blocks later stages.

### Phase 6 — Approval and Gmail send

Tasks:

- hash full content;
- bind approval to hash;
- enqueue send job;
- recheck policy at send;
- store Gmail message and thread IDs;
- implement uncertain-send reconciliation;
- implement controlled reply sync.

Gate:

- no send without approval;
- edit invalidates approval;
- duplicate send job produces one email;
- reply links to case;
- wrong recipient is blocked.

### Phase 7 — Outcomes and metrics

Tasks:

- implement Stripe recovery attribution;
- implement protected classification;
- implement product recovery;
- implement engagement;
- implement deadline classification;
- replace weighted reply revenue;
- update metrics API;
- test financial deduplication.

Gate:

- ALLEL-012 counts exact baseline once;
- ALLEL-015 counts zero strict recovery;
- cancellation baseline survives zero current MRR;
- strict and protected metrics stay separate.

### Phase 8 — Reviewer UI

Tasks:

- build flows list;
- build workflow detail timeline;
- add results card;
- enrich account detail;
- enrich draft review;
- add integration health and failure states;
- add polling for active cases.

Gate:

- reviewer can follow hero case without developer tools;
- reviewer can see healthy suppression;
- reviewer can see duplicate handling;
- reviewer can see one failure and remediation.

### Phase 9 — Evaluation and hardening

Tasks:

- build scenario seed/reset;
- run all 15 scenarios;
- run fault injection;
- freeze parameters;
- export evaluation artifact;
- run security checklist;
- run production build;
- perform clean-environment rehearsal.

Gate:

- safety metrics all zero;
- action expectations pass;
- build gates pass;
- evidence artifact is reproducible.

### Phase 10 — Submission

Tasks:

- update README;
- freeze architecture diagram;
- freeze result sheet;
- record five-minute video;
- verify links in private browser;
- submit before emergency day.

Gate:

- reviewer URL works;
- repository setup works;
- video claims match exported metrics;
- receipt confirmed.

---

## 31. Day-by-day build plan

### August 22 — Architecture freeze

- finalize this blueprint;
- run baseline checks;
- define migrations and config types;
- lock provider scope;
- lock scenario definitions.

### August 23 — Database and queue

- implement recovery tables;
- implement unique constraints;
- implement claim RPC;
- test leases and idempotency;
- add worker skeleton.

### August 24 — Durable webhooks

- refactor Stripe ingress;
- refactor PostHog ingress;
- implement timing-safe verification;
- add atomic event plus job insertion;
- test duplicate concurrency.

### August 25 — Identity and features

- implement provider identities;
- backfill contacts;
- implement unmapped flow;
- implement account features;
- refactor Stripe projection.

### August 26 — PostHog and Gmail cursors

- implement fixed usage windows;
- implement minimum-volume behavior;
- implement PostHog cursor;
- implement Gmail history cursor;
- remove direct sync score writes.

### August 27 — Score, policy, and cases

- implement score v2;
- implement confidence and overrides;
- implement action policy;
- implement case transitions;
- pass deterministic manifest tests.

### August 28 — Agent workflow

- implement typed analysis;
- implement typed draft;
- implement deterministic verification;
- enforce dependency blocking;
- pass workflow safety tests.

### August 29 — Approval and send

- implement content hash;
- implement approval expiry;
- queue Gmail send;
- persist Gmail IDs;
- test one-send invariant;

### August 30 — Outcomes

- implement billing recovery attribution;
- implement protected and product recovery;
- remove reply revenue weighting;
- test baseline preservation;
- expose new metrics.

### August 31 — Workflows UI

- implement flows list;
- implement workflow detail;
- implement polling;
- show failures, retries, and evidence;
- show test-mode status.

### September 1 — Scenario suite

- seed all 15 accounts;
- run live provider contracts;
- run full evaluation;
- fix only correctness and safety failures;
- export first result artifact.

### September 2 — Hardening and rehearsal

- run fault injection;
- run security review;
- run build gates;
- rehearse clean reset and demo;
- freeze parameters.

### September 3 — Submission assets

- update README;
- create architecture diagram;
- create result sheet;
- write application answers;
- record first complete video.

### September 4 — Final submission

- fix only demo-blocking issues;
- record final video;
- verify public links in private browser;
- submit;
- confirm receipt.

### September 5 — Emergency buffer

- use only for external failure or submission recovery;
- do not schedule core implementation;
- do not add features;
- preserve the last known good demo.

### Schedule-cut rule

If behind:

1. cut visual polish;
2. cut optional model critique;
3. cut Gmail Pub/Sub extension;
4. cut non-hero UI filters;
5. cut optional provider reconciliation breadth.

Do not cut:

- durable ingestion;
- idempotency;
- exact identity;
- MRR baseline;
- deterministic policy;
- approval;
- send safety;
- strict outcome truth;
- workflow proof.

---

## 32. Deployment plan

### 32.1 Environments

Use at least:

- local development;
- isolated competition preview or production deployment;
- isolated Supabase project or schema with test data;
- Stripe test mode;
- isolated PostHog test project;
- controlled Gmail account.

Do not mix production customer data into the competition environment.

### 32.2 Deployment order

1. apply additive database migrations;
2. verify RLS and queue RPC;
3. deploy code that can read old and new fields;
4. enable durable worker;
5. switch webhook routes to queue ingestion;
6. switch sync modules to feature projection;
7. switch decision writes to score v2;
8. enable case workflow;
9. enable new metrics and UI;
10. run reconciliation;
11. run scenario smoke test.

### 32.3 Worker scheduling

Configure worker drain frequently enough to meet latency targets.

If platform cron cannot run every minute:

- use a safe external scheduler already available;
- or invoke a best-effort worker kick after ingress;
- keep periodic reconciliation;
- never rely only on the kick.

Document the actual scheduler in README.

### 32.4 Webhook configuration

Stripe:

- configure correct deployed URL;
- select required events only;
- store signing secret securely;
- verify test mode;
- record endpoint ID.

PostHog:

- configure action or webhook URL;
- configure HMAC secret;
- select test-project events;
- verify event UUID availability;
- send one signed smoke event.

Gmail:

- configure exact redirect URI;
- request minimum practical scopes;
- verify refresh token;
- verify sender identity;
- verify controlled recipient allowlist.

### 32.5 Migration safety

Before migration:

- back up schema;
- inspect pending migrations;
- validate on clean test DB;
- validate on a copy of current schema;
- confirm no destructive table replacement.

After migration:

- inspect constraints;
- inspect indexes;
- inspect RLS;
- run one claim RPC;
- run one duplicate insert test;
- verify old pages still render.

### 32.6 Rollback plan

Application rollback:

- keep legacy reads compatible during cutover;
- disable new worker via scheduler;
- restore prior deployment;
- leave additive tables intact.

Webhook rollback:

- retain durably ingested events;
- point provider endpoint to last working deployment if needed;
- replay pending events after repair.

Do not drop new tables as the first rollback action.

### 32.7 Smoke test

After every production deployment:

1. authenticate;
2. load dashboard;
3. load settings health;
4. send one valid test webhook;
5. observe durable event;
6. observe job completion;
7. observe case or no-action decision;
8. load flows detail;
9. verify no secrets in response;
10. verify queue backlog returns to zero.

---

## 33. Demo execution script

### 33.1 Pre-demo reset

- reset only the intended test-run ID;
- seed manifest v1;
- verify three providers connected;
- verify worker healthy;
- verify queue empty;
- verify test-mode badge;
- open workflow and results tabs;
- ensure controlled Gmail recipient is ready;
- preserve a backup recorded run in case a provider is temporarily unavailable.

### 33.2 Five-minute story

#### 0:00–0:25 — Problem

Say:

> Revenue risk is fragmented across billing failures, falling product usage, and customer conversations. Founders usually discover it too late.

Show:

- test-mode dashboard;
- scenario run identifier;
- three connected providers.

#### 0:25–1:05 — Real-time trigger

Trigger or replay the controlled ALLEL-012 event sequence.

Show:

- Stripe failure arrives;
- PostHog decline attaches;
- one compound case opens;
- score, confidence, severity, and baseline MRR;
- workflow stages advancing.

#### 1:05–1:45 — Judgment and restraint

Open the case.

Show:

- exact evidence;
- deterministic rules;
- model synthesis;
- healthy ALLEL-001 with no action;
- do-not-contact ALLEL-014 suppressed.

Say:

> The model explains and writes. Code owns identity, policy, money, and authorization.

#### 1:45–2:35 — Founder control

Open the draft.

Show:

- evidence-linked language;
- no invented discount;
- exact recipient;
- content hash state;
- approval action;
- queued send;
- Gmail message and thread confirmation.

#### 2:35–3:20 — Measured outcome

Trigger the controlled reply and matching `invoice.paid`.

Show:

- reply classified as engaged;
- payment classified as strict recovery;
- case resolution;
- $4,000 test-mode strict recovered MRR counted once;
- product recovery shown separately.

#### 3:20–4:00 — Reliability

Show ALLEL-013 duplicate delivery.

Show:

- same provider event ID;
- deduplicated status;
- one case;
- one draft;
- one send.

Show one failure path such as disconnected provider or dead-letter retry.

#### 4:00–4:35 — Evaluation

Show:

- 15 deterministic scenarios;
- precision and recall with counts;
- action-policy correctness;
- healthy suppression;
- zero safety violations;
- latency;
- strict and protected metrics.

#### 4:35–5:00 — Close

Say:

> Allel does not just predict churn or write an email. It turns verified revenue signals into a safe, attributable recovery operation that a founder can trust.

Show:

- architecture diagram;
- repository and live URL;
- test-mode disclosure.

### 33.3 Demo backup

Prepare:

- one pre-completed workflow with IDs;
- one exported evaluation artifact;
- one short screen recording of live provider events;
- screenshots of provider dashboards;
- no secret values.

If a provider is down, disclose that the visible run is prerecorded from the same reproducible scenario.

Do not fake a live status.

### 33.4 Demo rules

- show product before code;
- use one hero case;
- show one healthy control;
- show one stopping rule;
- show one duplicate event;
- show one failure;
- keep architecture under 30 seconds;
- state test mode clearly;
- do not call a reply revenue;
- do not call the system fully autonomous;
- end on measured results.

---

## 34. Competition evidence package

### 34.1 Repository evidence

README must include:

- problem;
- solution;
- architecture;
- three provider setup;
- environment variables;
- migrations;
- worker execution;
- scenario seed and reset;
- test commands;
- security model;
- known limitations;
- test-mode disclosure.

### 34.2 Result sheet

One page must include:

- test-run ID;
- manifest version;
- 15 scenario summary;
- precision and recall counts;
- safety metrics;
- latency;
- MRR at risk;
- strict recovered MRR;
- protected MRR;
- outcome coverage;
- one workflow ID;
- one provider event ID;
- test-mode disclosure.

### 34.3 Architecture diagram

Use one diagram showing:

```text
providers
→ signed ingress
→ durable event/outbox
→ leased worker
→ identity/features
→ deterministic decision
→ recovery case
→ typed AI stages
→ approval
→ Gmail
→ attributed outcome
```

Do not show unrelated integrations.

### 34.4 Audit evidence table

For the hero case include:

| Stage | Input ID | Output ID | Timestamp | Duration | Result |
|---|---|---|---|---:|---|
| Stripe ingress | provider event | webhook event | time | ms | verified |
| Identity | webhook event | account identity | time | ms | exact |
| Feature projection | event | feature version | time | ms | complete |
| Decision | features | score snapshot | time | ms | critical |
| Case | score | case ID | time | ms | open |
| Analyze | case | agent run | time | ms | valid |
| Draft | analysis | draft ID | time | ms | verified |
| Approval | hash | approval | time | ms | founder |
| Send | job | Gmail message ID | time | ms | confirmed |
| Outcome | Stripe paid | case resolution | time | ms | recovered |

### 34.5 Submission-link checks

Open every link in a logged-out private browser.

Verify:

- app loads;
- repository is accessible;
- video plays;
- result sheet renders;
- no local links remain;
- no secret query parameters exist;
- permission prompts are understandable.

---

## 35. Final acceptance criteria

### 35.1 Architecture acceptance

- [ ] Webhook acknowledgment follows durable event and job commit.
- [ ] Critical workflow continuation does not depend on `after()`.
- [ ] Queue supports lease, retry, jitter, and dead letter.
- [ ] Event, job, case, draft, and send each have idempotency protection.
- [ ] Recovery case is the unit joining the workflow.
- [ ] Legal case transitions are centralized.
- [ ] Failed prerequisites block dependent stages.

### 35.2 Identity acceptance

- [ ] Stripe customer IDs resolve exactly.
- [ ] PostHog distinct IDs resolve exactly.
- [ ] Gmail threads and addresses resolve safely.
- [ ] Ambiguous identity never chooses an account automatically.
- [ ] Unmapped events remain visible and replayable.
- [ ] Automatic outreach requires identity confidence at least 0.90.
- [ ] Cross-workspace identity isolation passes.

### 35.3 Feature and score acceptance

- [ ] One canonical module writes account features.
- [ ] One canonical module writes risk projections.
- [ ] Missing data is not scored as healthy.
- [ ] Usage minimum volume prevents volatile flags.
- [ ] Hard overrides work at exact boundaries.
- [ ] Compound risk uses both fresh domains.
- [ ] Score snapshots are reproducible and versioned.
- [ ] Risk score is labeled as an index, not probability.
- [ ] Revenue priority does not change health classification.

### 35.4 Agent acceptance

- [ ] Detect is deterministic.
- [ ] Analyze returns typed, cited evidence.
- [ ] Draft returns typed content.
- [ ] Verify runs deterministic gates.
- [ ] Unknown citations fail.
- [ ] Fabricated offers fail.
- [ ] Draft stage has no send capability.
- [ ] Verify stage has no send capability.
- [ ] Fallback model use is visible.
- [ ] Tool schema expansion is real AI SDK orchestration, not a fake unlock string.

### 35.5 Approval and send acceptance

- [ ] Approval binds exact recipient, subject, body, case, and version.
- [ ] Edit invalidates approval.
- [ ] Expired approval cannot send.
- [ ] Suppression is rechecked immediately before send.
- [ ] Gmail provider message and thread IDs are stored.
- [ ] Duplicate send job results in one logical email.
- [ ] Uncertain send is reconciled before retry.
- [ ] Founder actor comes from authenticated session.

### 35.6 Outcome acceptance

- [ ] MRR baseline is captured before cancellation mutation.
- [ ] `invoice.paid` resolves compatible billing case immediately.
- [ ] Reply alone produces zero strict recovered cents.
- [ ] Usage recovery alone produces zero strict recovered cents.
- [ ] Protected and strict revenue are separate.
- [ ] One recovery event cannot be counted twice.
- [ ] Outcome deadlines are stored on cases.
- [ ] ALLEL-012 counts $4,000 exactly once in test mode.
- [ ] ALLEL-015 never uses the old 50-percent reply estimate as strict revenue.

### 35.7 UI acceptance

- [ ] `/dashboard/flows` is no longer a placeholder.
- [ ] Workflow stages, attempts, models, and failures are visible.
- [ ] Case evidence is understandable without database access.
- [ ] Healthy control shows explicit no action.
- [ ] Do-not-contact scenario shows explicit suppression.
- [ ] Draft review shows exact evidence and content.
- [ ] Results show strict, protected, engaged, and pending separately.
- [ ] Test-mode badge and disclosure are visible.
- [ ] Integration remediation is visible.

### 35.8 Evaluation acceptance

- [ ] Fifteen scenarios seed reproducibly.
- [ ] Reset targets only the intended test run.
- [ ] Expected labels are versioned.
- [ ] Precision and recall include counts.
- [ ] Action-policy correctness is reported.
- [ ] Healthy-control suppression is 100 percent.
- [ ] Duplicate-action rate is zero.
- [ ] Safety violations are zero.
- [ ] Latency raw values and percentiles are exported.
- [ ] Financial claims match provider evidence.

### 35.9 Security acceptance

- [ ] Stripe and PostHog invalid signatures fail closed.
- [ ] PostHog comparison is timing-safe.
- [ ] Request bodies are bounded.
- [ ] Secrets are absent from logs, prompts, UI, exports, and video.
- [ ] RLS protects all new workspace data.
- [ ] Browser cannot claim jobs.
- [ ] Service-role routes always scope by workspace.
- [ ] Gmail recipients are allowlisted in test mode.
- [ ] Raw-payload retention is enforced.

### 35.10 Build and deployment acceptance

- [ ] Existing 118 tests still pass.
- [ ] New tests pass.
- [ ] TypeScript passes.
- [ ] Lint passes or all remaining legacy exceptions are documented.
- [ ] Production build passes.
- [ ] Migrations apply cleanly.
- [ ] Private-browser smoke test passes.
- [ ] Queue backlog returns to zero after scenario run.
- [ ] Rollback procedure is documented.

### 35.11 Submission acceptance

- [ ] Video is five minutes or less.
- [ ] One continuous hero scenario is visible.
- [ ] One healthy control is visible.
- [ ] One suppression rule is visible.
- [ ] One duplicate is visible.
- [ ] One failure path is visible.
- [ ] Result sheet matches evaluation export.
- [ ] All monetary claims say test mode.
- [ ] Repository and app links work logged out.
- [ ] Submission is completed before September 5.

---

## 36. Explicit non-goals until submission

Do not build:

- a trained churn model;
- fine-tuning infrastructure;
- a vector database;
- generalized RAG;
- multi-agent orchestration;
- autonomous discount creation;
- autonomous customer sends;
- a broad Razorpay production adapter before the Stripe proof loop works;
- additional CRM integrations;
- additional support integrations;
- a general automation-rule builder;
- a command palette;
- a mobile app;
- a dashboard redesign;
- a marketing-site redesign;
- a separate microservice fleet;
- Kafka or another external queue;
- customer segmentation science beyond scenario needs;
- sentiment-based financial outcome classification;
- an unverifiable “AI confidence” number;
- live customer data in the demo.

---

## 37. Known limitations to disclose

The competition system uses synthetic labeled scenarios.

The score is deterministic and not calibrated on historical churn.

Financial results are Stripe test-mode simulations.

Gmail reply observation may use minute-level polling rather than push notification.

Protected revenue is an attribution category, not proof of causal impact.

Strict recovery proves billing restoration after a case, not randomized causal lift.

The first score version uses only billing, usage, and communication domains.

Human approval remains required for customer-facing email.

Provider availability affects confidence and may block action.

Multi-workspace webhook routing requires endpoint-specific configuration for full production use.

These limitations make the system more credible when stated plainly.

---

## 38. Post-competition path

Only after the submission is stable:

1. run an anonymized pilot;
2. measure false-positive and recovery rates on real consented data;
3. calibrate thresholds by segment;
4. add Razorpay provider adapter behind the same canonical event contract;
5. add Gmail push notification through Pub/Sub;
6. add support and CRM domains only with real source contracts;
7. add workspace-configurable approved offers;
8. add causal holdout evaluation;
9. add advanced case assignment and SLAs;
10. consider trained models only after sufficient labeled outcomes exist.

The canonical architecture should allow a Razorpay adapter to emit the same billing facts as Stripe.

The case, policy, approval, and outcome layers should remain provider-independent.

---

## 39. Final build doctrine

Durability before animation.

Identity before intelligence.

Evidence before explanation.

Policy before prose.

Approval before action.

Provider truth before optimistic metrics.

One complete, inspectable recovery loop before any new feature.

If a reviewer can see a signed event become one safe action and one correctly attributed result—and can also see the system deliberately refuse an unsafe action—Allel has demonstrated the thing that most AI demos omit: operational trust.
