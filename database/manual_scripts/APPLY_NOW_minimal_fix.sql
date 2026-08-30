-- ============================================================
-- APPLY THIS NOW in Supabase SQL Editor
-- Adds the missing columns that block the recovery pipeline
-- ============================================================

-- 1. Add recovery_case_id to workflow_jobs (missing, breaks cron)
ALTER TABLE public.workflow_jobs
  ADD COLUMN IF NOT EXISTS recovery_case_id uuid REFERENCES public.recovery_cases(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_workflow_jobs_case
  ON public.workflow_jobs (workspace_id, recovery_case_id, created_at DESC);

-- 2. Add scenario_run_id to workflow_jobs (from 20260829 migration)
ALTER TABLE public.workflow_jobs
  ADD COLUMN IF NOT EXISTS scenario_run_id text;

-- 3. Add is_test_mode to recovery_cases (from 20260829 migration)
ALTER TABLE public.recovery_cases
  ADD COLUMN IF NOT EXISTS is_test_mode boolean NOT NULL DEFAULT false;

-- 4. Add scenario_run_id to recovery_cases
ALTER TABLE public.recovery_cases
  ADD COLUMN IF NOT EXISTS scenario_run_id text;

-- 5. Add scenario_run_id to account_features
ALTER TABLE public.account_features
  ADD COLUMN IF NOT EXISTS scenario_run_id text;

-- 6. Add scenario_run_id to webhook_events (safe even if already exists)
ALTER TABLE public.webhook_events
  ADD COLUMN IF NOT EXISTS scenario_run_id text;

-- 7. Add scenario_run_id to score_snapshots (if table exists)
ALTER TABLE public.score_snapshots
  ADD COLUMN IF NOT EXISTS scenario_run_id text;

-- 8. Add scenario_run_id to follow_up_drafts
ALTER TABLE public.follow_up_drafts
  ADD COLUMN IF NOT EXISTS scenario_run_id text;

-- 9. Add scenario_run_id to draft_outcomes
ALTER TABLE public.draft_outcomes
  ADD COLUMN IF NOT EXISTS scenario_run_id text;

-- 10. Add scenario_run_id to agent_runs
ALTER TABLE public.agent_runs
  ADD COLUMN IF NOT EXISTS scenario_run_id text;

-- 11. recovery_scenario_runs table (needed for FK references)
CREATE TABLE IF NOT EXISTS public.recovery_scenario_runs (
  id text PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  scenario_id text NOT NULL,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running','completed','failed','cancelled')),
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Done. Pipeline should now work.
SELECT 'Migration applied successfully' AS result;
