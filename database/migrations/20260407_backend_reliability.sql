-- Reliability fixes for backend write paths
-- Adds:
--   - unique arbiter for integration_tokens upserts
--   - missing RLS policies for agent_runs inserts
--   - missing delete policies for integration_tokens and follow_up_drafts

with ranked_tokens as (
  select
    ctid,
    row_number() over (
      partition by workspace_id, provider, token_type
      order by updated_at desc nulls last, created_at desc, id desc
    ) as row_num
  from public.integration_tokens
)
delete from public.integration_tokens t
using ranked_tokens r
where t.ctid = r.ctid
  and r.row_num > 1;

create unique index if not exists idx_integration_tokens_workspace_provider_type_unique
  on public.integration_tokens (workspace_id, provider, token_type);

drop policy if exists "workspace members can insert agent_runs" on public.agent_runs;
create policy "workspace members can insert agent_runs"
on public.agent_runs
for insert
to authenticated
with check (
  exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = agent_runs.workspace_id
      and wm.user_id = auth.uid()
  )
);

drop policy if exists "workspace members can delete integration_tokens" on public.integration_tokens;
create policy "workspace members can delete integration_tokens"
on public.integration_tokens
for delete
to authenticated
using (
  exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = integration_tokens.workspace_id
      and wm.user_id = auth.uid()
  )
);

drop policy if exists "workspace members can delete follow_up_drafts" on public.follow_up_drafts;
create policy "workspace members can delete follow_up_drafts"
on public.follow_up_drafts
for delete
to authenticated
using (
  exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = follow_up_drafts.workspace_id
      and wm.user_id = auth.uid()
  )
);
