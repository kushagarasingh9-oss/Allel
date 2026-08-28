-- Migration: 20260822_recovery_core.sql
-- Description: Recovery core tables, identity mapping, canonical features, cases, audit events, contact policies, cursors, and schema alterations.

-- 1. provider_identities
create table if not exists provider_identities (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  customer_account_id uuid not null references customer_accounts(id) on delete cascade,
  provider text not null,
  identity_type text not null,
  external_id text not null,
  normalized_external_id text not null,
  is_primary boolean not null default false,
  verification_status text not null default 'verified',
  source text not null,
  metadata jsonb not null default '{}'::jsonb,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint provider_identities_provider_check check (provider in ('stripe', 'posthog', 'gmail')),
  constraint provider_identities_identity_type_check check (identity_type in ('customer_id', 'subscription_id', 'invoice_customer_id', 'distinct_id', 'person_email', 'email_address', 'gmail_thread_id')),
  constraint provider_identities_verification_status_check check (verification_status in ('verified', 'inferred', 'conflict', 'revoked')),
  constraint provider_identities_uniq_key unique (workspace_id, provider, identity_type, normalized_external_id)
);

create index if not exists idx_provider_identities_account on provider_identities (workspace_id, customer_account_id);
create index if not exists idx_provider_identities_lookup on provider_identities (workspace_id, provider, normalized_external_id);
create index if not exists idx_provider_identities_conflicts on provider_identities (workspace_id, verification_status) where verification_status = 'conflict';

-- 2. account_features
create table if not exists account_features (
  workspace_id uuid not null references workspaces(id) on delete cascade,
  customer_account_id uuid primary key references customer_accounts(id) on delete cascade,
  billing_available boolean not null default false,
  billing_status text,
  stripe_customer_id text,
  stripe_subscription_id text,
  current_mrr_cents integer,
  pre_cancel_mrr_cents integer,
  last_invoice_id text,
  last_invoice_status text,
  failed_payment_count_7d integer not null default 0,
  failed_payment_count_30d integer not null default 0,
  last_payment_failed_at timestamptz,
  last_payment_succeeded_at timestamptz,
  cancel_at_period_end boolean,
  cancelled_at timestamptz,
  usage_available boolean not null default false,
  usage_current_7d integer,
  usage_previous_7d integer,
  usage_delta_percent numeric,
  key_feature_current_7d integer,
  key_feature_previous_7d integer,
  key_feature_missing boolean,
  cancel_intent_at timestamptz,
  last_product_activity_at timestamptz,
  communication_available boolean not null default false,
  last_outbound_at timestamptz,
  last_inbound_at timestamptz,
  unreplied_outbound_count integer not null default 0,
  gmail_thread_id text,
  billing_fresh_at timestamptz,
  usage_fresh_at timestamptz,
  communication_fresh_at timestamptz,
  source_watermarks jsonb not null default '{}'::jsonb,
  feature_version text not null default 'features-v1-2026-08',
  computed_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint account_features_mrr_nonneg check (current_mrr_cents is null or current_mrr_cents >= 0),
  constraint account_features_pre_cancel_mrr_nonneg check (pre_cancel_mrr_cents is null or pre_cancel_mrr_cents >= 0),
  constraint account_features_failed_counts_nonneg check (failed_payment_count_7d >= 0 and failed_payment_count_30d >= 0 and unreplied_outbound_count >= 0)
);

create index if not exists idx_account_features_workspace on account_features (workspace_id);

-- 3. recovery_cases
create table if not exists recovery_cases (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  customer_account_id uuid not null references customer_accounts(id) on delete cascade,
  case_key text not null,
  trigger_provider text not null,
  trigger_event_type text not null,
  trigger_event_id uuid references webhook_events(id) on delete set null,
  scenario_id text,
  status text not null,
  resolution text,
  severity text not null,
  risk_score integer not null,
  score_confidence numeric not null,
  revenue_priority numeric not null,
  mrr_baseline_cents integer not null,
  currency text not null default 'usd',
  score_version text not null,
  policy_version text not null,
  feature_version text not null,
  action_type text not null,
  action_reason text not null,
  suppression_reason text,
  root_cause_summary text,
  evidence_snapshot jsonb not null default '[]'::jsonb,
  opened_at timestamptz not null default now(),
  last_signal_at timestamptz not null default now(),
  awaiting_approval_at timestamptz,
  approved_at timestamptz,
  sent_at timestamptz,
  monitoring_started_at timestamptz,
  resolved_at timestamptz,
  outcome_deadline_at timestamptz,
  failed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint recovery_cases_status_check check (status in ('open', 'analyzing', 'action_proposed', 'awaiting_approval', 'approved', 'sent', 'monitoring', 'resolved', 'suppressed', 'failed')),
  constraint recovery_cases_resolution_check check (resolution is null or resolution in ('strictly_recovered', 'protected', 'product_recovered', 'engaged', 'churned', 'no_action_required', 'suppressed', 'expired_unknown', 'duplicate', 'operator_closed')),
  constraint recovery_cases_risk_score_bounds check (risk_score >= 0 and risk_score <= 100),
  constraint recovery_cases_score_confidence_bounds check (score_confidence >= 0 and score_confidence <= 1),
  constraint recovery_cases_mrr_nonneg check (mrr_baseline_cents >= 0),
  constraint recovery_cases_resolved_req check ((status = 'resolved' and resolved_at is not null and resolution is not null) or (status <> 'resolved')),
  constraint recovery_cases_suppressed_req check ((status = 'suppressed' and suppression_reason is not null) or (status <> 'suppressed')),
  constraint recovery_cases_sent_req check ((status in ('sent', 'monitoring') and sent_at is not null) or (status not in ('sent', 'monitoring'))),
  constraint recovery_cases_uniq_key unique (workspace_id, case_key)
);

