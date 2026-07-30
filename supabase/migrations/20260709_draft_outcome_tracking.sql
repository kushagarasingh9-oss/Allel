-- Draft Outcome Tracking
--
-- Tracks what happened after a follow-up draft was sent:
-- - Did the customer respond?
-- - Did their usage recover?
-- - Are they still active 30 days later?
--
-- This data feeds back into the scoring engine and powers the
-- "Revenue Saved" counter on the dashboard.

-- 1. Create the draft_outcomes table
create table if not exists public.draft_outcomes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  draft_id uuid not null references public.follow_up_drafts (id) on delete cascade,
  customer_account_id uuid not null references public.customer_accounts (id) on delete cascade,
  
  -- Outcome classification
  outcome text not null default 'pending' check (
    outcome in ('pending', 'responded', 'recovered', 'churned', 'unknown')
  ),
  
  -- Snapshot of the account MRR at the time the draft was sent
  mrr_cents_at_send integer not null default 0,
  
  -- The churn score at time of draft send
  risk_score_at_send integer,
  
  -- When the outcome was measured/updated
  measured_at timestamptz,
  
  -- How long after sending did we measure (for velocity tracking)
  measurement_window_days integer,
  
  -- Whether the customer's account is still active
  account_still_active boolean,
  
  -- Whether the customer responded to the email (detected via Gmail thread)
  customer_responded boolean default false,
  
  -- Usage recovery: did usage_delta_percent improve?
  usage_recovered boolean default false,
  
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2. Indexes
create index if not exists idx_draft_outcomes_workspace
  on public.draft_outcomes (workspace_id, outcome);

create index if not exists idx_draft_outcomes_draft
  on public.draft_outcomes (draft_id);

create index if not exists idx_draft_outcomes_account
  on public.draft_outcomes (customer_account_id, outcome);

-- 3. Updated_at trigger
drop trigger if exists draft_outcomes_set_updated_at on public.draft_outcomes;
create trigger draft_outcomes_set_updated_at
before update on public.draft_outcomes
for each row execute function public.set_updated_at();

-- 4. RLS
alter table public.draft_outcomes enable row level security;

drop policy if exists "workspace members can read draft_outcomes" on public.draft_outcomes;
create policy "workspace members can read draft_outcomes"
on public.draft_outcomes
for select
using (
  exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = draft_outcomes.workspace_id
      and wm.user_id = auth.uid()
  )
);

-- Service role can do everything (used by cron/agent)
drop policy if exists "service role full access to draft_outcomes" on public.draft_outcomes;
create policy "service role full access to draft_outcomes"
on public.draft_outcomes
for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

-- 5. Add sent_at column to follow_up_drafts (captures when the email was actually sent)
ALTER TABLE public.follow_up_drafts
  ADD COLUMN IF NOT EXISTS sent_at timestamptz;
