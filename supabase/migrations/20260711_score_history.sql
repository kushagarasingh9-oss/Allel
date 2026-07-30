-- Score History & Velocity Tracking
--
-- Records a point-in-time snapshot of each churn score computation,
-- enabling velocity analysis (rate of change) and compound signal
-- detection (e.g. accelerating decline, chronic medium risk).
--
-- Snapshots are immutable — one row per score run per account.
-- Velocity is pre-computed on customer_accounts for fast dashboard reads.

-- 1. Create the score_snapshots table
create table if not exists public.score_snapshots (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  customer_account_id uuid not null references public.customer_accounts (id) on delete cascade,

  -- The computed churn score (0–100, higher = more at risk)
  score integer not null check (score >= 0 and score <= 100),

  -- Risk classification at time of snapshot
  risk_level text not null check (risk_level in ('high', 'medium', 'low')),

  -- Full factor breakdown (array of ChurnFactor objects)
  factors jsonb not null default '[]'::jsonb,

  created_at timestamptz not null default now()
);

-- 2. Indexes
-- Primary lookup: recent snapshots for a given account, newest first
create index if not exists idx_score_snapshots_account_created
  on public.score_snapshots (customer_account_id, created_at desc);

-- Workspace-level queries (e.g. "all snapshots in workspace for last 7 days")
create index if not exists idx_score_snapshots_workspace_created
  on public.score_snapshots (workspace_id, created_at desc);

-- 3. RLS
alter table public.score_snapshots enable row level security;

drop policy if exists "workspace members can read score_snapshots" on public.score_snapshots;
create policy "workspace members can read score_snapshots"
on public.score_snapshots
for select
using (
  exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = score_snapshots.workspace_id
      and wm.user_id = auth.uid()
  )
);

-- Service role can do everything (used by cron/agent)
drop policy if exists "service role full access to score_snapshots" on public.score_snapshots;
create policy "service role full access to score_snapshots"
on public.score_snapshots
for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

-- 4. Add velocity columns to customer_accounts
ALTER TABLE public.customer_accounts
  ADD COLUMN IF NOT EXISTS previous_score integer;

ALTER TABLE public.customer_accounts
  ADD COLUMN IF NOT EXISTS score_velocity integer;
