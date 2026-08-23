-- Migration: 20260822_recovery_hardening.sql
-- Forward-only repair for commit f943fd1 per goal.md §40.
-- Safe when all prior 20260822_recovery_* migrations have been applied.

-- ============================================================
-- §40.6.1  Webhook deduplication arbiter
-- ============================================================
-- Add a unique partial index on dedupe_key where non-null.
-- Old rows with NULL dedupe_key are unaffected.
CREATE UNIQUE INDEX IF NOT EXISTS idx_webhook_events_dedupe_key_uniq
  ON public.webhook_events (dedupe_key)
  WHERE dedupe_key IS NOT NULL;

-- ============================================================
-- §40.6.2  Durable unmapped events — make workspace_id nullable
-- ============================================================
-- The original table has: workspace_id uuid NOT NULL references workspaces(id).
-- We need to allow NULL for unresolved events from global webhooks.
ALTER TABLE public.webhook_events
  ALTER COLUMN workspace_id DROP NOT NULL;

-- RLS: unmapped (null workspace_id) rows are visible only to service_role.
-- Existing policy "workspace members can read webhook_events" already
-- filters by workspace_id match, so NULL workspace_id rows are excluded
-- from authenticated users automatically.

-- ============================================================
-- §40.6.3  Atomic event-and-job ingress RPC
-- ============================================================
CREATE OR REPLACE FUNCTION public.ingest_provider_event_and_job(
  p_event_id         uuid,
  p_workspace_id     uuid,          -- may be NULL for unmapped
  p_provider         text,
  p_event_type       text,
  p_external_id      text,
  p_dedupe_key       text,
  p_payload_hash     text,
  p_occurred_at      timestamptz,
  p_payload          jsonb,
  p_test_mode        boolean DEFAULT false,
  p_scenario_id      text DEFAULT NULL,
  p_job_idempotency  text DEFAULT NULL
)
RETURNS TABLE (
  event_id        uuid,
  job_id          uuid,
  deduplicated    boolean,
  conflict        boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_existing_event_id uuid;
  v_existing_hash     text;
  v_job_id            uuid;
  v_is_conflict       boolean := false;
  v_is_dedup          boolean := false;
BEGIN
  -- 1. Check existing event by dedupe_key
  IF p_dedupe_key IS NOT NULL THEN
    SELECT we.id, we.payload_hash
      INTO v_existing_event_id, v_existing_hash
      FROM public.webhook_events we
     WHERE we.dedupe_key = p_dedupe_key
     LIMIT 1;
  END IF;

  IF v_existing_event_id IS NOT NULL THEN
    -- Duplicate delivery
    v_is_dedup := true;
    IF v_existing_hash IS DISTINCT FROM p_payload_hash THEN
      -- Different payload for same dedupe_key = conflict
      v_is_conflict := true;
      -- Record conflict marker
      UPDATE public.webhook_events
         SET error = COALESCE(error, '') || 'CONFLICT: payload hash mismatch on retry. '
       WHERE id = v_existing_event_id;
    END IF;

    -- Ensure process job exists (crash recovery)
    IF p_workspace_id IS NOT NULL AND p_job_idempotency IS NOT NULL AND NOT v_is_conflict THEN
      SELECT wj.id INTO v_job_id
        FROM public.workflow_jobs wj
       WHERE wj.idempotency_key = p_job_idempotency
       LIMIT 1;

      IF v_job_id IS NULL THEN
        INSERT INTO public.workflow_jobs (
          workspace_id, job_type, idempotency_key,
          status, payload, webhook_event_id, priority
        ) VALUES (
          p_workspace_id, 'process_provider_event', p_job_idempotency,
          'pending', jsonb_build_object(
            'webhookEventId', v_existing_event_id,
            'workspaceId', p_workspace_id
          ),
          v_existing_event_id, 100
        )
        ON CONFLICT (idempotency_key) DO NOTHING
        RETURNING id INTO v_job_id;
      END IF;
    END IF;

    RETURN QUERY SELECT v_existing_event_id, v_job_id, v_is_dedup, v_is_conflict;
    RETURN;
  END IF;

  -- 2. New event — insert atomically
  INSERT INTO public.webhook_events (
    id, workspace_id, provider, event_type, external_id,
    dedupe_key, payload_hash, occurred_at, payload,
    processed, test_mode, scenario_id, received_at
  ) VALUES (
    p_event_id, p_workspace_id, p_provider, p_event_type, p_external_id,
    p_dedupe_key, p_payload_hash, p_occurred_at, p_payload,
    false, p_test_mode, p_scenario_id, now()
  );

  -- 3. Insert process job when workspace is known
  IF p_workspace_id IS NOT NULL AND p_job_idempotency IS NOT NULL THEN
    INSERT INTO public.workflow_jobs (
      workspace_id, job_type, idempotency_key,
      status, payload, webhook_event_id, priority
    ) VALUES (
      p_workspace_id, 'process_provider_event', p_job_idempotency,
      'pending', jsonb_build_object(
        'webhookEventId', p_event_id,
        'workspaceId', p_workspace_id
      ),
      p_event_id, 100
    )
    ON CONFLICT (idempotency_key) DO NOTHING
    RETURNING id INTO v_job_id;
  END IF;

  RETURN QUERY SELECT p_event_id, v_job_id, false::boolean, false::boolean;
END;
$$;

-- Security: only service_role may execute
REVOKE EXECUTE ON FUNCTION public.ingest_provider_event_and_job FROM public;
REVOKE EXECUTE ON FUNCTION public.ingest_provider_event_and_job FROM anon;
REVOKE EXECUTE ON FUNCTION public.ingest_provider_event_and_job FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.ingest_provider_event_and_job TO service_role;

-- ============================================================
-- §40.6.4  Contact-policy unique constraint
-- ============================================================
-- Remove duplicates first (keep newest)
DELETE FROM public.contact_policies a
USING public.contact_policies b
WHERE a.workspace_id = b.workspace_id
  AND a.customer_account_id = b.customer_account_id
  AND a.channel = b.channel
  AND a.created_at < b.created_at;

CREATE UNIQUE INDEX IF NOT EXISTS idx_contact_policies_uniq
  ON public.contact_policies (workspace_id, customer_account_id, channel);

-- ============================================================
-- §40.6.5  Queue claim RPC hardening
-- ============================================================
-- NOTE: The existing queue migration defines p_lease_seconds (not p_lease_secs).
-- We keep that parameter name so the existing TypeScript caller is not broken.
CREATE OR REPLACE FUNCTION public.claim_workflow_jobs(
  p_worker_id    text,
  p_batch_size   integer DEFAULT 5,
  p_lease_seconds integer DEFAULT 300
)
RETURNS SETOF public.workflow_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Validate inputs
  IF p_batch_size < 1 OR p_batch_size > 50 THEN
    RAISE EXCEPTION 'batch_size must be between 1 and 50';
  END IF;
  IF p_lease_seconds < 30 OR p_lease_seconds > 3600 THEN
    RAISE EXCEPTION 'lease_seconds must be between 30 and 3600';
  END IF;

  RETURN QUERY
  WITH claimable AS (
    SELECT id
      FROM public.workflow_jobs
     WHERE (status = 'pending' AND next_attempt_at <= now())
        OR (status = 'running' AND lease_expires_at <= now())
     ORDER BY priority ASC, created_at ASC
     LIMIT p_batch_size
       FOR UPDATE SKIP LOCKED
  )
  UPDATE public.workflow_jobs wj
     SET status = 'running',
         started_at = CASE WHEN wj.status = 'pending' THEN now() ELSE wj.started_at END,
         lease_owner = p_worker_id,
         lease_expires_at = now() + make_interval(secs => p_lease_seconds),
         attempt_count = wj.attempt_count + 1,
         updated_at = now()
    FROM claimable c
   WHERE wj.id = c.id
  RETURNING wj.*;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.claim_workflow_jobs FROM public;
REVOKE EXECUTE ON FUNCTION public.claim_workflow_jobs FROM anon;
REVOKE EXECUTE ON FUNCTION public.claim_workflow_jobs FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.claim_workflow_jobs TO service_role;

-- ============================================================
-- §40.6.6  Atomic case transition RPC
-- ============================================================
CREATE OR REPLACE FUNCTION public.transition_recovery_case(
  p_workspace_id     uuid,
  p_case_id          uuid,
  p_current_status   text,
  p_target_status    text,
  p_actor_type       text,
  p_actor_id         text,
  p_event_type       text,
  p_detail           jsonb DEFAULT '{}'::jsonb,
  p_workflow_job_id  uuid DEFAULT NULL,
  p_resolution       text DEFAULT NULL,
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
  -- 1. Lock the case row
  SELECT * INTO v_case
    FROM public.recovery_cases
   WHERE id = p_case_id AND workspace_id = p_workspace_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'recovery_case % not found in workspace %', p_case_id, p_workspace_id;
  END IF;

  -- 2. Validate current status matches expected
  IF v_case.status != p_current_status THEN
    RAISE EXCEPTION 'expected status %, got %', p_current_status, v_case.status;
  END IF;

  -- 3. Validate legal transition
  v_legal := CASE
    WHEN p_current_status = 'open'              AND p_target_status IN ('analyzing', 'suppressed') THEN true
    WHEN p_current_status = 'analyzing'         AND p_target_status IN ('action_proposed', 'suppressed', 'resolved') THEN true
    WHEN p_current_status = 'action_proposed'   AND p_target_status IN ('awaiting_approval', 'suppressed', 'resolved') THEN true
    WHEN p_current_status = 'awaiting_approval' AND p_target_status IN ('approved', 'action_proposed', 'suppressed', 'resolved') THEN true
    WHEN p_current_status = 'approved'          AND p_target_status IN ('sent', 'awaiting_approval', 'suppressed') THEN true
    WHEN p_current_status = 'sent'              AND p_target_status IN ('monitoring', 'resolved') THEN true
    WHEN p_current_status = 'monitoring'        AND p_target_status IN ('resolved') THEN true
    ELSE false
  END;

  IF NOT v_legal THEN
    RAISE EXCEPTION 'illegal transition: % -> %', p_current_status, p_target_status;
  END IF;

  -- 4. Enforce required fields for terminal states
  IF p_target_status = 'resolved' AND p_resolution IS NULL THEN
    RAISE EXCEPTION 'resolution is required when transitioning to resolved';
  END IF;

  IF p_target_status = 'suppressed' AND p_suppression_reason IS NULL THEN
    RAISE EXCEPTION 'suppression_reason is required when transitioning to suppressed';
  END IF;

  -- 5. Update case — set the correct status-specific timestamp alongside status.
  UPDATE public.recovery_cases
     SET status             = p_target_status,
         -- schema column is 'resolution', not 'resolution_type'
         resolution         = COALESCE(p_resolution, resolution),
         suppression_reason = COALESCE(p_suppression_reason, suppression_reason),
         -- Set the appropriate timestamp for this target status.
         awaiting_approval_at = CASE
           WHEN p_target_status = 'awaiting_approval' THEN now()
           ELSE awaiting_approval_at
         END,
         approved_at = CASE
           WHEN p_target_status = 'approved' THEN now()
           ELSE approved_at
         END,
         sent_at = CASE
           WHEN p_target_status = 'sent' THEN now()
           ELSE sent_at
         END,
         monitoring_started_at = CASE
           WHEN p_target_status = 'monitoring' THEN now()
           ELSE monitoring_started_at
         END,
         failed_at = CASE
           WHEN p_target_status = 'failed' THEN now()
           ELSE failed_at
         END,
         resolved_at = CASE
           WHEN p_target_status IN ('resolved', 'suppressed') THEN now()
           ELSE resolved_at
         END,
         updated_at = now()
   WHERE id = p_case_id
  RETURNING * INTO v_case;

  -- 6. Append immutable case event
  INSERT INTO public.recovery_case_events (
    recovery_case_id, workspace_id,
    event_type, from_status, to_status,
    actor_type, actor_id,
    detail, workflow_job_id
  ) VALUES (
    p_case_id, p_workspace_id,
    p_event_type, p_current_status, p_target_status,
    p_actor_type, p_actor_id,
    p_detail, p_workflow_job_id
  );

  RETURN v_case;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.transition_recovery_case FROM public;
REVOKE EXECUTE ON FUNCTION public.transition_recovery_case FROM anon;
REVOKE EXECUTE ON FUNCTION public.transition_recovery_case FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.transition_recovery_case TO service_role;

-- ============================================================
-- §40.17.5  Financial outcome deduplication
-- ============================================================
CREATE UNIQUE INDEX IF NOT EXISTS idx_draft_outcomes_attribution_uniq
  ON public.draft_outcomes (workspace_id, recovery_case_id, outcome_type, evidence_event_id)
  WHERE recovery_case_id IS NOT NULL
    AND outcome_type IS NOT NULL
    AND evidence_event_id IS NOT NULL;

-- ============================================================
-- §40.5.5  follow_up_drafts status expansion
-- ============================================================
-- The current constraint allows: 'ready_to_send', 'needs_review', 'waiting_on_founder', 'sent', 'rejected'
-- We need to also allow 'pending_review' for backwards compatibility (even though §40 says use needs_review)
-- Actually, just map pending_review -> needs_review in code. No schema change needed here.

-- Add risk_level 'critical' to customer_accounts if missing
ALTER TABLE public.customer_accounts
  DROP CONSTRAINT IF EXISTS customer_accounts_risk_level_check;

ALTER TABLE public.customer_accounts
  ADD CONSTRAINT customer_accounts_risk_level_check
  CHECK (risk_level IN ('critical', 'high', 'medium', 'low'));

-- ============================================================
-- §40.6.2 RLS for nullable webhook_events.workspace_id
-- ============================================================
-- Service role bypasses RLS so no changes needed for unmapped rows.
-- The existing policy already safely handles null workspace_id
-- because the EXISTS subquery on workspace_members won't match null.

-- Add service_role full access policy to webhook_events
DROP POLICY IF EXISTS "service role full access to webhook_events" ON public.webhook_events;
CREATE POLICY "service role full access to webhook_events"
ON public.webhook_events
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- ============================================================
-- Add domain column for customer_accounts if not present
-- ============================================================
ALTER TABLE public.customer_accounts
  ADD COLUMN IF NOT EXISTS domain text;

ALTER TABLE public.customer_accounts
  ADD COLUMN IF NOT EXISTS contact_email text;

-- Unique constraint on (workspace_id, domain) for upsert
CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_accounts_domain_uniq
  ON public.customer_accounts (workspace_id, domain)
  WHERE domain IS NOT NULL;

-- ============================================================
-- Unique constraint on account_contacts for upsert
-- ============================================================
CREATE UNIQUE INDEX IF NOT EXISTS idx_account_contacts_email_uniq
  ON public.account_contacts (workspace_id, email)
  WHERE email IS NOT NULL;