create index if not exists idx_recovery_cases_status on recovery_cases (workspace_id, status, severity, updated_at desc);
create index if not exists idx_recovery_cases_account on recovery_cases (workspace_id, customer_account_id, opened_at desc);
create index if not exists idx_recovery_cases_resolution on recovery_cases (workspace_id, resolution, resolved_at desc);
create index if not exists idx_recovery_cases_scenario on recovery_cases (workspace_id, scenario_id) where scenario_id is not null;
create index if not exists idx_recovery_cases_priority on recovery_cases (workspace_id, revenue_priority desc);

-- 4. recovery_case_events
create table if not exists recovery_case_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  recovery_case_id uuid not null references recovery_cases(id) on delete cascade,
  event_type text not null,
  from_status text,
  to_status text,
  actor_type text not null,
  actor_id text,
  source_provider text,
  source_event_id uuid references webhook_events(id) on delete set null,
  workflow_job_id uuid,
  agent_run_id uuid references agent_runs(id) on delete set null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint recovery_case_events_actor_check check (actor_type in ('system', 'provider', 'agent', 'founder', 'worker'))
);

create index if not exists idx_recovery_case_events_case on recovery_case_events (workspace_id, recovery_case_id, created_at asc);

-- 5. contact_policies
create table if not exists contact_policies (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  customer_account_id uuid references customer_accounts(id) on delete cascade,
  channel text not null,
  address text,
  policy text not null,
  reason text not null,
  source text not null,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contact_policies_policy_check check (policy in ('allow', 'do_not_contact', 'transactional_only', 'manual_review_only'))
);

create index if not exists idx_contact_policies_lookup on contact_policies (workspace_id, customer_account_id, channel);

-- 6. provider_sync_cursors
create table if not exists provider_sync_cursors (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  provider text not null,
  stream text not null,
  scope_key text not null default 'workspace',
  cursor text,
  watermark_at timestamptz,
  last_attempt_at timestamptz,
  last_success_at timestamptz,
  status text not null default 'idle',
  error text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint provider_sync_cursors_uniq unique (workspace_id, provider, stream, scope_key)
);

-- 7. Alters on existing tables
-- webhook_events
alter table webhook_events
  add column if not exists dedupe_key text,
  add column if not exists endpoint_id text,
  add column if not exists payload_hash text,
  add column if not exists occurred_at timestamptz,
  add column if not exists processing_started_at timestamptz,
  add column if not exists completed_at timestamptz,
  add column if not exists identity_status text default 'verified',
  add column if not exists customer_account_id uuid references customer_accounts(id) on delete set null,
  add column if not exists recovery_case_id uuid references recovery_cases(id) on delete set null,
  add column if not exists retention_expires_at timestamptz,
  add column if not exists test_mode boolean default false,
  add column if not exists scenario_id text;

-- score_snapshots
alter table score_snapshots
  add column if not exists recovery_case_id uuid references recovery_cases(id) on delete set null,
  add column if not exists score_confidence numeric,
  add column if not exists severity text,
  add column if not exists revenue_priority numeric,
  add column if not exists features jsonb not null default '{}'::jsonb,
  add column if not exists available_domains text[] default array[]::text[],
  add column if not exists hard_overrides text[] default array[]::text[],
  add column if not exists score_version text,
  add column if not exists policy_version text,
  add column if not exists trigger_event_id uuid references webhook_events(id) on delete set null;

-- follow_up_drafts
alter table follow_up_drafts
  add column if not exists recovery_case_id uuid references recovery_cases(id) on delete set null,
  add column if not exists recipient_email text,
  add column if not exists body_full text,
  add column if not exists content_hash text,
  add column if not exists approved_content_hash text,
  add column if not exists action_version integer default 1,
  add column if not exists superseded_at timestamptz,
  add column if not exists approval_expires_at timestamptz,
  add column if not exists provider_message_id text,
  add column if not exists provider_thread_id text,
  add column if not exists send_idempotency_key text,
  add column if not exists send_error text;

-- draft_outcomes
alter table draft_outcomes
  add column if not exists recovery_case_id uuid references recovery_cases(id) on delete set null,
  add column if not exists outcome_type text,
  add column if not exists evidence_provider text,
  add column if not exists evidence_event_id uuid references webhook_events(id) on delete set null,
  add column if not exists evidence_external_id text,
  add column if not exists occurred_at timestamptz,
  add column if not exists attribution_rule text,
  add column if not exists attribution_version text,
  add column if not exists mrr_baseline_cents integer,
  add column if not exists strict_recovered_cents integer default 0,
  add column if not exists protected_cents integer default 0,
  add column if not exists is_test_mode boolean default false;

-- agent_runs
alter table agent_runs
  add column if not exists recovery_case_id uuid references recovery_cases(id) on delete set null,
  add column if not exists workflow_job_id uuid;
