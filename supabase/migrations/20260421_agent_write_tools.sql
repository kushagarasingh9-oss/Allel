-- Migration: Expand schema for agent write tools
-- Adds:
--   - resolved_at / resolution_note on account_signals (for resolveSignal tool)
--   - 'rejected' status on follow_up_drafts (for rejectDraft tool)
--   - New event_types on account_timeline (for timeline logging)

-- 1. Add resolve columns to account_signals
ALTER TABLE public.account_signals
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz,
  ADD COLUMN IF NOT EXISTS resolution_note text;

CREATE INDEX IF NOT EXISTS idx_account_signals_unresolved
  ON public.account_signals (workspace_id, customer_account_id)
  WHERE resolved_at IS NULL;

-- 2. Expand follow_up_drafts status to include 'rejected'
ALTER TABLE public.follow_up_drafts
  DROP CONSTRAINT IF EXISTS follow_up_drafts_status_check;

ALTER TABLE public.follow_up_drafts
  ADD CONSTRAINT follow_up_drafts_status_check
  CHECK (status IN ('ready_to_send', 'needs_review', 'waiting_on_founder', 'sent', 'rejected'));

-- 3. Expand account_timeline event_type to include new agent events
ALTER TABLE public.account_timeline
  DROP CONSTRAINT IF EXISTS account_timeline_event_type_check;

ALTER TABLE public.account_timeline
  ADD CONSTRAINT account_timeline_event_type_check
  CHECK (event_type IN (
    'billing', 'usage', 'support', 'email_sent', 'email_received',
    'draft_created', 'draft_approved', 'draft_sent', 'draft_rejected',
    'risk_changed', 'coupon_offered', 'call_scheduled',
    'milestone', 'note', 'signal_resolved', 'account_archived',
    'rescue_discount', 'contact_added', 'contact_updated'
  ));

-- 4. Add update policy for account_signals (needed for resolveSignal)
DROP POLICY IF EXISTS "workspace members can update account_signals" ON public.account_signals;
CREATE POLICY "workspace members can update account_signals"
ON public.account_signals
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.workspace_members wm
    WHERE wm.workspace_id = account_signals.workspace_id
      AND wm.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.workspace_members wm
    WHERE wm.workspace_id = account_signals.workspace_id
      AND wm.user_id = auth.uid()
  )
);
