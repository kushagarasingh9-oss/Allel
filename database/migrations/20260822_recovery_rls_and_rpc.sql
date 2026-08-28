-- Migration: 20260822_recovery_rls_and_rpc.sql
-- Description: Row Level Security policies for recovery tables.

-- Enable RLS
alter table provider_identities enable row level security;
alter table account_features enable row level security;
alter table recovery_cases enable row level security;
alter table recovery_case_events enable row level security;
alter table contact_policies enable row level security;
alter table provider_sync_cursors enable row level security;
alter table workflow_jobs enable row level security;

-- 1. provider_identities
create policy "Workspace members can view provider identities"
  on provider_identities for select
  using (
    workspace_id in (
      select workspace_id from workspace_members where user_id = auth.uid()
    )
  );

-- 2. account_features
create policy "Workspace members can view account features"
  on account_features for select
  using (
    workspace_id in (
      select workspace_id from workspace_members where user_id = auth.uid()
    )
  );

-- 3. recovery_cases
create policy "Workspace members can view recovery cases"
  on recovery_cases for select
  using (
    workspace_id in (
      select workspace_id from workspace_members where user_id = auth.uid()
    )
  );

-- 4. recovery_case_events
create policy "Workspace members can view recovery case events"
  on recovery_case_events for select
  using (
    workspace_id in (
      select workspace_id from workspace_members where user_id = auth.uid()
    )
  );

-- 5. contact_policies
create policy "Workspace members can view contact policies"
  on contact_policies for select
  using (
    workspace_id in (
      select workspace_id from workspace_members where user_id = auth.uid()
    )
  );

create policy "Workspace owners and admins can manage contact policies"
  on contact_policies for all
  using (
    workspace_id in (
      select workspace_id from workspace_members
      where user_id = auth.uid() and role in ('owner', 'admin')
    )
  );

-- 6. provider_sync_cursors
create policy "Workspace members can view provider sync cursors"
  on provider_sync_cursors for select
  using (
    workspace_id in (
      select workspace_id from workspace_members where user_id = auth.uid()
    )
  );

-- 7. workflow_jobs
create policy "Workspace members can view workflow jobs"
  on workflow_jobs for select
  using (
    workspace_id in (
      select workspace_id from workspace_members where user_id = auth.uid()
    )
  );
