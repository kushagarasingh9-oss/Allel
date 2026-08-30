-- Migration: 20260901_identity_security_and_integrity.sql
-- Description: Hardens cross-provider identity resolution and atomic RPCs for production safety.
--   1. Recreates SECURITY DEFINER functions with fixed search_path = public, pg_temp.
--   2. Restricts execution privileges exclusively to service_role (revokes PUBLIC, anon, authenticated).
--   3. Adds deterministic transaction-scoped advisory locks for concurrent first-time claims.
--   4. Creates immutable customer_identity_promotions audit table.
--   5. Adds unique partial index for deduplicating pending identity conflicts.
--   6. Enforces SQL-level workspace ownership validation and provider/type check constraints.

-- ---------------------------------------------------------------------------
-- 1. Extend provider constraints for all supported integration providers
-- ---------------------------------------------------------------------------

ALTER TABLE public.provider_identities
  DROP CONSTRAINT IF EXISTS provider_identities_provider_check,
  DROP CONSTRAINT IF EXISTS provider_identities_identity_type_check;

ALTER TABLE public.provider_identities
  ADD CONSTRAINT provider_identities_provider_check
    CHECK (provider IN ('stripe', 'posthog', 'gmail', 'intercom', 'hubspot')),
  ADD CONSTRAINT provider_identities_identity_type_check
    CHECK (identity_type IN (
      'customer_id',
      'subscription_id',
      'invoice_customer_id',
      'distinct_id',
      'person_email',
      'email_address',
      'gmail_thread_id',
      'contact_id',
      'hubspot_contact_id',
      'hubspot_company_id'
    ));

-- ---------------------------------------------------------------------------
-- 2. Deduplicate pending conflicts
-- ---------------------------------------------------------------------------

CREATE UNIQUE INDEX IF NOT EXISTS idx_identity_conflicts_pending_dedupe
  ON public.identity_conflicts (workspace_id, provider, identity_type, normalized_external_id, candidate_account_id)
  WHERE status = 'pending';

