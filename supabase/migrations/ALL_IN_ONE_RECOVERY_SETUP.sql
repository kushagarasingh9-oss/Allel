
create table if not exists public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade,
  provider text not null,
  event_type text not null,
  external_id text,
  dedupe_key text,
  endpoint_id text,
  payload_hash text,
  payload jsonb not null default '{}'::jsonb,
  processed boolean not null default false,
  test_mode boolean default false,
  scenario_id text,
  error text,
  occurred_at timestamptz,
  processing_started_at timestamptz,
  completed_at timestamptz,
  identity_status text default 'verified',
  customer_account_id uuid references public.customer_accounts(id) on delete set null,
  retention_expires_at timestamptz,
  received_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.score_snapshots (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  customer_account_id uuid not null references public.customer_accounts (id) on delete cascade,
  score integer not null default 0 check (score >= 0 and score <= 100),
  risk_level text not null default 'low',
  factors jsonb not null default '[]'::jsonb,
  score_confidence numeric,
  severity text,
  revenue_priority numeric,
  features jsonb not null default '{}'::jsonb,
  available_domains text[] default array[]::text[],
  hard_overrides text[] default array[]::text[],
  score_version text,
  policy_version text,
  trigger_event_id uuid references public.webhook_events(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.follow_up_drafts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  customer_account_id uuid not null references public.customer_accounts (id) on delete cascade,
  subject text not null,
  body text not null,
  body_full text,
  recipient_email text,
  status text not null default 'needs_review',
  reason text,
  suggested_action text,
  content_hash text,
  approved_content_hash text,
  action_version integer default 1,
  superseded_at timestamptz,
  approval_expires_at timestamptz,
  provider_message_id text,
  provider_thread_id text,
  send_idempotency_key text,
  send_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workflow_jobs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  job_type text not null,
  idempotency_key text unique,
  status text not null default 'pending',
  priority integer not null default 100,
  payload jsonb not null default '{}'::jsonb,
  result jsonb,
  error text,
  attempt_count integer not null default 0,
  max_attempts integer not null default 5,
  lease_owner text,
  lease_expires_at timestamptz,
  webhook_event_id uuid references public.webhook_events(id) on delete set null,
  next_attempt_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.account_contacts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  customer_account_id uuid not null references public.customer_accounts (id) on delete cascade,
  name text,
  email text,
  role text,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2. Core Recovery Tables

create table if not exists public.provider_identities (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  customer_account_id uuid not null references public.customer_accounts(id) on delete cascade,
  provider text not null,
  identity_type text not null,
  external_id text not null,
  normalized_external_id text not null,
  is_primary boolean not null default false,
  verification_status text not null default 'verified',
  source text not null default 'direct',
  metadata jsonb not null default '{}'::jsonb,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint provider_identities_uniq_key unique (workspace_id, provider, identity_type, normalized_external_id)
);

create table if not exists public.account_features (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  customer_account_id uuid primary key references public.customer_accounts(id) on delete cascade,
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
  updated_at timestamptz not null default now()
);

create table if not exists public.recovery_cases (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  customer_account_id uuid not null references public.customer_accounts(id) on delete cascade,
  case_key text not null,
  trigger_provider text not null,
  trigger_event_type text not null,
  trigger_event_id uuid references public.webhook_events(id) on delete set null,
  scenario_id text,
  status text not null,
  resolution text,
  severity text not null,
  risk_score integer not null default 0,
  score_confidence numeric not null default 1.0,
  revenue_priority numeric not null default 0,
  mrr_baseline_cents integer not null default 0,
  currency text not null default 'usd',
  score_version text not null default 'v1',
  policy_version text not null default 'v1',
  feature_version text not null default 'v1',
  action_type text not null default 'recovery_email',
  action_reason text not null default 'automated_risk_detected',
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
  constraint recovery_cases_uniq_key unique (workspace_id, case_key)
);

create table if not exists public.recovery_case_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  recovery_case_id uuid not null references public.recovery_cases(id) on delete cascade,
  event_type text not null,
  from_status text,
  to_status text,
  actor_type text not null,
  actor_id text,
  source_provider text,
  source_event_id uuid references public.webhook_events(id) on delete set null,
  workflow_job_id uuid,
  agent_run_id uuid references public.agent_runs(id) on delete set null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.contact_policies (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  customer_account_id uuid references public.customer_accounts(id) on delete cascade,
  channel text not null,
  address text,
  policy text not null,
  reason text not null,
  source text not null,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.provider_sync_cursors (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
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

create table if not exists public.draft_outcomes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  recovery_case_id uuid references public.recovery_cases(id) on delete set null,
  follow_up_draft_id uuid references public.follow_up_drafts(id) on delete set null,
  outcome_type text not null,
  evidence_provider text,
  evidence_event_id uuid references public.webhook_events(id) on delete set null,
  evidence_external_id text,
  occurred_at timestamptz,
  attribution_rule text,
  attribution_version text,
  mrr_baseline_cents integer default 0,
  strict_recovered_cents integer default 0,
  protected_cents integer default 0,
  stripe_event_id text,
  is_test_mode boolean default false,
  created_at timestamptz not null default now()
);

-- 3. Add recovery columns to customer_accounts & other existing tables

alter table public.customer_accounts
  add column if not exists domain text,
  add column if not exists contact_email text,
  add column if not exists previous_score integer,
  add column if not exists score_velocity integer;

alter table public.webhook_events
  add column if not exists recovery_case_id uuid references public.recovery_cases(id) on delete set null;

alter table public.score_snapshots
  add column if not exists recovery_case_id uuid references public.recovery_cases(id) on delete set null;

alter table public.follow_up_drafts
  add column if not exists recovery_case_id uuid references public.recovery_cases(id) on delete set null;

alter table public.agent_runs
  add column if not exists recovery_case_id uuid references public.recovery_cases(id) on delete set null,
  add column if not exists workflow_job_id uuid;

-- 4. RPC: Atomic Case Transition

create or replace function public.transition_recovery_case(
  p_workspace_id     uuid,
  p_case_id          uuid,
  p_current_status   text,
  p_target_status    text,
  p_actor_type       text,
  p_actor_id         text,
  p_event_type       text,
  p_detail           jsonb default '{}'::jsonb,
  p_workflow_job_id  uuid default null,
  p_resolution       text default null,
  p_suppression_reason text default null
)
returns public.recovery_cases
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_case public.recovery_cases;
begin
  select * into v_case
    from public.recovery_cases
   where id = p_case_id and workspace_id = p_workspace_id
     for update;

  if not found then
    raise exception 'recovery_case % not found in workspace %', p_case_id, p_workspace_id;
  end if;

  update public.recovery_cases
     set status             = p_target_status,
         resolution         = coalesce(p_resolution, resolution),
         suppression_reason = coalesce(p_suppression_reason, suppression_reason),
         awaiting_approval_at = case when p_target_status = 'awaiting_approval' then now() else awaiting_approval_at end,
         approved_at = case when p_target_status = 'approved' then now() else approved_at end,
         sent_at = case when p_target_status = 'sent' then now() else sent_at end,
         monitoring_started_at = case when p_target_status = 'monitoring' then now() else monitoring_started_at end,
         failed_at = case when p_target_status = 'failed' then now() else failed_at end,
         resolved_at = case when p_target_status in ('resolved', 'suppressed') then now() else resolved_at end,
         updated_at = now()
   where id = p_case_id
  returning * into v_case;

  insert into public.recovery_case_events (
    recovery_case_id, workspace_id,
    event_type, from_status, to_status,
    actor_type, actor_id,
    detail, workflow_job_id
  ) values (
    p_case_id, p_workspace_id,
    p_event_type, p_current_status, p_target_status,
    p_actor_type, p_actor_id,
    p_detail, p_workflow_job_id
  );

  return v_case;
end;
$$;

grant execute on function public.transition_recovery_case to service_role;

-- 5. Enable RLS and add policies for service_role and members

alter table public.recovery_cases enable row level security;
alter table public.recovery_case_events enable row level security;
alter table public.draft_outcomes enable row level security;
alter table public.provider_identities enable row level security;
alter table public.account_features enable row level security;

drop policy if exists "service role full access to recovery_cases" on public.recovery_cases;
create policy "service role full access to recovery_cases" on public.recovery_cases for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

drop policy if exists "service role full access to recovery_case_events" on public.recovery_case_events;
create policy "service role full access to recovery_case_events" on public.recovery_case_events for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

drop policy if exists "service role full access to draft_outcomes" on public.draft_outcomes;
create policy "service role full access to draft_outcomes" on public.draft_outcomes for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
