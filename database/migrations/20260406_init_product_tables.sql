create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  owner_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workspace_members (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'owner' check (role in ('owner', 'admin', 'member')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create table if not exists public.integration_connections (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  provider text not null check (
    provider in ('stripe', 'posthog', 'gmail', 'intercom', 'helpscout', 'slack', 'google_calendar')
  ),
  status text not null default 'disconnected' check (
    status in ('connected', 'needs_attention', 'disconnected', 'coming_soon')
  ),
  last_synced_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, provider)
);

create table if not exists public.customer_accounts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null,
  segment text,
  plan_name text,
  account_status text not null default 'active' check (
    account_status in ('trial', 'active', 'past_due', 'cancelled', 'churned')
  ),
  mrr_cents integer not null default 0,
  risk_level text not null default 'low' check (risk_level in ('high', 'medium', 'low')),
  risk_score integer not null default 0,
  usage_delta_percent integer not null default 0,
  open_issue text,
  next_action text,
  summary text,
  last_touch_at timestamptz,
  renewal_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, name)
);

create table if not exists public.account_signals (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  customer_account_id uuid references public.customer_accounts (id) on delete cascade,
  signal_type text not null,
  headline text not null,
  detail text not null,
  next_step text,
  evidence jsonb not null default '[]'::jsonb,
  risk_level text not null default 'low' check (risk_level in ('high', 'medium', 'low')),
  event_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.follow_up_drafts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  customer_account_id uuid references public.customer_accounts (id) on delete set null,
  draft_type text not null,
  subject text not null,
  body_preview text not null,
  status text not null default 'needs_review' check (
    status in ('ready_to_send', 'needs_review', 'waiting_on_founder', 'sent')
  ),
  due_label text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.founder_briefs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  brief_date date not null default current_date,
  headline text,
  summary text,
  generated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, brief_date)
);

create table if not exists public.founder_brief_items (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  founder_brief_id uuid not null references public.founder_briefs (id) on delete cascade,
  customer_account_id uuid references public.customer_accounts (id) on delete set null,
  sort_order integer not null default 0,
  risk_level text not null default 'low' check (risk_level in ('high', 'medium', 'low')),
  headline text not null,
  detail text not null,
  next_step text not null,
  evidence jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (founder_brief_id, sort_order)
);

create index if not exists idx_workspace_members_user_id
  on public.workspace_members (user_id);

create index if not exists idx_integration_connections_workspace_id
  on public.integration_connections (workspace_id);

create index if not exists idx_customer_accounts_workspace_id_risk
  on public.customer_accounts (workspace_id, risk_score desc, mrr_cents desc);

create index if not exists idx_account_signals_workspace_id_event_at
  on public.account_signals (workspace_id, event_at desc);

create index if not exists idx_follow_up_drafts_workspace_id_status
  on public.follow_up_drafts (workspace_id, status, created_at desc);

create index if not exists idx_founder_briefs_workspace_id_brief_date
  on public.founder_briefs (workspace_id, brief_date desc);

create index if not exists idx_founder_brief_items_workspace_id_sort_order
  on public.founder_brief_items (workspace_id, sort_order);

drop trigger if exists workspaces_set_updated_at on public.workspaces;
create trigger workspaces_set_updated_at
before update on public.workspaces
for each row execute function public.set_updated_at();

drop trigger if exists integration_connections_set_updated_at on public.integration_connections;
create trigger integration_connections_set_updated_at
before update on public.integration_connections
for each row execute function public.set_updated_at();

drop trigger if exists customer_accounts_set_updated_at on public.customer_accounts;
create trigger customer_accounts_set_updated_at
before update on public.customer_accounts
for each row execute function public.set_updated_at();

drop trigger if exists follow_up_drafts_set_updated_at on public.follow_up_drafts;
create trigger follow_up_drafts_set_updated_at
before update on public.follow_up_drafts
for each row execute function public.set_updated_at();

drop trigger if exists founder_briefs_set_updated_at on public.founder_briefs;
create trigger founder_briefs_set_updated_at
before update on public.founder_briefs
for each row execute function public.set_updated_at();

drop trigger if exists founder_brief_items_set_updated_at on public.founder_brief_items;
create trigger founder_brief_items_set_updated_at
before update on public.founder_brief_items
for each row execute function public.set_updated_at();

alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.integration_connections enable row level security;
alter table public.customer_accounts enable row level security;
alter table public.account_signals enable row level security;
alter table public.follow_up_drafts enable row level security;
alter table public.founder_briefs enable row level security;
alter table public.founder_brief_items enable row level security;

drop policy if exists "workspace members can read workspaces" on public.workspaces;
create policy "workspace members can read workspaces"
on public.workspaces
for select
to authenticated
using (
  exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = workspaces.id
      and wm.user_id = auth.uid()
  )
);

drop policy if exists "users can create owned workspaces" on public.workspaces;
create policy "users can create owned workspaces"
on public.workspaces
for insert
to authenticated
with check (owner_user_id = auth.uid());

drop policy if exists "workspace owners can update workspaces" on public.workspaces;
create policy "workspace owners can update workspaces"
on public.workspaces
for update
to authenticated
using (owner_user_id = auth.uid())
with check (owner_user_id = auth.uid());