-- ---------------------------------------------------------------------------
-- 3. customer_identity_promotions — Immutable promotion audit trail
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.customer_identity_promotions (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id            UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  customer_account_id     UUID NOT NULL REFERENCES public.customer_accounts(id) ON DELETE CASCADE,
  provider                TEXT NOT NULL,
  identity_type           TEXT NOT NULL,
  normalized_external_id  TEXT NOT NULL,
  source                  TEXT NOT NULL,
  evidence                JSONB NOT NULL DEFAULT '{}'::JSONB,
  actor                   TEXT NOT NULL DEFAULT 'service_role',
  scenario_id             TEXT,
  scenario_run_id         TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customer_identity_promotions_account
  ON public.customer_identity_promotions (workspace_id, customer_account_id, created_at DESC);

ALTER TABLE public.customer_identity_promotions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS customer_identity_promotions_service_all ON public.customer_identity_promotions;
CREATE POLICY customer_identity_promotions_service_all
  ON public.customer_identity_promotions
  FOR ALL
  TO service_role
  USING (TRUE)
  WITH CHECK (TRUE);

DROP POLICY IF EXISTS customer_identity_promotions_authenticated_read ON public.customer_identity_promotions;
CREATE POLICY customer_identity_promotions_authenticated_read
  ON public.customer_identity_promotions
  FOR SELECT
  TO authenticated
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- 4. link_provider_identity_safely (Hardened)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.link_provider_identity_safely(
  p_workspace_id UUID,
  p_customer_account_id UUID,
  p_provider TEXT,
  p_identity_type TEXT,
  p_normalized_external_id TEXT,
  p_is_primary BOOLEAN DEFAULT FALSE,
  p_verification_status TEXT DEFAULT 'inferred',
  p_source TEXT DEFAULT 'unknown',
  p_scenario_id TEXT DEFAULT NULL,
  p_scenario_run_id TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::JSONB,
  p_is_provisional BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_account RECORD;
  v_existing RECORD;
  v_conflict_id UUID;
  v_new_status TEXT;
  v_now TIMESTAMPTZ := now();
  v_lock_key BIGINT;
  v_reason TEXT;
BEGIN
  -- 1. Input validation & Workspace integrity
  IF p_workspace_id IS NULL OR p_customer_account_id IS NULL OR p_provider IS NULL 
     OR p_identity_type IS NULL OR p_normalized_external_id IS NULL OR trim(p_normalized_external_id) = '' THEN
    RETURN jsonb_build_object(
      'status', 'error',
      'error', 'Missing required parameter for provider identity linking'
    );
  END IF;

  -- Validate account belongs to workspace
  SELECT id, workspace_id, is_provisional
  INTO v_account
  FROM public.customer_accounts
  WHERE id = p_customer_account_id AND workspace_id = p_workspace_id;

  IF v_account IS NULL THEN
    RETURN jsonb_build_object(
      'status', 'error',
      'error', 'Customer account ' || p_customer_account_id::TEXT || ' not found in workspace ' || p_workspace_id::TEXT
    );
  END IF;

  -- 2. Transaction-scoped advisory lock for deterministic concurrent first-time claims
  -- Derives 64-bit lock hash from (workspace_id, provider, identity_type, normalized_external_id)
  v_lock_key := ('x' || substr(md5(p_workspace_id::TEXT || ':' || p_provider || ':' || p_identity_type || ':' || p_normalized_external_id), 1, 16))::BIT(64)::BIGINT;
  PERFORM pg_advisory_xact_lock(v_lock_key);

  -- 3. Lock and read existing provider identity row on unique key
  SELECT id, customer_account_id, verification_status, metadata, is_primary, is_provisional
  INTO v_existing
  FROM public.provider_identities
  WHERE workspace_id = p_workspace_id
    AND provider = p_provider
    AND identity_type = p_identity_type
    AND normalized_external_id = p_normalized_external_id
  FOR UPDATE;

  IF v_existing IS NULL THEN
    -- 4. Absent -> Insert new identity
    INSERT INTO public.provider_identities (
      workspace_id,
      customer_account_id,
      provider,
      identity_type,
      external_id,
      normalized_external_id,
      is_primary,
      verification_status,
      source,
      scenario_id,
      scenario_run_id,
      metadata,
      is_provisional,
      first_seen_at,
      last_seen_at,
      created_at,
      updated_at
    )
    VALUES (
      p_workspace_id,
      p_customer_account_id,
      p_provider,
      p_identity_type,
      p_normalized_external_id,
      p_normalized_external_id,
      COALESCE(p_is_primary, FALSE),
      COALESCE(p_verification_status, 'inferred'),
      p_source,
      p_scenario_id,
      p_scenario_run_id,
      COALESCE(p_metadata, '{}'::JSONB),
      COALESCE(p_is_provisional, FALSE),
      v_now,
      v_now,
      v_now,
      v_now
    );

    RETURN jsonb_build_object(
      'status', 'ok',
      'accountId', p_customer_account_id,
      'created', TRUE,
      'verificationStatus', COALESCE(p_verification_status, 'inferred'),
      'isProvisional', COALESCE(p_is_provisional, FALSE)
    );

  ELSIF v_existing.customer_account_id = p_customer_account_id THEN
    -- 5. Owned by same account -> Safe enrichment
    IF v_existing.verification_status = 'inferred' AND p_verification_status = 'verified' THEN
      v_new_status := 'verified';
    ELSE
      v_new_status := v_existing.verification_status;
    END IF;

    UPDATE public.provider_identities
    SET
      last_seen_at = v_now,
      updated_at = v_now,
      verification_status = v_new_status,
      is_provisional = CASE
        WHEN v_new_status = 'verified' THEN FALSE
        ELSE v_existing.is_provisional
      END,
      metadata = COALESCE(v_existing.metadata, '{}'::JSONB) || COALESCE(p_metadata, '{}'::JSONB),
      is_primary = CASE WHEN p_is_primary IS TRUE THEN TRUE ELSE v_existing.is_primary END,
      scenario_id = COALESCE(p_scenario_id, provider_identities.scenario_id),
      scenario_run_id = COALESCE(p_scenario_run_id, provider_identities.scenario_run_id)
    WHERE id = v_existing.id;

    RETURN jsonb_build_object(
      'status', 'ok',
      'accountId', p_customer_account_id,
      'created', FALSE,
      'verificationStatus', v_new_status,
      'isProvisional', CASE WHEN v_new_status = 'verified' THEN FALSE ELSE v_existing.is_provisional END
    );

  ELSE
    -- 6. Owned by a different account -> Reject and record deterministic conflict
    v_reason := 'Provider identity ' || p_provider || ':' || p_identity_type || ':' || p_normalized_external_id ||
      ' is already linked to account ' || v_existing.customer_account_id::TEXT ||
      '. Candidate account ' || p_customer_account_id::TEXT || ' rejected. Source: ' || p_source || '.';

    INSERT INTO public.identity_conflicts (
      workspace_id,
      provider,
      identity_type,
      normalized_external_id,
      existing_account_id,
      candidate_account_id,
      source,
      reason,
      status,
      created_at
    )
    VALUES (
      p_workspace_id,
      p_provider,
      p_identity_type,
      p_normalized_external_id,
      v_existing.customer_account_id,
      p_customer_account_id,
      p_source,
      v_reason,
      'pending',
      v_now
    )
    ON CONFLICT (workspace_id, provider, identity_type, normalized_external_id, candidate_account_id)
      WHERE status = 'pending'
    DO UPDATE SET
      reason = EXCLUDED.reason,
      source = EXCLUDED.source,
      created_at = v_now
    RETURNING id INTO v_conflict_id;

    RETURN jsonb_build_object(
      'status', 'conflict',
      'conflictId', v_conflict_id,
      'existingAccountId', v_existing.customer_account_id,
      'candidateAccountId', p_customer_account_id,
      'reason', 'Provider identity already linked to a different account'
    );
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. link_account_contact_safely (Hardened)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.link_account_contact_safely(
  p_workspace_id UUID,
  p_customer_account_id UUID,
  p_email TEXT,
  p_name TEXT DEFAULT NULL,
  p_role TEXT DEFAULT NULL,
  p_is_primary BOOLEAN DEFAULT FALSE,
  p_external_ids JSONB DEFAULT '{}'::JSONB,
  p_source TEXT DEFAULT 'unknown',
  p_is_provisional BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_normalized_email TEXT;
  v_account RECORD;
  v_existing RECORD;
  v_conflict_id UUID;
  v_next_provisional BOOLEAN;
  v_is_primary_allowed BOOLEAN := TRUE;
  v_now TIMESTAMPTZ := now();
  v_lock_key BIGINT;
  v_reason TEXT;
BEGIN
  -- 1. Input validation & Workspace integrity
  IF p_workspace_id IS NULL OR p_customer_account_id IS NULL OR p_email IS NULL THEN
    RETURN jsonb_build_object(
      'status', 'error',
      'error', 'Missing required parameter for contact linking'
    );
  END IF;

  v_normalized_email := lower(trim(p_email));
  IF v_normalized_email = '' OR position('@' in v_normalized_email) = 0 THEN
    RETURN jsonb_build_object(
      'status', 'error',
      'error', 'Invalid email address format: ' || COALESCE(p_email, '')
    );
  END IF;

  SELECT id, workspace_id, is_provisional
  INTO v_account
  FROM public.customer_accounts
  WHERE id = p_customer_account_id AND workspace_id = p_workspace_id;

  IF v_account IS NULL THEN
    RETURN jsonb_build_object(
      'status', 'error',
      'error', 'Customer account ' || p_customer_account_id::TEXT || ' not found in workspace ' || p_workspace_id::TEXT
    );
  END IF;

  -- Non-authoritative sources can NEVER set is_primary = true
  IF p_source IN ('intercom_sync', 'posthog_sync', 'gmail_bootstrap', 'hubspot_sync') THEN
    v_is_primary_allowed := FALSE;
  ELSE
    v_is_primary_allowed := COALESCE(p_is_primary, FALSE);
  END IF;

  -- 2. Transaction-scoped advisory lock for deterministic concurrent first-time contact claims
  v_lock_key := ('x' || substr(md5(p_workspace_id::TEXT || ':contact:' || v_normalized_email), 1, 16))::BIT(64)::BIGINT;
  PERFORM pg_advisory_xact_lock(v_lock_key);

  -- 3. Lock and read existing contact for (workspace_id, email)
  SELECT id, customer_account_id, external_ids, is_primary, name, role, is_provisional
  INTO v_existing
  FROM public.account_contacts
  WHERE workspace_id = p_workspace_id
    AND email = v_normalized_email
  FOR UPDATE;

  IF v_existing IS NULL THEN
    -- 4. Absent -> Insert new contact
    INSERT INTO public.account_contacts (
      workspace_id,
      customer_account_id,
      email,
      name,
      role,
      is_primary,
      external_ids,
      is_provisional,
      created_at,
      updated_at
    )
    VALUES (
      p_workspace_id,
      p_customer_account_id,
      v_normalized_email,
      p_name,
      p_role,
      v_is_primary_allowed,
      COALESCE(p_external_ids, '{}'::JSONB),
      COALESCE(p_is_provisional, FALSE),
      v_now,
      v_now
    );

    RETURN jsonb_build_object(
      'status', 'ok',
      'accountId', p_customer_account_id,
      'created', TRUE,
      'isProvisional', COALESCE(p_is_provisional, FALSE)
    );

  ELSIF v_existing.customer_account_id = p_customer_account_id THEN
    -- 5. Same account -> Safe enrichment and promotion
    IF v_existing.is_provisional IS TRUE AND p_is_provisional IS FALSE AND p_source = 'stripe_sync' THEN
      v_next_provisional := FALSE;
    ELSIF v_existing.is_provisional IS FALSE THEN
      v_next_provisional := FALSE;
    ELSE
      v_next_provisional := COALESCE(p_is_provisional, TRUE);
    END IF;

    UPDATE public.account_contacts
    SET
      name = COALESCE(p_name, account_contacts.name),
      role = COALESCE(p_role, account_contacts.role),
      external_ids = COALESCE(account_contacts.external_ids, '{}'::JSONB) || COALESCE(p_external_ids, '{}'::JSONB),
      is_primary = CASE
        WHEN v_is_primary_allowed IS TRUE THEN TRUE
        ELSE account_contacts.is_primary
      END,
      is_provisional = v_next_provisional,
      updated_at = v_now
    WHERE id = v_existing.id;

    RETURN jsonb_build_object(
      'status', 'ok',
      'accountId', p_customer_account_id,
      'created', FALSE,
      'isProvisional', v_next_provisional
    );

  ELSE
    -- 6. Different account -> Record conflict and refuse to move contact
    v_reason := 'Email "' || v_normalized_email || '" is already linked to account ' || v_existing.customer_account_id::TEXT ||
      '. Candidate account ' || p_customer_account_id::TEXT || ' rejected. Source: ' || p_source || '.';

    INSERT INTO public.identity_conflicts (
      workspace_id,
      provider,
      identity_type,
      normalized_external_id,
      existing_account_id,
      candidate_account_id,
      source,
      reason,
      status,
      created_at
    )
    VALUES (
      p_workspace_id,
      'email',
      'email_address',
      v_normalized_email,
      v_existing.customer_account_id,
      p_customer_account_id,
      p_source,
      v_reason,
      'pending',
      v_now
    )
    ON CONFLICT (workspace_id, provider, identity_type, normalized_external_id, candidate_account_id)
      WHERE status = 'pending'
    DO UPDATE SET
      reason = EXCLUDED.reason,
      source = EXCLUDED.source,
      created_at = v_now
    RETURNING id INTO v_conflict_id;

    RETURN jsonb_build_object(
      'status', 'conflict',
      'conflictId', v_conflict_id,
      'existingAccountId', v_existing.customer_account_id,
      'candidateAccountId', p_customer_account_id,
      'reason', 'Contact email already linked to a different account'
    );
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 6. promote_customer_identity_safely (Hardened with Immutable Audit)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.promote_customer_identity_safely(
  p_workspace_id UUID,
  p_customer_account_id UUID,
  p_source TEXT,
  p_evidence JSONB DEFAULT '{}'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_now TIMESTAMPTZ := now();
  v_account RECORD;
  v_verified_identity RECORD;
  v_provider TEXT;
  v_identity_type TEXT;
  v_normalized_external_id TEXT;
  v_audit_id UUID;
BEGIN
  -- 1. Read and lock account
  SELECT id, is_provisional, summary, workspace_id
  INTO v_account
  FROM public.customer_accounts
  WHERE id = p_customer_account_id
    AND workspace_id = p_workspace_id
  FOR UPDATE;

  IF v_account IS NULL THEN
    RETURN jsonb_build_object(
      'status', 'error',
      'error', 'Customer account ' || p_customer_account_id::TEXT || ' not found in workspace ' || p_workspace_id::TEXT
    );
  END IF;

  -- 2. Verify authoritative evidence
  -- Evidence must provide verified provider identity binding (e.g. stripe_customer_id or explicit provider key)
  IF p_evidence ? 'stripe_customer_id' THEN
    v_provider := 'stripe';
    v_identity_type := 'customer_id';
    v_normalized_external_id := trim(p_evidence ->> 'stripe_customer_id');
  ELSIF p_evidence ? 'provider' AND p_evidence ? 'identity_type' AND p_evidence ? 'normalized_external_id' THEN
    v_provider := p_evidence ->> 'provider';
    v_identity_type := p_evidence ->> 'identity_type';
    v_normalized_external_id := p_evidence ->> 'normalized_external_id';
  ELSE
    RETURN jsonb_build_object(
      'status', 'error',
      'error', 'Promotion rejected: valid authoritative verified evidence must be supplied'
    );
  END IF;

  -- 3. Verify that the referenced identity exists, is verified, and belongs to this account
  SELECT id, verification_status
  INTO v_verified_identity
  FROM public.provider_identities
  WHERE workspace_id = p_workspace_id
    AND customer_account_id = p_customer_account_id
    AND provider = v_provider
    AND identity_type = v_identity_type
    AND normalized_external_id = v_normalized_external_id
    AND verification_status = 'verified';

  IF v_verified_identity IS NULL THEN
    RETURN jsonb_build_object(
      'status', 'conflict',
      'reason', 'Promotion rejected: referenced provider identity ' || v_provider || ':' || v_identity_type || ' does not exist as verified on this account'
    );
  END IF;

  -- 4. Promote account in the same transaction
  UPDATE public.customer_accounts
  SET
    is_provisional = FALSE,
    summary = CASE
      WHEN summary LIKE '%Provisional%' THEN 'Account identity confirmed by ' || p_source || '.'
      ELSE summary
    END,
    updated_at = v_now
  WHERE id = p_customer_account_id;

  -- 5. Promote verified provider_identities and confirmed primary contacts
  UPDATE public.provider_identities
  SET
    is_provisional = FALSE,
    updated_at = v_now
  WHERE workspace_id = p_workspace_id
    AND customer_account_id = p_customer_account_id
    AND verification_status = 'verified';

  UPDATE public.account_contacts
  SET
    is_provisional = FALSE,
    updated_at = v_now
  WHERE workspace_id = p_workspace_id
    AND customer_account_id = p_customer_account_id
    AND is_primary = TRUE;

  -- 6. Insert immutable promotion audit row
  INSERT INTO public.customer_identity_promotions (
    workspace_id,
    customer_account_id,
    provider,
    identity_type,
    normalized_external_id,
    source,
    evidence,
    actor,
    created_at
  )
  VALUES (
    p_workspace_id,
    p_customer_account_id,
    v_provider,
    v_identity_type,
    v_normalized_external_id,
    p_source,
    p_evidence,
    'service_role',
    v_now
  )
  RETURNING id INTO v_audit_id;

  RETURN jsonb_build_object(
    'status', 'ok',
    'accountId', p_customer_account_id,
    'promoted', TRUE,
    'auditId', v_audit_id
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 7. Security: Service-role only execution privileges (fail-closed)
-- ---------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.link_provider_identity_safely(UUID, UUID, TEXT, TEXT, TEXT, BOOLEAN, TEXT, TEXT, TEXT, TEXT, JSONB, BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.link_provider_identity_safely(UUID, UUID, TEXT, TEXT, TEXT, BOOLEAN, TEXT, TEXT, TEXT, TEXT, JSONB, BOOLEAN) TO service_role;

REVOKE ALL ON FUNCTION public.link_account_contact_safely(UUID, UUID, TEXT, TEXT, TEXT, BOOLEAN, JSONB, TEXT, BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.link_account_contact_safely(UUID, UUID, TEXT, TEXT, TEXT, BOOLEAN, JSONB, TEXT, BOOLEAN) TO service_role;

REVOKE ALL ON FUNCTION public.promote_customer_identity_safely(UUID, UUID, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.promote_customer_identity_safely(UUID, UUID, TEXT, JSONB) TO service_role;

COMMENT ON FUNCTION public.link_provider_identity_safely IS 'Security Definer RPC with search_path=public,pg_temp. Enforces transaction advisory locks and restricts execution to service_role.';
COMMENT ON FUNCTION public.link_account_contact_safely IS 'Security Definer RPC with search_path=public,pg_temp. Enforces transaction advisory locks and restricts execution to service_role.';
COMMENT ON FUNCTION public.promote_customer_identity_safely IS 'Security Definer RPC with search_path=public,pg_temp. Enforces verified evidence checks and writes to customer_identity_promotions.';
