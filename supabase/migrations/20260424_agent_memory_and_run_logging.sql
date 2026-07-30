-- Durable agent chat memory + richer run logging

-- 1. Expand agent_runs to support real runtime values and metadata
ALTER TABLE public.agent_runs
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.agent_runs
  DROP CONSTRAINT IF EXISTS agent_runs_run_type_check;

ALTER TABLE public.agent_runs
  ADD CONSTRAINT agent_runs_run_type_check
  CHECK (
    run_type IN (
      'agent_run',
      'chat_message',
      'daily_review',
      'stripe_webhook',
      'posthog_webhook',
      'churn_score',
      'draft_generated',
      'draft_approved',
      'draft_sent',
      'draft_rejected',
      'brief_generated',
      'risk_explained',
      'integration_synced',
      'sync_failed',
      'coupon_created',
      'ticket_created'
    )
  );

-- 2. Persist per-user / per-persona chat transcripts server-side
CREATE TABLE IF NOT EXISTS public.agent_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  persona_id text NOT NULL CHECK (persona_id IN ('alex', 'henry', 'sarah')),
  message_history jsonb NOT NULL DEFAULT '[]'::jsonb,
  last_user_message_at timestamptz,
  last_assistant_message_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, user_id, persona_id)
);

CREATE INDEX IF NOT EXISTS idx_agent_conversations_workspace_user
  ON public.agent_conversations (workspace_id, user_id, updated_at DESC);

DROP TRIGGER IF EXISTS agent_conversations_set_updated_at ON public.agent_conversations;
CREATE TRIGGER agent_conversations_set_updated_at
BEFORE UPDATE ON public.agent_conversations
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.agent_conversations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users can read their own agent conversations" ON public.agent_conversations;
CREATE POLICY "users can read their own agent conversations"
ON public.agent_conversations
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.workspace_members wm
    WHERE wm.workspace_id = agent_conversations.workspace_id
      AND wm.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "users can insert their own agent conversations" ON public.agent_conversations;
CREATE POLICY "users can insert their own agent conversations"
ON public.agent_conversations
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.workspace_members wm
    WHERE wm.workspace_id = agent_conversations.workspace_id
      AND wm.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "users can update their own agent conversations" ON public.agent_conversations;
CREATE POLICY "users can update their own agent conversations"
ON public.agent_conversations
FOR UPDATE
TO authenticated
USING (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.workspace_members wm
    WHERE wm.workspace_id = agent_conversations.workspace_id
      AND wm.user_id = auth.uid()
  )
)
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.workspace_members wm
    WHERE wm.workspace_id = agent_conversations.workspace_id
      AND wm.user_id = auth.uid()
  )
);
