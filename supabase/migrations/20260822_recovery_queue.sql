-- Migration: 20260822_recovery_queue.sql
-- Description: workflow_jobs durable outbox queue and atomic claim_workflow_jobs RPC function.

-- 1. workflow_jobs
create table if not exists workflow_jobs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references workspaces(id) on delete cascade,
  recovery_case_id uuid references recovery_cases(id) on delete cascade,
  webhook_event_id uuid references webhook_events(id) on delete cascade,
  job_type text not null,
  idempotency_key text not null,
  status text not null default 'pending',
  priority integer not null default 100,
  payload jsonb not null default '{}'::jsonb,
  attempt_count integer not null default 0,
  max_attempts integer not null default 8,
  next_attempt_at timestamptz not null default now(),
  lease_owner text,
  lease_expires_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  last_error_code text,
  last_error_message text,
  last_error_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workflow_jobs_status_check check (status in ('pending', 'running', 'completed', 'failed', 'dead_letter', 'cancelled')),
  constraint workflow_jobs_job_type_check check (job_type in (
    'process_provider_event',
    'project_account_features',
    'evaluate_recovery_case',
    'run_case_analysis',
    'generate_case_draft',
    'verify_case_draft',
    'notify_founder',
    'send_approved_draft',
    'sync_gmail_history',
    'classify_case_outcome',
    'refresh_founder_brief',
    'reconcile_provider_state'
  )),
  constraint workflow_jobs_idempotency_key_uniq unique (idempotency_key)
);

create index if not exists idx_workflow_jobs_claim on workflow_jobs (status, next_attempt_at, priority asc, created_at asc) where status in ('pending', 'running');
create index if not exists idx_workflow_jobs_case on workflow_jobs (workspace_id, recovery_case_id, created_at desc);
create index if not exists idx_workflow_jobs_event on workflow_jobs (webhook_event_id);
create index if not exists idx_workflow_jobs_dead_letter on workflow_jobs (workspace_id, status, updated_at desc) where status = 'dead_letter';

-- 2. claim_workflow_jobs RPC function
create or replace function claim_workflow_jobs(
  p_worker_id text,
  p_batch_size integer default 10,
  p_lease_seconds integer default 60
)
returns setof workflow_jobs
language plpgsql
security definer
as $$
declare
  v_now timestamptz := now();
  v_lease_expiry timestamptz := v_now + (p_lease_seconds || ' seconds')::interval;
begin
  return query
  with claimable as (
    select id
    from workflow_jobs
    where (
      status = 'pending'
      and next_attempt_at <= v_now
    ) or (
      status = 'running'
      and lease_expires_at is not null
      and lease_expires_at <= v_now
    )
    order by priority asc, created_at asc
    limit p_batch_size
    for update skip locked
  )
  update workflow_jobs w
  set
    status = 'running',
    lease_owner = p_worker_id,
    lease_expires_at = v_lease_expiry,
    attempt_count = w.attempt_count + 1,
    started_at = coalesce(w.started_at, v_now),
    updated_at = v_now
  from claimable c
  where w.id = c.id
  returning w.*;
end;
$$;
