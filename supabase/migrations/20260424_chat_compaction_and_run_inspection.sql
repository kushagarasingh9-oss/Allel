-- Chat memory compaction + workflow replay indexes

ALTER TABLE public.agent_conversations
  ADD COLUMN IF NOT EXISTS conversation_summary text,
  ADD COLUMN IF NOT EXISTS summary_message_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_compacted_at timestamptz,
  ADD COLUMN IF NOT EXISTS account_context jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_agent_runs_workspace_created_at
  ON public.agent_runs (workspace_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_runs_workflow_id
  ON public.agent_runs ((metadata->>'workflowId'))
  WHERE metadata ? 'workflowId';
