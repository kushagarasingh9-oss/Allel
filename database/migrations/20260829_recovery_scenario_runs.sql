-- Recovery scenario-run ownership and safe cleanup support.
--
-- A scenario is the reusable policy fixture (for example ALLEL-012). A
-- scenario run is one concrete test execution. Cleanup is always scoped to a
-- run and is rejected for anything other than an explicitly test-mode run.

CREATE TABLE IF NOT EXISTS public.recovery_scenario_runs (
  id text PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  test_mode boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'active',
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  reset_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT recovery_scenario_runs_test_only CHECK (test_mode = true),
  CONSTRAINT recovery_scenario_runs_status_check CHECK (status IN ('active', 'completed', 'reset'))
);

CREATE INDEX IF NOT EXISTS idx_recovery_scenario_runs_workspace
  ON public.recovery_scenario_runs (workspace_id, status, started_at DESC);

-- The columns are additive so existing production data remains untouched.
ALTER TABLE public.customer_accounts
  ADD COLUMN IF NOT EXISTS scenario_id text,
  ADD COLUMN IF NOT EXISTS scenario_run_id text REFERENCES public.recovery_scenario_runs(id) ON DELETE CASCADE;
ALTER TABLE public.account_contacts
  ADD COLUMN IF NOT EXISTS scenario_id text,
  ADD COLUMN IF NOT EXISTS scenario_run_id text REFERENCES public.recovery_scenario_runs(id) ON DELETE CASCADE;
ALTER TABLE public.provider_identities
  ADD COLUMN IF NOT EXISTS scenario_id text,
  ADD COLUMN IF NOT EXISTS scenario_run_id text REFERENCES public.recovery_scenario_runs(id) ON DELETE CASCADE;
ALTER TABLE public.contact_policies
  ADD COLUMN IF NOT EXISTS scenario_id text,
  ADD COLUMN IF NOT EXISTS scenario_run_id text REFERENCES public.recovery_scenario_runs(id) ON DELETE CASCADE;
ALTER TABLE public.account_features
  ADD COLUMN IF NOT EXISTS scenario_run_id text REFERENCES public.recovery_scenario_runs(id) ON DELETE CASCADE;
ALTER TABLE public.webhook_events
  ADD COLUMN IF NOT EXISTS scenario_run_id text REFERENCES public.recovery_scenario_runs(id) ON DELETE CASCADE;
ALTER TABLE public.recovery_cases
  ADD COLUMN IF NOT EXISTS scenario_run_id text REFERENCES public.recovery_scenario_runs(id) ON DELETE CASCADE;
ALTER TABLE public.workflow_jobs
  ADD COLUMN IF NOT EXISTS scenario_run_id text REFERENCES public.recovery_scenario_runs(id) ON DELETE CASCADE;
ALTER TABLE public.score_snapshots
  ADD COLUMN IF NOT EXISTS scenario_run_id text REFERENCES public.recovery_scenario_runs(id) ON DELETE CASCADE;
ALTER TABLE public.follow_up_drafts
  ADD COLUMN IF NOT EXISTS scenario_run_id text REFERENCES public.recovery_scenario_runs(id) ON DELETE CASCADE;
ALTER TABLE public.draft_outcomes
  ADD COLUMN IF NOT EXISTS scenario_run_id text REFERENCES public.recovery_scenario_runs(id) ON DELETE CASCADE;
