-- Scope persisted agent conversations to a browser/chat session instead of
-- reusing one transcript forever per user/persona/workspace combination.

ALTER TABLE public.agent_conversations
  ADD COLUMN IF NOT EXISTS session_id text;

UPDATE public.agent_conversations
SET session_id = 'legacy'
WHERE session_id IS NULL OR btrim(session_id) = '';

ALTER TABLE public.agent_conversations
  ALTER COLUMN session_id SET DEFAULT 'legacy';

ALTER TABLE public.agent_conversations
  ALTER COLUMN session_id SET NOT NULL;

ALTER TABLE public.agent_conversations
  DROP CONSTRAINT IF EXISTS agent_conversations_workspace_id_user_id_persona_id_key;

ALTER TABLE public.agent_conversations
  DROP CONSTRAINT IF EXISTS agent_conversations_workspace_user_persona_session_key;

ALTER TABLE public.agent_conversations
  ADD CONSTRAINT agent_conversations_workspace_user_persona_session_key
  UNIQUE (workspace_id, user_id, persona_id, session_id);

CREATE INDEX IF NOT EXISTS idx_agent_conversations_workspace_user_session
  ON public.agent_conversations (workspace_id, user_id, session_id, updated_at DESC);
