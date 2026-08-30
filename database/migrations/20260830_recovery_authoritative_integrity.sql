-- Migration: 20260830_recovery_authoritative_integrity.sql
-- Description: Authoritative forward-only migration establishing hardened queue claim RPC,
-- atomic recovery transitions, financial outcome deduplication, and webhook ingress integrity.

-- 1. Ensure columns and indexes on draft_outcomes and webhook_events
ALTER TABLE public.draft_outcomes
  ADD COLUMN IF NOT EXISTS recovery_case_id uuid REFERENCES public.recovery_cases(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS evidence_event_id uuid REFERENCES public.webhook_events(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS outcome_type text,
  ADD COLUMN IF NOT EXISTS recovered_mrr_cents integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS protected_mrr_cents integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS attribution_metadata jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS is_test_mode boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS idx_draft_outcomes_financial_dedupe
  ON public.draft_outcomes (workspace_id, recovery_case_id, outcome_type, evidence_event_id)
  WHERE outcome_type IS NOT NULL AND evidence_event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_draft_outcomes_metrics_v2
  ON public.draft_outcomes (workspace_id, is_test_mode, outcome, measured_at DESC);

-- 2. Authoritative claim_workflow_jobs RPC (hardened, security definer, bounded)
CREATE OR REPLACE FUNCTION public.claim_workflow_jobs(
  p_worker_id text,
  p_batch_size integer DEFAULT 10,
  p_lease_seconds integer DEFAULT 60
)
RETURNS SETOF public.workflow_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_now timestamptz := now();
  v_batch_limit integer := LEAST(GREATEST(COALESCE(p_batch_size, 10), 1), 50);
  v_lease_duration integer := LEAST(GREATEST(COALESCE(p_lease_seconds, 60), 10), 300);
  v_lease_expiry timestamptz := v_now + (v_lease_duration || ' seconds')::interval;
BEGIN
  IF p_worker_id IS NULL OR btrim(p_worker_id) = '' THEN
    RAISE EXCEPTION 'p_worker_id is required';
  END IF;

  RETURN QUERY
  WITH claimable AS (
    SELECT id
      FROM public.workflow_jobs
     WHERE (
       status = 'pending'
       AND next_attempt_at <= v_now
     ) OR (
       status = 'running'
       AND lease_expires_at IS NOT NULL
       AND lease_expires_at <= v_now
     )
     ORDER BY priority ASC, created_at ASC
     LIMIT v_batch_limit
       FOR UPDATE SKIP LOCKED
  )
  UPDATE public.workflow_jobs w
     SET status = 'running',
         lease_owner = p_worker_id,
         lease_expires_at = v_lease_expiry,
         attempt_count = w.attempt_count + 1,
         started_at = COALESCE(w.started_at, v_now),
         updated_at = v_now
    FROM claimable c
   WHERE w.id = c.id
  RETURNING w.*;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.claim_workflow_jobs(text, integer, integer) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_workflow_jobs(text, integer, integer) TO service_role;

-- 3. Authoritative transition_recovery_case RPC
CREATE OR REPLACE FUNCTION public.transition_recovery_case(
  p_workspace_id uuid,
  p_case_id uuid,
  p_current_status text,
  p_target_status text,
  p_actor_type text,
  p_actor_id text,
  p_event_type text,
  p_detail jsonb DEFAULT '{}'::jsonb,
  p_workflow_job_id uuid DEFAULT NULL,
  p_resolution text DEFAULT NULL,
  p_suppression_reason text DEFAULT NULL
)
RETURNS public.recovery_cases
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_case public.recovery_cases;
  v_legal boolean := false;
BEGIN
  SELECT * INTO v_case
    FROM public.recovery_cases
   WHERE id = p_case_id AND workspace_id = p_workspace_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'recovery_case % not found in workspace %', p_case_id, p_workspace_id;
  END IF;
  IF v_case.status != p_current_status THEN
    RAISE EXCEPTION 'expected status %, got %', p_current_status, v_case.status;
  END IF;

  v_legal := CASE
    WHEN p_current_status = 'open'              AND p_target_status IN ('analyzing', 'suppressed', 'resolved', 'failed') THEN true
    WHEN p_current_status = 'analyzing'         AND p_target_status IN ('action_proposed', 'suppressed', 'resolved', 'failed') THEN true
    WHEN p_current_status = 'action_proposed'   AND p_target_status IN ('awaiting_approval', 'suppressed', 'resolved', 'failed') THEN true
    WHEN p_current_status = 'awaiting_approval' AND p_target_status IN ('approved', 'suppressed', 'resolved', 'failed') THEN true
    WHEN p_current_status = 'approved'          AND p_target_status IN ('sent', 'awaiting_approval', 'suppressed', 'failed') THEN true
    WHEN p_current_status = 'sent'              AND p_target_status IN ('monitoring', 'resolved', 'failed') THEN true
    WHEN p_current_status = 'monitoring'        AND p_target_status IN ('resolved', 'failed') THEN true
    WHEN p_current_status = 'failed'            AND p_target_status IN ('open', 'resolved') THEN true
    ELSE false
  END;

  IF NOT v_legal THEN
    RAISE EXCEPTION 'illegal transition: % -> %', p_current_status, p_target_status;
  END IF;
  IF p_target_status = 'resolved' AND p_resolution IS NULL THEN
    RAISE EXCEPTION 'resolution is required when transitioning to resolved';
  END IF;
  IF p_target_status = 'suppressed' AND p_suppression_reason IS NULL THEN
    RAISE EXCEPTION 'suppression_reason is required when transitioning to suppressed';
  END IF;

  UPDATE public.recovery_cases
     SET status = p_target_status,
         resolution = COALESCE(p_resolution, resolution),
         suppression_reason = COALESCE(p_suppression_reason, suppression_reason),
         awaiting_approval_at = CASE WHEN p_target_status = 'awaiting_approval' THEN now() ELSE awaiting_approval_at END,
         approved_at = CASE WHEN p_target_status = 'approved' THEN now() ELSE approved_at END,
         sent_at = CASE WHEN p_target_status = 'sent' THEN now() ELSE sent_at END,
         monitoring_started_at = CASE WHEN p_target_status = 'monitoring' THEN now() ELSE monitoring_started_at END,
         failed_at = CASE WHEN p_target_status = 'failed' THEN now() ELSE failed_at END,
         resolved_at = CASE WHEN p_target_status IN ('resolved', 'suppressed') THEN now() ELSE resolved_at END,
         updated_at = now()
   WHERE id = p_case_id
  RETURNING * INTO v_case;

  INSERT INTO public.recovery_case_events (
    recovery_case_id, workspace_id, event_type, from_status, to_status,
    actor_type, actor_id, detail, workflow_job_id
  ) VALUES (
    p_case_id, p_workspace_id, p_event_type, p_current_status, p_target_status,
    p_actor_type, p_actor_id, COALESCE(p_detail, '{}'::jsonb), p_workflow_job_id
  );

  RETURN v_case;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.transition_recovery_case FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.transition_recovery_case TO service_role;

-- 4. Authoritative record_recovery_outcome_v2 RPC (atomic financial deduplication + case transition)
CREATE OR REPLACE FUNCTION public.record_recovery_outcome_v2(
  p_workspace_id uuid,
  p_case_id uuid,
  p_draft_id uuid,
  p_customer_account_id uuid,
  p_outcome text,
  p_outcome_type text,
  p_evidence_event_id uuid,
  p_recovered_mrr_cents integer DEFAULT 0,
  p_protected_mrr_cents integer DEFAULT 0,
  p_resolution text DEFAULT NULL,
  p_attribution_metadata jsonb DEFAULT '{}'::jsonb,
  p_is_test_mode boolean DEFAULT false
)
RETURNS TABLE (
  outcome_id uuid,
  is_duplicate boolean,
  case_status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_outcome_id uuid;
  v_case public.recovery_cases;
  v_is_dup boolean := false;
BEGIN
  -- 1. Verify and lock case
  SELECT * INTO v_case
    FROM public.recovery_cases
   WHERE id = p_case_id AND workspace_id = p_workspace_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'recovery_case % not found in workspace %', p_case_id, p_workspace_id;
  END IF;

  -- 2. Insert outcome record with deduplication protection
  BEGIN
    INSERT INTO public.draft_outcomes (
      workspace_id, draft_id, recovery_case_id, customer_account_id,
      outcome, outcome_type, evidence_event_id,
      recovered_mrr_cents, protected_mrr_cents,
      attribution_metadata, is_test_mode, measured_at, created_at, updated_at
    ) VALUES (
      p_workspace_id, p_draft_id, p_case_id, p_customer_account_id,
      p_outcome, p_outcome_type, p_evidence_event_id,
      COALESCE(p_recovered_mrr_cents, 0), COALESCE(p_protected_mrr_cents, 0),
      COALESCE(p_attribution_metadata, '{}'::jsonb), p_is_test_mode, now(), now(), now()
    ) RETURNING id INTO v_outcome_id;
  EXCEPTION WHEN unique_violation THEN
    -- Duplicate evidence attribution
    SELECT id INTO v_outcome_id
      FROM public.draft_outcomes
     WHERE workspace_id = p_workspace_id
       AND recovery_case_id = p_case_id
       AND outcome_type = p_outcome_type
       AND evidence_event_id = p_evidence_event_id;
    v_is_dup := true;
  END;

  -- 3. If new valid outcome and case should resolve, transition case atomically
  IF NOT v_is_dup AND p_outcome IN ('recovered', 'churned') AND v_case.status IN ('sent', 'monitoring', 'approved', 'action_proposed') THEN
    UPDATE public.recovery_cases
       SET status = 'resolved',
           resolution = COALESCE(p_resolution, p_outcome),
           resolved_at = now(),
           updated_at = now()
     WHERE id = p_case_id;

    INSERT INTO public.recovery_case_events (
      recovery_case_id, workspace_id, event_type, from_status, to_status,
      actor_type, actor_id, detail
    ) VALUES (
      p_case_id, p_workspace_id, 'outcome_resolved', v_case.status, 'resolved',
      'system', 'outcome_classifier',
      jsonb_build_object(
        'outcomeId', v_outcome_id,
        'outcome', p_outcome,
        'outcomeType', p_outcome_type,
        'recoveredMrrCents', p_recovered_mrr_cents,
        'protectedMrrCents', p_protected_mrr_cents,
        'evidenceEventId', p_evidence_event_id
      )
    );
    v_case.status := 'resolved';
  END IF;

  RETURN QUERY SELECT v_outcome_id, v_is_dup, v_case.status;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.record_recovery_outcome_v2 FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_recovery_outcome_v2 TO service_role;