ALTER TABLE public.agent_runs
  ADD COLUMN IF NOT EXISTS scenario_run_id text REFERENCES public.recovery_scenario_runs(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_customer_accounts_scenario_run
  ON public.customer_accounts (workspace_id, scenario_run_id) WHERE scenario_run_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_recovery_cases_scenario_run
  ON public.recovery_cases (workspace_id, scenario_run_id) WHERE scenario_run_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_webhook_events_scenario_run
  ON public.webhook_events (workspace_id, scenario_run_id) WHERE scenario_run_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_workflow_jobs_scenario_run
  ON public.workflow_jobs (workspace_id, scenario_run_id) WHERE scenario_run_id IS NOT NULL;

-- This overload carries scenario-run ownership through atomic ingress. The
-- original function remains available for historical callers, while all new
-- ingress uses this stricter signature.
CREATE OR REPLACE FUNCTION public.ingest_provider_event_and_job(
  p_event_id         uuid,
  p_workspace_id     uuid,
  p_provider         text,
  p_event_type       text,
  p_external_id      text,
  p_dedupe_key       text,
  p_payload_hash     text,
  p_occurred_at      timestamptz,
  p_payload          jsonb,
  p_test_mode        boolean DEFAULT false,
  p_scenario_id      text DEFAULT NULL,
  p_scenario_run_id  text DEFAULT NULL,
  p_job_idempotency  text DEFAULT NULL
)
RETURNS TABLE (event_id uuid, job_id uuid, deduplicated boolean, conflict boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_existing_event_id uuid;
  v_existing_hash text;
  v_job_id uuid;
  v_is_conflict boolean := false;
  v_is_dedup boolean := false;
BEGIN
  IF p_scenario_run_id IS NOT NULL AND (
    p_workspace_id IS NULL OR p_test_mode IS DISTINCT FROM true OR NOT EXISTS (
      SELECT 1 FROM public.recovery_scenario_runs r
       WHERE r.id = p_scenario_run_id
         AND r.workspace_id = p_workspace_id
         AND r.test_mode = true
         AND r.status = 'active'
    )
  ) THEN
    RAISE EXCEPTION 'invalid scenario run for provider event';
  END IF;

  IF p_dedupe_key IS NOT NULL THEN
    SELECT we.id, we.payload_hash
      INTO v_existing_event_id, v_existing_hash
      FROM public.webhook_events we
     WHERE we.dedupe_key = p_dedupe_key
     LIMIT 1;
  END IF;

  IF v_existing_event_id IS NOT NULL THEN
    v_is_dedup := true;
    IF v_existing_hash IS DISTINCT FROM p_payload_hash THEN
      v_is_conflict := true;
      UPDATE public.webhook_events
         SET error = COALESCE(error, '') || 'CONFLICT: payload hash mismatch on retry. '
       WHERE id = v_existing_event_id;
    END IF;

    IF p_workspace_id IS NOT NULL AND p_job_idempotency IS NOT NULL AND NOT v_is_conflict THEN
      SELECT wj.id INTO v_job_id
        FROM public.workflow_jobs wj
       WHERE wj.idempotency_key = p_job_idempotency
       LIMIT 1;
      IF v_job_id IS NULL THEN
        INSERT INTO public.workflow_jobs (
          workspace_id, scenario_run_id, job_type, idempotency_key,
          status, payload, webhook_event_id, priority
        ) VALUES (
          p_workspace_id, p_scenario_run_id, 'process_provider_event', p_job_idempotency,
          'pending', jsonb_build_object(
            'webhookEventId', v_existing_event_id,
            'workspaceId', p_workspace_id,
            'scenarioRunId', p_scenario_run_id
          ), v_existing_event_id, 100
        ) ON CONFLICT (idempotency_key) DO NOTHING
        RETURNING id INTO v_job_id;
      END IF;
    END IF;

    RETURN QUERY SELECT v_existing_event_id, v_job_id, v_is_dedup, v_is_conflict;
    RETURN;
  END IF;

  INSERT INTO public.webhook_events (
    id, workspace_id, provider, event_type, external_id,
    dedupe_key, payload_hash, occurred_at, payload,
    processed, test_mode, scenario_id, scenario_run_id, received_at
  ) VALUES (
    p_event_id, p_workspace_id, p_provider, p_event_type, p_external_id,
    p_dedupe_key, p_payload_hash, p_occurred_at, p_payload,
    false, p_test_mode, p_scenario_id, p_scenario_run_id, now()
  );

  IF p_workspace_id IS NOT NULL AND p_job_idempotency IS NOT NULL THEN
    INSERT INTO public.workflow_jobs (
      workspace_id, scenario_run_id, job_type, idempotency_key,
      status, payload, webhook_event_id, priority
    ) VALUES (
      p_workspace_id, p_scenario_run_id, 'process_provider_event', p_job_idempotency,
      'pending', jsonb_build_object(
        'webhookEventId', p_event_id,
        'workspaceId', p_workspace_id,
        'scenarioRunId', p_scenario_run_id
      ), p_event_id, 100
    ) ON CONFLICT (idempotency_key) DO NOTHING
    RETURNING id INTO v_job_id;
  END IF;

  RETURN QUERY SELECT p_event_id, v_job_id, false::boolean, false::boolean;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.ingest_provider_event_and_job(uuid, uuid, text, text, text, text, text, timestamptz, jsonb, boolean, text, text, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ingest_provider_event_and_job(uuid, uuid, text, text, text, text, text, timestamptz, jsonb, boolean, text, text, text) TO service_role;