drop policy if exists "members can read workspace_members" on public.workspace_members;
create policy "members can read workspace_members"
on public.workspace_members
for select
to authenticated
using (
  user_id = auth.uid()
  or exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = workspace_members.workspace_id
      and wm.user_id = auth.uid()
  )
);

drop policy if exists "users can join their own workspace membership rows" on public.workspace_members;
create policy "users can join their own workspace membership rows"
on public.workspace_members
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "workspace members can read integration_connections" on public.integration_connections;
create policy "workspace members can read integration_connections"
on public.integration_connections
for select
to authenticated
using (
  exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = integration_connections.workspace_id
      and wm.user_id = auth.uid()
  )
);

drop policy if exists "workspace members can insert integration_connections" on public.integration_connections;
create policy "workspace members can insert integration_connections"
on public.integration_connections
for insert
to authenticated
with check (
  exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = integration_connections.workspace_id
      and wm.user_id = auth.uid()
  )
);

drop policy if exists "workspace members can update integration_connections" on public.integration_connections;
create policy "workspace members can update integration_connections"
on public.integration_connections
for update
to authenticated
using (
  exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = integration_connections.workspace_id
      and wm.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = integration_connections.workspace_id
      and wm.user_id = auth.uid()
  )
);

drop policy if exists "workspace members can read customer_accounts" on public.customer_accounts;
create policy "workspace members can read customer_accounts"
on public.customer_accounts
for select
to authenticated
using (
  exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = customer_accounts.workspace_id
      and wm.user_id = auth.uid()
  )
);

drop policy if exists "workspace members can insert customer_accounts" on public.customer_accounts;
create policy "workspace members can insert customer_accounts"
on public.customer_accounts
for insert
to authenticated
with check (
  exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = customer_accounts.workspace_id
      and wm.user_id = auth.uid()
  )
);

drop policy if exists "workspace members can update customer_accounts" on public.customer_accounts;
create policy "workspace members can update customer_accounts"
on public.customer_accounts
for update
to authenticated
using (
  exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = customer_accounts.workspace_id
      and wm.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = customer_accounts.workspace_id
      and wm.user_id = auth.uid()
  )
);

drop policy if exists "workspace members can read account_signals" on public.account_signals;
create policy "workspace members can read account_signals"
on public.account_signals
for select
to authenticated
using (
  exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = account_signals.workspace_id
      and wm.user_id = auth.uid()
  )
);

drop policy if exists "workspace members can insert account_signals" on public.account_signals;
create policy "workspace members can insert account_signals"
on public.account_signals
for insert
to authenticated
with check (
  exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = account_signals.workspace_id
      and wm.user_id = auth.uid()
  )
);

drop policy if exists "workspace members can read follow_up_drafts" on public.follow_up_drafts;
create policy "workspace members can read follow_up_drafts"
on public.follow_up_drafts
for select
to authenticated
using (
  exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = follow_up_drafts.workspace_id
      and wm.user_id = auth.uid()
  )
);

drop policy if exists "workspace members can insert follow_up_drafts" on public.follow_up_drafts;
create policy "workspace members can insert follow_up_drafts"
on public.follow_up_drafts
for insert
to authenticated
with check (
  exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = follow_up_drafts.workspace_id
      and wm.user_id = auth.uid()
  )
);

drop policy if exists "workspace members can update follow_up_drafts" on public.follow_up_drafts;
create policy "workspace members can update follow_up_drafts"
on public.follow_up_drafts
for update
to authenticated
using (
  exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = follow_up_drafts.workspace_id
      and wm.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = follow_up_drafts.workspace_id
      and wm.user_id = auth.uid()
  )
);

drop policy if exists "workspace members can read founder_briefs" on public.founder_briefs;
create policy "workspace members can read founder_briefs"
on public.founder_briefs
for select
to authenticated
using (
  exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = founder_briefs.workspace_id
      and wm.user_id = auth.uid()
  )
);

drop policy if exists "workspace members can insert founder_briefs" on public.founder_briefs;
create policy "workspace members can insert founder_briefs"
on public.founder_briefs
for insert
to authenticated
with check (
  exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = founder_briefs.workspace_id
      and wm.user_id = auth.uid()
  )
);

drop policy if exists "workspace members can update founder_briefs" on public.founder_briefs;
create policy "workspace members can update founder_briefs"
on public.founder_briefs
for update
to authenticated
using (
  exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = founder_briefs.workspace_id
      and wm.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = founder_briefs.workspace_id
      and wm.user_id = auth.uid()
  )
);

drop policy if exists "workspace members can read founder_brief_items" on public.founder_brief_items;
create policy "workspace members can read founder_brief_items"
on public.founder_brief_items
for select
to authenticated
using (
  exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = founder_brief_items.workspace_id
      and wm.user_id = auth.uid()
  )
);

drop policy if exists "workspace members can insert founder_brief_items" on public.founder_brief_items;
create policy "workspace members can insert founder_brief_items"
on public.founder_brief_items
for insert
to authenticated
with check (
  exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = founder_brief_items.workspace_id
      and wm.user_id = auth.uid()
  )
);

drop policy if exists "workspace members can update founder_brief_items" on public.founder_brief_items;
create policy "workspace members can update founder_brief_items"
on public.founder_brief_items
for update
to authenticated
using (
  exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = founder_brief_items.workspace_id
      and wm.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = founder_brief_items.workspace_id
      and wm.user_id = auth.uid()
  )
);
