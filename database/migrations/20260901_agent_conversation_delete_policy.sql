-- Enable deletion of agent conversations by authenticated owners
DROP POLICY IF EXISTS "users can delete their own agent conversations" ON public.agent_conversations;
CREATE POLICY "users can delete their own agent conversations"
ON public.agent_conversations
FOR DELETE
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
