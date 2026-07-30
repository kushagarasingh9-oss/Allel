-- Workflow hardening:
--   - normalize workflow run metadata into real columns
--   - track durable founder approval on drafts
--   - add a dirty-account memory refresh queue

ALTER TABLE public.agent_runs
  ADD COLUMN IF NOT EXISTS workflow_id text,
  ADD COLUMN IF NOT EXISTS stage text,
  ADD COLUMN IF NOT EXISTS persona_id text,
  ADD COLUMN IF NOT EXISTS provider text,
  ADD COLUMN IF NOT EXISTS job_index integer,
  ADD COLUMN IF NOT EXISTS parent_run_id uuid REFERENCES public.agent_runs (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS retry_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS error_count integer NOT NULL DEFAULT 0;

ALTER TABLE public.agent_runs
  DROP CONSTRAINT IF EXISTS agent_runs_retry_count_check;

ALTER TABLE public.agent_runs
  ADD CONSTRAINT agent_runs_retry_count_check CHECK (retry_count >= 0);

ALTER TABLE public.agent_runs
  DROP CONSTRAINT IF EXISTS agent_runs_error_count_check;

ALTER TABLE public.agent_runs
  ADD CONSTRAINT agent_runs_error_count_check CHECK (error_count >= 0);

UPDATE public.agent_runs
SET
  workflow_id = COALESCE(workflow_id, metadata->>'workflowId'),
  stage = COALESCE(stage, metadata->>'stage'),
  persona_id = COALESCE(persona_id, metadata->>'personaId'),
  provider = COALESCE(provider, metadata->>'provider'),
  job_index = COALESCE(
    job_index,
    CASE
      WHEN metadata ? 'jobIndex' THEN NULLIF(metadata->>'jobIndex', '')::integer
      ELSE NULL
    END
  ),
  retry_count = COALESCE(retry_count, 0),
  error_count = COALESCE(error_count, 0)
WHERE
  workflow_id IS NULL
  OR stage IS NULL
  OR persona_id IS NULL
  OR provider IS NULL
  OR job_index IS NULL;

CREATE INDEX IF NOT EXISTS idx_agent_runs_workspace_workflow
  ON public.agent_runs (workspace_id, workflow_id, created_at DESC)
  WHERE workflow_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_agent_runs_workflow_created_at
  ON public.agent_runs (workflow_id, created_at ASC)
  WHERE workflow_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_agent_runs_workspace_stage
  ON public.agent_runs (workspace_id, stage, created_at DESC)
  WHERE stage IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_agent_runs_workspace_provider
  ON public.agent_runs (workspace_id, provider, created_at DESC)
  WHERE provider IS NOT NULL;

ALTER TABLE public.follow_up_drafts
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by_actor text,
  ADD COLUMN IF NOT EXISTS approval_metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.follow_up_drafts
  DROP CONSTRAINT IF EXISTS follow_up_drafts_approved_by_actor_check;

ALTER TABLE public.follow_up_drafts
  ADD CONSTRAINT follow_up_drafts_approved_by_actor_check
  CHECK (
    approved_by_actor IS NULL
    OR approved_by_actor IN ('founder', 'api')
  );

UPDATE public.follow_up_drafts
SET
  approved_at = COALESCE(approved_at, updated_at),
  approved_by_actor = COALESCE(approved_by_actor, 'founder')
WHERE
  status IN ('ready_to_send', 'sent')
  AND approved_at IS NULL;

CREATE TABLE IF NOT EXISTS public.account_memory_refresh_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces (id) ON DELETE CASCADE,
  customer_account_id uuid NOT NULL REFERENCES public.customer_accounts (id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'failed')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  last_requested_at timestamptz NOT NULL DEFAULT now(),
  processing_started_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, customer_account_id)
);

CREATE INDEX IF NOT EXISTS idx_account_memory_refresh_queue_workspace_status
  ON public.account_memory_refresh_queue (workspace_id, status, last_requested_at ASC);

DROP TRIGGER IF EXISTS account_memory_refresh_queue_set_updated_at
  ON public.account_memory_refresh_queue;

CREATE TRIGGER account_memory_refresh_queue_set_updated_at
BEFORE UPDATE ON public.account_memory_refresh_queue
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.account_memory_refresh_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "workspace members can read account_memory_refresh_queue"
  ON public.account_memory_refresh_queue;
CREATE POLICY "workspace members can read account_memory_refresh_queue"
ON public.account_memory_refresh_queue
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.workspace_members wm
    WHERE wm.workspace_id = account_memory_refresh_queue.workspace_id
      AND wm.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "workspace members can insert account_memory_refresh_queue"
  ON public.account_memory_refresh_queue;
CREATE POLICY "workspace members can insert account_memory_refresh_queue"
ON public.account_memory_refresh_queue
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.workspace_members wm
    WHERE wm.workspace_id = account_memory_refresh_queue.workspace_id
      AND wm.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "workspace members can update account_memory_refresh_queue"
  ON public.account_memory_refresh_queue;
CREATE POLICY "workspace members can update account_memory_refresh_queue"
ON public.account_memory_refresh_queue
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.workspace_members wm
    WHERE wm.workspace_id = account_memory_refresh_queue.workspace_id
      AND wm.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.workspace_members wm
    WHERE wm.workspace_id = account_memory_refresh_queue.workspace_id
      AND wm.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "workspace members can delete account_memory_refresh_queue"
  ON public.account_memory_refresh_queue;
CREATE POLICY "workspace members can delete account_memory_refresh_queue"
ON public.account_memory_refresh_queue
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.workspace_members wm
    WHERE wm.workspace_id = account_memory_refresh_queue.workspace_id
      AND wm.user_id = auth.uid()
  )
);
