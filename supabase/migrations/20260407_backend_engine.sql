-- Backend engine tables for Allel
-- Adds: webhook_events, churn_scores, churn_score_factors, agent_runs,
--        integration_tokens, account_contacts, account_timeline

-- 1. Raw webhook event log (audit + replay)
create table if not exists public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  provider text not null,
  event_type text not null,
  external_id text,
  payload jsonb not null default '{}'::jsonb,
  processed boolean not null default false,
  error text,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);

create index if not exists idx_webhook_events_workspace_provider
  on public.webhook_events (workspace_id, provider, received_at desc);

create index if not exists idx_webhook_events_external_id
  on public.webhook_events (external_id) where external_id is not null;

-- 2. Daily churn score snapshots (append-only for trend tracking)
create table if not exists public.churn_scores (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  customer_account_id uuid not null references public.customer_accounts (id) on delete cascade,
  score integer not null default 0 check (score >= 0 and score <= 100),
  risk_level text not null default 'low' check (risk_level in ('high', 'medium', 'low')),
  scored_at date not null default current_date,
  created_at timestamptz not null default now(),
  unique (customer_account_id, scored_at)
);

create index if not exists idx_churn_scores_workspace_date
  on public.churn_scores (workspace_id, scored_at desc);

create index if not exists idx_churn_scores_account_date
  on public.churn_scores (customer_account_id, scored_at desc);

-- 3. Individual factors that contributed to a churn score
create table if not exists public.churn_score_factors (
  id uuid primary key default gen_random_uuid(),
  churn_score_id uuid not null references public.churn_scores (id) on delete cascade,
  factor_name text not null,
  factor_weight integer not null,
  raw_value numeric not null default 0,
  weighted_value numeric not null default 0,
  evidence text,
  created_at timestamptz not null default now()
);

create index if not exists idx_churn_score_factors_score_id
  on public.churn_score_factors (churn_score_id);

-- 4. Agent run log (every AI/engine action)
create table if not exists public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  customer_account_id uuid references public.customer_accounts (id) on delete set null,
  run_type text not null check (
    run_type in (
      'churn_score', 'draft_generated', 'draft_approved', 'draft_sent',
      'draft_rejected', 'brief_generated', 'risk_explained',
      'integration_synced', 'coupon_created', 'ticket_created'
    )
  ),
  status text not null default 'completed' check (
    status in ('running', 'completed', 'failed')
  ),
  input_summary text,
  output_summary text,
  error text,
  duration_ms integer,
  model_used text,
  tokens_used integer,
  cost_cents integer,
  created_at timestamptz not null default now()
);

create index if not exists idx_agent_runs_workspace_type
  on public.agent_runs (workspace_id, run_type, created_at desc);

-- 5. Encrypted OAuth tokens and API keys
create table if not exists public.integration_tokens (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  provider text not null,
  token_type text not null default 'api_key' check (
    token_type in ('api_key', 'oauth_access', 'oauth_refresh')
  ),
  encrypted_value text not null,
  iv text not null,
  auth_tag text not null,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_integration_tokens_workspace_provider
  on public.integration_tokens (workspace_id, provider, token_type);

drop trigger if exists integration_tokens_set_updated_at on public.integration_tokens;
create trigger integration_tokens_set_updated_at
before update on public.integration_tokens
for each row execute function public.set_updated_at();

-- 6. Email ↔ account identity mapping (the universal key)
create table if not exists public.account_contacts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  customer_account_id uuid not null references public.customer_accounts (id) on delete cascade,
  email text not null,
  name text,
  role text,
  is_primary boolean not null default false,
  external_ids jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, email)
);

create index if not exists idx_account_contacts_email
  on public.account_contacts (workspace_id, email);

create index if not exists idx_account_contacts_account
  on public.account_contacts (customer_account_id);

drop trigger if exists account_contacts_set_updated_at on public.account_contacts;
create trigger account_contacts_set_updated_at
before update on public.account_contacts
for each row execute function public.set_updated_at();

