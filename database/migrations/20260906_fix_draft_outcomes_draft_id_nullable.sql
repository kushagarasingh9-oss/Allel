-- Migration: 20260906_fix_draft_outcomes_draft_id_nullable.sql
-- Description: Allow draft_outcomes.draft_id to be nullable for telemetry-driven recovery outcomes
-- and add global deduplication partial indexes.

ALTER TABLE public.draft_outcomes
  ALTER COLUMN draft_id DROP NOT NULL;

-- Ensure outcome columns exist
ALTER TABLE public.draft_outcomes
  ADD COLUMN IF NOT EXISTS evidence_provider text,
  ADD COLUMN IF NOT EXISTS evidence_external_id text,
  ADD COLUMN IF NOT EXISTS occurred_at timestamptz,
  ADD COLUMN IF NOT EXISTS attribution_rule text,
  ADD COLUMN IF NOT EXISTS attribution_version integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS mrr_baseline_cents integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS strict_recovered_cents integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS protected_cents integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS scenario_run_id uuid REFERENCES public.recovery_scenario_runs(id) ON DELETE SET NULL;

-- Global unique deduplication on evidence event IDs to prevent double-counting
CREATE UNIQUE INDEX IF NOT EXISTS uq_draft_outcomes_evidence_event
  ON public.draft_outcomes (workspace_id, evidence_event_id)
  WHERE evidence_event_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_draft_outcomes_evidence_ext
  ON public.draft_outcomes (workspace_id, evidence_provider, evidence_external_id)
  WHERE evidence_external_id IS NOT NULL;
