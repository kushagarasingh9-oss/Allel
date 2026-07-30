-- Fix recursive RLS on workspace_members.
--
-- The original select policy queried public.workspace_members from inside a
-- policy on public.workspace_members itself, which triggers:
-- "infinite recursion detected in policy for relation \"workspace_members\""
--
-- Users only need to read their own membership rows for the current app
-- flows. Other table policies can still safely check membership through
-- workspace_members because those checks constrain on wm.user_id = auth.uid().

drop policy if exists "members can read workspace_members" on public.workspace_members;

create policy "members can read workspace_members"
on public.workspace_members
for select
to authenticated
using (user_id = auth.uid());
