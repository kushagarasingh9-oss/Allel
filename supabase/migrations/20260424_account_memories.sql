
-- Durable per-account memory snapshots for the agent layer

CREATE TABLE IF NOT EXISTS public.account_memories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces (id) ON DELETE CASCADE,
  customer_account_id uuid NOT NULL REFERENCES public.customer_accounts (id) ON DELETE CASCADE,
  summary text NOT NULL DEFAULT '',
  key_signals jsonb NOT NULL DEFAULT '[]'::jsonb,
  open_loops jsonb NOT NULL DEFAULT '[]'::jsonb,
  recent_timeline jsonb NOT NULL DEFAULT '[]'::jsonb,
  last_refreshed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (customer_account_id)
);

CREATE INDEX IF NOT EXISTS idx_account_memories_workspace_account
  ON public.account_memories (workspace_id, customer_account_id);

DROP TRIGGER IF EXISTS account_memories_set_updated_at ON public.account_memories;
CREATE TRIGGER account_memories_set_updated_at
BEFORE UPDATE ON public.account_memories
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.account_memories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "workspace members can read account_memories" ON public.account_memories;
CREATE POLICY "workspace members can read account_memories"
ON public.account_memories
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.workspace_members wm
    WHERE wm.workspace_id = account_memories.workspace_id
      AND wm.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "workspace members can insert account_memories" ON public.account_memories;
CREATE POLICY "workspace members can insert account_memories"
ON public.account_memories
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.workspace_members wm
    WHERE wm.workspace_id = account_memories.workspace_id
      AND wm.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "workspace members can update account_memories" ON public.account_memories;
CREATE POLICY "workspace members can update account_memories"
ON public.account_memories
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.workspace_members wm
    WHERE wm.workspace_id = account_memories.workspace_id
      AND wm.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.workspace_members wm
    WHERE wm.workspace_id = account_memories.workspace_id
      AND wm.user_id = auth.uid()
  )
);
