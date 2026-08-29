-- Recovery workflow integrity follow-up.
-- Keeps approval, test-mode isolation, and terminal failure transitions aligned
-- with the durable TypeScript workflow.

ALTER TABLE public.recovery_cases
  ADD COLUMN IF NOT EXISTS is_test_mode boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_recovery_cases_mode
  ON public.recovery_cases (workspace_id, is_test_mode, status, updated_at DESC);

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

-- Atomically records an owner/admin approval, transitions the case, appends
-- audit evidence, and creates the unique send job. The caller's authenticated
-- user id is checked inside this SECURITY DEFINER function.
CREATE OR REPLACE FUNCTION public.approve_recovery_draft(
  p_workspace_id uuid,
  p_draft_id uuid,
  p_actor_id uuid,
  p_content_hash text,
  p_approval_expires_at timestamptz,
  p_job_idempotency_key text,
  p_job_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS TABLE (draft_id uuid, recovery_case_id uuid, workflow_job_id uuid, duplicate boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_draft public.follow_up_drafts;
  v_case public.recovery_cases;
  v_hash text;
  v_job_id uuid;
  v_duplicate boolean := false;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> p_actor_id THEN
    RAISE EXCEPTION 'authenticated actor does not match approval actor';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.workspace_members
     WHERE workspace_id = p_workspace_id
       AND user_id = p_actor_id
       AND role IN ('owner', 'admin')
  ) THEN
    RAISE EXCEPTION 'only workspace owner or admin may approve recovery send';
  END IF;

  SELECT * INTO v_draft
    FROM public.follow_up_drafts
   WHERE id = p_draft_id AND workspace_id = p_workspace_id
     FOR UPDATE;
  IF NOT FOUND OR v_draft.recovery_case_id IS NULL THEN
    RAISE EXCEPTION 'recovery draft not found in workspace';
  END IF;
  IF v_draft.status <> 'needs_review' THEN
    RAISE EXCEPTION 'draft status % cannot be approved', v_draft.status;
  END IF;
  IF v_draft.recipient_email IS NULL OR v_draft.body_full IS NULL OR v_draft.content_hash IS NULL THEN
    RAISE EXCEPTION 'draft is incomplete';
  END IF;

  v_hash := encode(digest(
    p_workspace_id::text || '::' || v_draft.recovery_case_id::text || '::' ||
    lower(btrim(v_draft.recipient_email)) || '::' ||
    replace(btrim(v_draft.subject), E'\\r\\n', E'\\n') || '::' ||
    replace(btrim(v_draft.body_full), E'\\r\\n', E'\\n') || '::null::' ||
    COALESCE(v_draft.action_version, 1)::text,
    'sha256'
  ), 'hex');
  IF v_hash <> p_content_hash OR v_hash <> v_draft.content_hash THEN
    RAISE EXCEPTION 'draft content hash mismatch';
  END IF;

  SELECT * INTO v_case
    FROM public.recovery_cases
   WHERE id = v_draft.recovery_case_id AND workspace_id = p_workspace_id
     FOR UPDATE;
  IF NOT FOUND OR v_case.status <> 'awaiting_approval' THEN
    RAISE EXCEPTION 'recovery case is not awaiting approval';
  END IF;

  UPDATE public.follow_up_drafts
     SET status = 'ready_to_send',
         approved_at = now(),
         approved_by_actor = 'founder',
         approved_content_hash = v_hash,
         approval_expires_at = p_approval_expires_at,
         approval_metadata = COALESCE(approval_metadata, '{}'::jsonb) || jsonb_build_object(
           'actor', 'founder', 'actor_id', p_actor_id, 'content_hash', v_hash
         ),
         updated_at = now()
   WHERE id = v_draft.id;

  UPDATE public.recovery_cases
     SET status = 'approved', approved_at = now(), updated_at = now()
   WHERE id = v_case.id;

  INSERT INTO public.recovery_case_events (
    workspace_id, recovery_case_id, event_type, from_status, to_status,
    actor_type, actor_id, detail
  ) VALUES (
    p_workspace_id, v_case.id, 'founder_approved_exact_draft', 'awaiting_approval', 'approved',
    'founder', p_actor_id::text,
    jsonb_build_object('draftId', v_draft.id, 'contentHash', v_hash, 'approvalExpiresAt', p_approval_expires_at)
  );

  BEGIN
    INSERT INTO public.workflow_jobs (
      workspace_id, recovery_case_id, job_type, idempotency_key, status,
      priority, payload, next_attempt_at
    ) VALUES (
      p_workspace_id, v_case.id, 'send_approved_draft', p_job_idempotency_key,
      'pending', 20,
      COALESCE(p_job_payload, '{}'::jsonb) || jsonb_build_object(
        'workspaceId', p_workspace_id, 'recoveryCaseId', v_case.id,
        'draftId', v_draft.id, 'approvedContentHash', v_hash
      ), now()
    ) RETURNING id INTO v_job_id;
  EXCEPTION WHEN unique_violation THEN
    SELECT id INTO v_job_id FROM public.workflow_jobs WHERE idempotency_key = p_job_idempotency_key;
    v_duplicate := true;
  END;

  RETURN QUERY SELECT v_draft.id, v_case.id, v_job_id, v_duplicate;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.approve_recovery_draft FROM public, anon;
GRANT EXECUTE ON FUNCTION public.approve_recovery_draft TO authenticated;
