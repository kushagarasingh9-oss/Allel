-- Migration: 20260902_identity_integrity_hardening.sql
-- Description: Complete production hardening for cross-provider identity matching and promotion.
--   1. Validates strict (provider, identity_type) pairs at the SQL level.
--   2. Adds last_seen_at and occurrence_count to identity_conflicts for repeat conflict tracking without touching created_at.
--   3. Deduplicates pending conflicts deterministically and enforces unique partial index.
--   4. Normalizes contact emails and adds unique index on (workspace_id, lower(trim(email))).
--   5. Enforces append-only immutability on customer_identity_promotions via trigger.
--   6. Hardens link_provider_identity_safely, link_account_contact_safely, and promote_customer_identity_safely:
--      - Fixed search_path = public, pg_temp
--      - Restricted execution strictly to service_role
--      - Requires verified email identity proof for contact promotion (no arbitrary promotion from p_source)
--      - Writes immutable audit trail on promotion
--      - Validates p_verification_status values

-- ---------------------------------------------------------------------------
-- 1. Extend identity_conflicts for repeat conflict tracking
-- ---------------------------------------------------------------------------

ALTER TABLE public.identity_conflicts
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS occurrence_count INTEGER NOT NULL DEFAULT 1;

-- Deduplicate any existing duplicate pending conflicts before index creation
WITH duplicate_conflicts AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY workspace_id, provider, identity_type, normalized_external_id, candidate_account_id
           ORDER BY created_at ASC
         ) AS rnum
  FROM public.identity_conflicts
  WHERE status = 'pending'
)
DELETE FROM public.identity_conflicts
WHERE id IN (
  SELECT id FROM duplicate_conflicts WHERE rnum > 1
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_identity_conflicts_pending_dedupe
  ON public.identity_conflicts (workspace_id, provider, identity_type, normalized_external_id, candidate_account_id)
  WHERE status = 'pending';

-- ---------------------------------------------------------------------------
-- 2. Normalize existing contact emails and add unique normalized email index
-- ---------------------------------------------------------------------------

UPDATE public.account_contacts
SET email = lower(trim(email))
WHERE email != lower(trim(email));

-- In case duplicate normalized emails already exist in the same workspace, resolve by keeping earliest
WITH duplicate_contacts AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY workspace_id, lower(trim(email))
           ORDER BY is_provisional ASC, is_primary DESC, created_at ASC
         ) AS rnum
  FROM public.account_contacts
  WHERE email IS NOT NULL AND trim(email) != ''
)
DELETE FROM public.account_contacts
WHERE id IN (
  SELECT id FROM duplicate_contacts WHERE rnum > 1
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_account_contacts_workspace_normalized_email
  ON public.account_contacts (workspace_id, lower(trim(email)));

-- ---------------------------------------------------------------------------
-- 3. Immutability trigger for customer_identity_promotions
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.enforce_promotions_immutable()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'customer_identity_promotions is append-only: UPDATE and DELETE operations are denied.';
END;
$$;

DROP TRIGGER IF EXISTS trg_customer_identity_promotions_immutable ON public.customer_identity_promotions;
CREATE TRIGGER trg_customer_identity_promotions_immutable
  BEFORE UPDATE OR DELETE ON public.customer_identity_promotions
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_promotions_immutable();

-- ---------------------------------------------------------------------------
-- 4. Helper to validate allowed (provider, identity_type) pairs
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_valid_provider_identity_pair(
  p_provider TEXT,
  p_identity_type TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  RETURN CASE
    WHEN p_provider = 'stripe' AND p_identity_type IN ('customer_id', 'subscription_id', 'invoice_customer_id', 'person_email', 'email_address') THEN TRUE
    WHEN p_provider = 'posthog' AND p_identity_type IN ('distinct_id', 'person_email') THEN TRUE
    WHEN p_provider = 'gmail' AND p_identity_type IN ('person_email', 'email_address', 'gmail_thread_id') THEN TRUE
    WHEN p_provider = 'intercom' AND p_identity_type IN ('contact_id', 'person_email', 'email_address') THEN TRUE
    WHEN p_provider = 'hubspot' AND p_identity_type IN ('hubspot_contact_id', 'hubspot_company_id', 'person_email', 'email_address') THEN TRUE
    WHEN p_provider = 'email' AND p_identity_type IN ('email_address', 'person_email') THEN TRUE
    ELSE FALSE
  END;
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. link_provider_identity_safely (Hardened)
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
  -- 1. Input validation & strict pair checking
  IF p_workspace_id IS NULL OR p_customer_account_id IS NULL OR p_provider IS NULL 
     OR p_identity_type IS NULL OR p_normalized_external_id IS NULL OR trim(p_normalized_external_id) = '' THEN
    RETURN jsonb_build_object(
      'status', 'error',
      'error', 'Missing required parameter for provider identity linking'
    );
  END IF;

  IF NOT public.is_valid_provider_identity_pair(p_provider, p_identity_type) THEN
    RETURN jsonb_build_object(
      'status', 'error',
      'error', 'Invalid provider/identity_type pair: ' || p_provider || '/' || p_identity_type
    );
  END IF;

  IF p_verification_status NOT IN ('verified', 'inferred', 'unmapped') THEN
    RETURN jsonb_build_object(
      'status', 'error',
      'error', 'Invalid verification_status: ' || COALESCE(p_verification_status, 'NULL')
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
      normalized_external_id,
      is_primary,
      verification_status,
      source,
      scenario_id,
      scenario_run_id,
      metadata,
      is_provisional,
      first_seen_at,
      last_seen_at
    )
    VALUES (
      p_workspace_id,
      p_customer_account_id,
      p_provider,
      p_identity_type,
      p_normalized_external_id,
      COALESCE(p_is_primary, FALSE),
      COALESCE(p_verification_status, 'inferred'),
      p_source,
      p_scenario_id,
      p_scenario_run_id,
      COALESCE(p_metadata, '{}'::JSONB),
      COALESCE(p_is_provisional, FALSE),
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
    -- 5. Same account -> Update timestamp, metadata, and upgrade status if stronger
    IF v_existing.verification_status = 'verified' THEN
      v_new_status := 'verified';
    ELSIF p_verification_status = 'verified' THEN
      v_new_status := 'verified';
    ELSE
      v_new_status := v_existing.verification_status;
    END IF;

    UPDATE public.provider_identities
    SET
      last_seen_at = v_now,
      verification_status = v_new_status,
      is_primary = CASE WHEN p_is_primary IS TRUE THEN TRUE ELSE provider_identities.is_primary END,
      is_provisional = CASE WHEN v_new_status = 'verified' THEN FALSE ELSE provider_identities.is_provisional END,
      metadata = COALESCE(provider_identities.metadata, '{}'::JSONB) || COALESCE(p_metadata, '{}'::JSONB)
    WHERE id = v_existing.id;

    RETURN jsonb_build_object(
      'status', 'ok',
      'accountId', p_customer_account_id,
      'created', FALSE,
      'verificationStatus', v_new_status
    );

  ELSE
    -- 6. Different account -> Conflict: Refuse reassignment and record/update conflict row
    v_reason := 'Provider identity ' || p_provider || ':' || p_identity_type || ':' || p_normalized_external_id ||
      ' is already claimed by account ' || v_existing.customer_account_id::TEXT ||
      ' with status ' || v_existing.verification_status ||
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
      created_at,
      last_seen_at,
      occurrence_count
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
      v_now,
      v_now,
      1
    )
    ON CONFLICT (workspace_id, provider, identity_type, normalized_external_id, candidate_account_id) WHERE status = 'pending'
    DO UPDATE SET
      last_seen_at = v_now,
      occurrence_count = public.identity_conflicts.occurrence_count + 1,
      reason = EXCLUDED.reason
    RETURNING id INTO v_conflict_id;

    RETURN jsonb_build_object(
      'status', 'conflict',
      'conflictId', v_conflict_id,
      'existingAccountId', v_existing.customer_account_id,
      'candidateAccountId', p_customer_account_id,
      'reason', v_reason
    );
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 6. link_account_contact_safely (Hardened)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.link_account_contact_safely(
  p_workspace_id UUID,
  p_customer_account_id UUID,
  p_email TEXT,
  p_name TEXT DEFAULT NULL,
  p_role TEXT DEFAULT 'billing',
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
  v_has_verified_email_identity BOOLEAN := FALSE;
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

  -- 3. Check if exact verified email identity exists for this account
  SELECT EXISTS (
    SELECT 1 FROM public.provider_identities
    WHERE workspace_id = p_workspace_id
      AND customer_account_id = p_customer_account_id
      AND identity_type IN ('person_email', 'email_address')
      AND normalized_external_id = v_normalized_email
      AND verification_status = 'verified'
  ) INTO v_has_verified_email_identity;

  -- 4. Lock and read existing contact for (workspace_id, email)
  SELECT id, customer_account_id, external_ids, is_primary, name, role, is_provisional
  INTO v_existing
  FROM public.account_contacts
  WHERE workspace_id = p_workspace_id
    AND lower(trim(email)) = v_normalized_email
  FOR UPDATE;

  IF v_existing IS NULL THEN
    -- 5. Absent -> Insert new contact
    -- If account is provisional or no verified email evidence, contact must remain provisional
    v_next_provisional := CASE
      WHEN v_account.is_provisional IS TRUE THEN TRUE
      WHEN v_has_verified_email_identity IS TRUE THEN FALSE
      ELSE COALESCE(p_is_provisional, FALSE)
    END;

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
      v_next_provisional,
      v_now,
      v_now
    );

    RETURN jsonb_build_object(
      'status', 'ok',
      'accountId', p_customer_account_id,
      'created', TRUE,
      'isProvisional', v_next_provisional
    );

  ELSIF v_existing.customer_account_id = p_customer_account_id THEN
    -- 6. Same account -> Safe enrichment and promotion
    -- Contact promotion from provisional -> false strictly requires verified email evidence
    IF v_existing.is_provisional IS TRUE AND (v_has_verified_email_identity IS TRUE OR (p_is_provisional IS FALSE AND v_account.is_provisional IS FALSE AND p_source = 'stripe_sync')) THEN
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
    -- 7. Different account -> Record conflict and refuse to move contact
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
      created_at,
      last_seen_at,
      occurrence_count
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
      v_now,
      v_now,
      1
    )
    ON CONFLICT (workspace_id, provider, identity_type, normalized_external_id, candidate_account_id) WHERE status = 'pending'
    DO UPDATE SET
      last_seen_at = v_now,
      occurrence_count = public.identity_conflicts.occurrence_count + 1,
      reason = EXCLUDED.reason
    RETURNING id INTO v_conflict_id;

    RETURN jsonb_build_object(
      'status', 'conflict',
      'conflictId', v_conflict_id,
      'existingAccountId', v_existing.customer_account_id,
      'candidateAccountId', p_customer_account_id,
      'reason', v_reason
    );
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 7. promote_customer_identity_safely (Hardened)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.promote_customer_identity_safely(
  p_workspace_id UUID,
  p_customer_account_id UUID,
  p_source TEXT,
  p_evidence JSONB DEFAULT '{}'::JSONB,
  p_actor TEXT DEFAULT 'service_role',
  p_scenario_id TEXT DEFAULT NULL,
  p_scenario_run_id TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_account RECORD;
  v_promotion_id UUID;
  v_now TIMESTAMPTZ := now();
  v_lock_key BIGINT;
  v_provider TEXT;
  v_identity_type TEXT;
  v_normalized_external_id TEXT;
  v_promoted_contacts INTEGER := 0;
BEGIN
  -- 1. Input validation
  IF p_workspace_id IS NULL OR p_customer_account_id IS NULL OR p_source IS NULL THEN
    RETURN jsonb_build_object(
      'status', 'error',
      'error', 'Missing required parameter for customer identity promotion'
    );
  END IF;

  -- 2. Advisory lock on account for concurrency safety
  v_lock_key := ('x' || substr(md5(p_workspace_id::TEXT || ':account:' || p_customer_account_id::TEXT), 1, 16))::BIT(64)::BIGINT;
  PERFORM pg_advisory_xact_lock(v_lock_key);

  -- 3. Verify account exists in workspace
  SELECT id, workspace_id, is_provisional, name
  INTO v_account
  FROM public.customer_accounts
  WHERE id = p_customer_account_id AND workspace_id = p_workspace_id
  FOR UPDATE;

  IF v_account IS NULL THEN
    RETURN jsonb_build_object(
      'status', 'error',
      'error', 'Customer account ' || p_customer_account_id::TEXT || ' not found in workspace ' || p_workspace_id::TEXT
    );
  END IF;

  -- Determine provider & external ID from evidence
  v_provider := COALESCE(p_evidence->>'provider', 'stripe');
  v_identity_type := COALESCE(p_evidence->>'identity_type', 'customer_id');
  v_normalized_external_id := COALESCE(
    p_evidence->>'stripe_customer_id',
    p_evidence->>'external_id',
    p_evidence->>'distinct_id',
    p_customer_account_id::TEXT
  );

  -- 4. Promote customer_accounts row
  UPDATE public.customer_accounts
  SET is_provisional = FALSE
  WHERE id = p_customer_account_id;

  -- 5. Promote linked provider identities that now have verified status
  UPDATE public.provider_identities
  SET is_provisional = FALSE
  WHERE workspace_id = p_workspace_id
    AND customer_account_id = p_customer_account_id
    AND verification_status = 'verified';

  -- 6. Promote contacts only if backed by exact verified email identity
  WITH verified_emails AS (
    SELECT normalized_external_id
    FROM public.provider_identities
    WHERE workspace_id = p_workspace_id
      AND customer_account_id = p_customer_account_id
      AND identity_type IN ('person_email', 'email_address')
      AND verification_status = 'verified'
  ),
  updated_c AS (
    UPDATE public.account_contacts
    SET is_provisional = FALSE,
        updated_at = v_now
    WHERE workspace_id = p_workspace_id
      AND customer_account_id = p_customer_account_id
      AND lower(trim(email)) IN (SELECT normalized_external_id FROM verified_emails)
    RETURNING id
  )
  SELECT count(*) INTO v_promoted_contacts FROM updated_c;

  -- 7. Insert immutable audit trail row
  INSERT INTO public.customer_identity_promotions (
    workspace_id,
    customer_account_id,
    provider,
    identity_type,
    normalized_external_id,
    source,
    evidence,
    actor,
    scenario_id,
    scenario_run_id,
    created_at
  )
  VALUES (
    p_workspace_id,
    p_customer_account_id,
    v_provider,
    v_identity_type,
    v_normalized_external_id,
    p_source,
    COALESCE(p_evidence, '{}'::JSONB),
    COALESCE(p_actor, 'service_role'),
    p_scenario_id,
    p_scenario_run_id,
    v_now
  )
  RETURNING id INTO v_promotion_id;

  RETURN jsonb_build_object(
    'status', 'ok',
    'customerAccountId', p_customer_account_id,
    'promotionId', v_promotion_id,
    'promotedContacts', v_promoted_contacts
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 8. Restrict privileges exclusively to service_role
-- ---------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.link_provider_identity_safely FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.link_provider_identity_safely TO service_role;

REVOKE ALL ON FUNCTION public.link_account_contact_safely FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.link_account_contact_safely TO service_role;

REVOKE ALL ON FUNCTION public.promote_customer_identity_safely FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.promote_customer_identity_safely TO service_role;
