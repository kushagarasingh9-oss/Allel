-- Migration: 20260831_identity_atomic_rpcs.sql
-- Description: Transactional PostgreSQL functions for atomic provider identity linking,
-- contact linking, and promotion with row locks and collision detection.

-- ---------------------------------------------------------------------------
-- 1. link_provider_identity_safely
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
AS $$
DECLARE
  v_existing RECORD;
  v_conflict_id UUID;
  v_new_status TEXT;
  v_now TIMESTAMPTZ := now();
BEGIN
  -- 1. Lock and read existing provider identity row on unique key
  SELECT id, customer_account_id, verification_status, metadata, is_primary, is_provisional
  INTO v_existing
  FROM public.provider_identities
  WHERE workspace_id = p_workspace_id
    AND provider = p_provider
    AND identity_type = p_identity_type
    AND normalized_external_id = p_normalized_external_id
  FOR UPDATE;

  IF v_existing IS NULL THEN
    -- 2. Absent -> Insert new identity
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
      'verificationStatus', COALESCE(p_verification_status, 'inferred')
    );

  ELSIF v_existing.customer_account_id = p_customer_account_id THEN
    -- 3. Owned by same account -> Safe enrichment
    -- Promote inferred to verified if verified evidence provided. NEVER downgrade verified to inferred.
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
      'verificationStatus', v_new_status
    );

  ELSE
    -- 4. Owned by a different account -> Reject and record conflict
    -- Do not reassign the identity.
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
      'Provider identity ' || p_provider || ':' || p_identity_type || ':' || p_normalized_external_id ||
        ' is already linked to account ' || v_existing.customer_account_id::TEXT ||
        '. Candidate account ' || p_customer_account_id::TEXT || ' rejected. Source: ' || p_source || '.',
      'pending',
      v_now
    )
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
-- 2. link_account_contact_safely
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
AS $$
DECLARE
  v_normalized_email TEXT;
  v_existing RECORD;
  v_conflict_id UUID;
  v_next_provisional BOOLEAN;
  v_is_primary_allowed BOOLEAN := TRUE;
  v_now TIMESTAMPTZ := now();
BEGIN
  v_normalized_email := lower(trim(p_email));
  IF v_normalized_email IS NULL OR v_normalized_email = '' OR position('@' in v_normalized_email) = 0 THEN
    RETURN jsonb_build_object(
      'status', 'error',
      'error', 'Invalid or empty email address: ' || COALESCE(p_email, '')
    );
  END IF;

  -- Non-authoritative sources can NEVER set is_primary = true
  IF p_source IN ('intercom_sync', 'posthog_sync', 'gmail_bootstrap') THEN
    v_is_primary_allowed := FALSE;
  ELSE
    v_is_primary_allowed := COALESCE(p_is_primary, FALSE);
  END IF;

  -- 1. Lock and read existing contact for (workspace_id, email)
  SELECT id, customer_account_id, external_ids, is_primary, name, role, is_provisional
  INTO v_existing
  FROM public.account_contacts
  WHERE workspace_id = p_workspace_id
    AND email = v_normalized_email
  FOR UPDATE;

  IF v_existing IS NULL THEN
    -- 2. Absent -> Insert new contact
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
    -- 3. Same account -> Safe enrichment and promotion
    -- Promotion rule: provisional -> false ONLY when source is stripe_sync (authoritative billing API)
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
    -- 4. Different account -> Record conflict and refuse to move contact
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
      'Email "' || v_normalized_email || '" is already linked to account ' || v_existing.customer_account_id::TEXT ||
        '. Candidate account ' || p_customer_account_id::TEXT || ' rejected. Source: ' || p_source || '.',
      'pending',
      v_now
    )
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
-- 3. promote_customer_identity_safely
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
AS $$
DECLARE
  v_now TIMESTAMPTZ := now();
  v_account RECORD;
BEGIN
  -- 1. Read account
  SELECT id, is_provisional
  INTO v_account
  FROM public.customer_accounts
  WHERE id = p_customer_account_id
    AND workspace_id = p_workspace_id
  FOR UPDATE;

  IF v_account IS NULL THEN
    RETURN jsonb_build_object(
      'status', 'error',
      'error', 'Customer account not found: ' || p_customer_account_id::TEXT
    );
  END IF;

  -- 2. Clear provisional flag on account
  UPDATE public.customer_accounts
  SET
    is_provisional = FALSE,
    summary = CASE
      WHEN summary LIKE '%Provisional%' THEN 'Account identity confirmed by ' || p_source || '.'
      ELSE summary
    END,
    updated_at = v_now
  WHERE id = p_customer_account_id;

  -- 3. Clear provisional flag on confirmed provider_identities and account_contacts
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

  RETURN jsonb_build_object(
    'status', 'ok',
    'accountId', p_customer_account_id,
    'promoted', TRUE
  );
END;
$$;

-- Grant EXECUTE to service_role and authenticated
GRANT EXECUTE ON FUNCTION public.link_provider_identity_safely TO service_role, authenticated, anon;
GRANT EXECUTE ON FUNCTION public.link_account_contact_safely TO service_role, authenticated, anon;
GRANT EXECUTE ON FUNCTION public.promote_customer_identity_safely TO service_role, authenticated, anon;
