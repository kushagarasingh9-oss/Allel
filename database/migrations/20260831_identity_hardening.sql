-- Migration: 20260831_identity_hardening.sql
-- Description: Forward-only migration hardening cross-provider identity resolution.
--   1. Extends provider_identities CHECK constraint to allow 'intercom' + 'contact_id'.
--   2. Adds identity_conflicts review table.
--   3. Adds is_provisional to customer_accounts and account_contacts.
--   4. Adds is_provisional to provider_identities.
--   5. Adds indexes for conflict queue and provisional lookups.

-- ---------------------------------------------------------------------------
-- 1. Extend provider_identities to allow Intercom identities
-- ---------------------------------------------------------------------------

-- Drop old CHECK constraints (they are replaced by the new ones below)
ALTER TABLE public.provider_identities
  DROP CONSTRAINT IF EXISTS provider_identities_provider_check,
  DROP CONSTRAINT IF EXISTS provider_identities_identity_type_check;

-- Re-add constraints with intercom and contact_id included
ALTER TABLE public.provider_identities
  ADD CONSTRAINT provider_identities_provider_check
    CHECK (provider IN ('stripe', 'posthog', 'gmail', 'intercom')),
  ADD CONSTRAINT provider_identities_identity_type_check
    CHECK (identity_type IN (
      'customer_id',
      'subscription_id',
      'invoice_customer_id',
      'distinct_id',
      'person_email',
      'email_address',
      'gmail_thread_id',
      'contact_id'
    ));

-- Add is_provisional to provider_identities (provisional = came from name/domain inference)
ALTER TABLE public.provider_identities
  ADD COLUMN IF NOT EXISTS is_provisional BOOLEAN NOT NULL DEFAULT FALSE;

-- Index for provisional identity queries
CREATE INDEX IF NOT EXISTS idx_provider_identities_provisional
  ON public.provider_identities (workspace_id, is_provisional)
  WHERE is_provisional = TRUE;

-- ---------------------------------------------------------------------------
-- 2. identity_conflicts — conflict review queue
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.identity_conflicts (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id            UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  -- 'email' is a virtual provider used for account_contacts conflicts
  provider                TEXT NOT NULL,
  identity_type           TEXT NOT NULL,
  normalized_external_id  TEXT NOT NULL,
  existing_account_id     UUID NOT NULL REFERENCES public.customer_accounts(id) ON DELETE CASCADE,
  candidate_account_id    UUID NOT NULL REFERENCES public.customer_accounts(id) ON DELETE CASCADE,
  source                  TEXT NOT NULL,
  reason                  TEXT NOT NULL,
  status                  TEXT NOT NULL DEFAULT 'pending',
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at             TIMESTAMPTZ,
  resolved_by             TEXT,
  CONSTRAINT identity_conflicts_status_check
    CHECK (status IN ('pending', 'resolved', 'dismissed'))
);

CREATE INDEX IF NOT EXISTS idx_identity_conflicts_workspace_status
  ON public.identity_conflicts (workspace_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_identity_conflicts_accounts
  ON public.identity_conflicts (workspace_id, existing_account_id, candidate_account_id);

-- RLS: allow service_role full access; authenticated can read their workspace conflicts
ALTER TABLE public.identity_conflicts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS identity_conflicts_service_all ON public.identity_conflicts;
CREATE POLICY identity_conflicts_service_all
  ON public.identity_conflicts
  FOR ALL
  TO service_role
  USING (TRUE)
  WITH CHECK (TRUE);

DROP POLICY IF EXISTS identity_conflicts_authenticated_read ON public.identity_conflicts;
CREATE POLICY identity_conflicts_authenticated_read
  ON public.identity_conflicts
  FOR SELECT
  TO authenticated
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- 3. customer_accounts — provisional flag
-- ---------------------------------------------------------------------------

-- Provisional accounts are created from inference (PostHog person with no email match,
-- Gmail bootstrap candidate, etc.). They hold usage data but cannot receive outbound
-- actions until a verified identity (Stripe customer_id, exact email) confirms them.

ALTER TABLE public.customer_accounts
  ADD COLUMN IF NOT EXISTS is_provisional BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_customer_accounts_provisional
  ON public.customer_accounts (workspace_id, is_provisional)
  WHERE is_provisional = TRUE;

-- ---------------------------------------------------------------------------
-- 4. account_contacts — provisional flag
-- ---------------------------------------------------------------------------

-- Provisional contacts were created by inference (Gmail bootstrap, domain heuristics).
-- They should not be used as verified cross-provider identity bridges.

ALTER TABLE public.account_contacts
  ADD COLUMN IF NOT EXISTS is_provisional BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_account_contacts_provisional
  ON public.account_contacts (workspace_id, is_provisional)
  WHERE is_provisional = TRUE;