-- 7. Unified event timeline per account
create table if not exists public.account_timeline (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  customer_account_id uuid not null references public.customer_accounts (id) on delete cascade,
  event_type text not null check (
    event_type in (
      'billing', 'usage', 'support', 'email_sent', 'email_received',
      'draft_created', 'draft_approved', 'draft_sent',
      'risk_changed', 'coupon_offered', 'call_scheduled',
      'milestone', 'note'
    )
  ),
  headline text not null,
  detail text,
  source text,
  metadata jsonb not null default '{}'::jsonb,
  event_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_account_timeline_account_event
  on public.account_timeline (customer_account_id, event_at desc);

create index if not exists idx_account_timeline_workspace
  on public.account_timeline (workspace_id, event_at desc);

-- RLS for all new tables
alter table public.webhook_events enable row level security;
alter table public.churn_scores enable row level security;
alter table public.churn_score_factors enable row level security;
alter table public.agent_runs enable row level security;
alter table public.integration_tokens enable row level security;
alter table public.account_contacts enable row level security;
alter table public.account_timeline enable row level security;

-- Webhook events: workspace members can read
drop policy if exists "workspace members can read webhook_events" on public.webhook_events;
create policy "workspace members can read webhook_events"
on public.webhook_events for select to authenticated
using (
  exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = webhook_events.workspace_id
      and wm.user_id = auth.uid()
  )
);

-- Churn scores: workspace members can read
drop policy if exists "workspace members can read churn_scores" on public.churn_scores;
create policy "workspace members can read churn_scores"
on public.churn_scores for select to authenticated
using (
  exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = churn_scores.workspace_id
      and wm.user_id = auth.uid()
  )
);

-- Churn score factors: readable via churn_scores workspace
drop policy if exists "workspace members can read churn_score_factors" on public.churn_score_factors;
create policy "workspace members can read churn_score_factors"
on public.churn_score_factors for select to authenticated
using (
  exists (
    select 1 from public.churn_scores cs
    join public.workspace_members wm on wm.workspace_id = cs.workspace_id
    where cs.id = churn_score_factors.churn_score_id
      and wm.user_id = auth.uid()
  )
);

-- Agent runs: workspace members can read
drop policy if exists "workspace members can read agent_runs" on public.agent_runs;
create policy "workspace members can read agent_runs"
on public.agent_runs for select to authenticated
using (
  exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = agent_runs.workspace_id
      and wm.user_id = auth.uid()
  )
);

-- Integration tokens: workspace members can read/write
drop policy if exists "workspace members can read integration_tokens" on public.integration_tokens;
create policy "workspace members can read integration_tokens"
on public.integration_tokens for select to authenticated
using (
  exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = integration_tokens.workspace_id
      and wm.user_id = auth.uid()
  )
);

drop policy if exists "workspace members can insert integration_tokens" on public.integration_tokens;
create policy "workspace members can insert integration_tokens"
on public.integration_tokens for insert to authenticated
with check (
  exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = integration_tokens.workspace_id
      and wm.user_id = auth.uid()
  )
);

drop policy if exists "workspace members can update integration_tokens" on public.integration_tokens;
create policy "workspace members can update integration_tokens"
on public.integration_tokens for update to authenticated
using (
  exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = integration_tokens.workspace_id
      and wm.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = integration_tokens.workspace_id
      and wm.user_id = auth.uid()
  )
);

-- Account contacts: workspace members can read
drop policy if exists "workspace members can read account_contacts" on public.account_contacts;
create policy "workspace members can read account_contacts"
on public.account_contacts for select to authenticated
using (
  exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = account_contacts.workspace_id
      and wm.user_id = auth.uid()
  )
);

drop policy if exists "workspace members can insert account_contacts" on public.account_contacts;
create policy "workspace members can insert account_contacts"
on public.account_contacts for insert to authenticated
with check (
  exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = account_contacts.workspace_id
      and wm.user_id = auth.uid()
  )
);

drop policy if exists "workspace members can update account_contacts" on public.account_contacts;
create policy "workspace members can update account_contacts"
on public.account_contacts for update to authenticated
using (
  exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = account_contacts.workspace_id
      and wm.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = account_contacts.workspace_id
      and wm.user_id = auth.uid()
  )
);

-- Account timeline: workspace members can read
drop policy if exists "workspace members can read account_timeline" on public.account_timeline;
create policy "workspace members can read account_timeline"
on public.account_timeline for select to authenticated
using (
  exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = account_timeline.workspace_id
      and wm.user_id = auth.uid()
  )
);

drop policy if exists "workspace members can insert account_timeline" on public.account_timeline;
create policy "workspace members can insert account_timeline"
on public.account_timeline for insert to authenticated
with check (
  exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = account_timeline.workspace_id
      and wm.user_id = auth.uid()
  )
);

-- Service role bypass for all new tables (cron jobs use service role)
-- These policies allow the service_role to insert/update without RLS restrictions
-- (Supabase service_role already bypasses RLS by default)
