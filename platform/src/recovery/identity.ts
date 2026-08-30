import { SupabaseClient } from '@supabase/supabase-js';
import {
  IdentityType,
  IdentityResolutionResult,
  Provider,
  SyncIdentityResult,
  PromoteIdentityResult,
  ScenarioResolutionMetadata,
} from './types';
export type {
  IdentityType,
  IdentityResolutionResult,
  Provider,
  SyncIdentityResult,
  PromoteIdentityResult,
  ScenarioResolutionMetadata,
};
import { RECOVERY_CONFIG } from './config';

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

export function normalizeExternalId(id: string, type: IdentityType): string {
  if (!id || typeof id !== 'string') {
    throw new Error('External ID must be a non-empty string');
  }
  const trimmed = id.trim();
  if (!trimmed) {
    throw new Error('External ID cannot be blank');
  }
  if (trimmed.length > RECOVERY_CONFIG.MAX_EXTERNAL_ID_LENGTH) {
    throw new Error(`External ID exceeds maximum length of ${RECOVERY_CONFIG.MAX_EXTERNAL_ID_LENGTH}`);
  }

  // Emails are lowercased; all other IDs (Stripe cus_…, PostHog distinct_id, Gmail thread_id,
  // Intercom contact_id) are preserved exactly as returned by the provider.
  if (type === 'person_email' || type === 'email_address') {
    return trimmed.toLowerCase();
  }

  return trimmed;
}

// ---------------------------------------------------------------------------
// Identity resolution (read-path)
// ---------------------------------------------------------------------------

export async function resolveAccountIdentity(
  supabase: SupabaseClient,
  params: {
    workspaceId: string;
    provider: Provider;
    identityType: IdentityType;
    externalId: string;
    /**
     * scenarioMetadata is only honoured when RECOVERY_CONFIG.TEST_MODE is true AND a matching
     * active recovery_scenario_runs record and matching row exist in the database.
     * It is never trusted blindly in production or across workspaces.
     */
    scenarioMetadata?: ScenarioResolutionMetadata;
    fallbackEmail?: string | null;
  }
): Promise<IdentityResolutionResult> {
  const normalizedId = normalizeExternalId(params.externalId, params.identityType);

  // 1. Exact verified provider identity from provider_identities table
  const { data: directMatches, error: directError } = await supabase
    .from('provider_identities')
    .select('customer_account_id, verification_status')
    .eq('workspace_id', params.workspaceId)
    .eq('provider', params.provider)
    .eq('identity_type', params.identityType)
    .eq('normalized_external_id', normalizedId);

  if (!directError && directMatches && directMatches.length > 0) {
    const verified = directMatches.filter((m) => m.verification_status === 'verified');
    if (verified.length === 1) {
      return {
        status: 'verified',
        customerAccountId: verified[0].customer_account_id,
        confidence: RECOVERY_CONFIG.PROVIDER_ID_CONFIDENCE,
        matchType: 'exact_verified_provider_id',
        matchedIdentity: normalizedId,
      };
    }
    if (verified.length > 1) {
      return {
        status: 'conflict',
        customerAccountId: null,
        confidence: 0.0,
        matchType: 'conflicting_provider_id',
        matchedIdentity: normalizedId,
        candidateAccountIds: verified.map((v) => v.customer_account_id),
        conflictReason: 'Provider ID mapped to multiple distinct accounts',
      };
    }
  }

  // 2. Scenario metadata bypass — only in TEST_MODE, and only when there is a valid,
  //    active recovery_scenario_runs row in the same workspace AND matching DB row.
  if (
    RECOVERY_CONFIG.TEST_MODE &&
    params.scenarioMetadata?.scenarioId
  ) {
    const scenarioId = params.scenarioMetadata.scenarioId;
    const scenarioRunId = params.scenarioMetadata.scenarioRunId;

    if (scenarioRunId) {
      const { data: runRow } = await supabase
        .from('recovery_scenario_runs')
        .select('id, status, test_mode')
        .eq('id', scenarioRunId)
        .eq('workspace_id', params.workspaceId)
        .eq('test_mode', true)
        .eq('status', 'active')
        .maybeSingle();

      if (runRow) {
        // Query provider_identities row for this scenario + scenario_run
        const { data: scenarioIdentity } = await supabase
          .from('provider_identities')
          .select('customer_account_id')
          .eq('workspace_id', params.workspaceId)
          .eq('scenario_id', scenarioId)
          .eq('scenario_run_id', scenarioRunId)
          .eq('provider', params.provider)
          .maybeSingle();

        if (scenarioIdentity) {
          return {
            status: 'verified',
            customerAccountId: scenarioIdentity.customer_account_id,
            confidence: 0.95,
            matchType: 'trusted_scenario_metadata',
            matchedIdentity: normalizedId,
            scenarioRunId,
          };
        }

        // Check if customer_accounts exists for this scenario run
        if (params.scenarioMetadata.customerAccountId) {
          const { data: scenarioAccount } = await supabase
            .from('customer_accounts')
            .select('id')
            .eq('workspace_id', params.workspaceId)
            .eq('id', params.scenarioMetadata.customerAccountId)
            .eq('scenario_id', scenarioId)
            .eq('scenario_run_id', scenarioRunId)
            .maybeSingle();

          if (scenarioAccount) {
            return {
              status: 'verified',
              customerAccountId: scenarioAccount.id,
              confidence: 0.95,
              matchType: 'trusted_scenario_metadata',
              matchedIdentity: normalizedId,
              scenarioRunId,
            };
          }
        }
      }
    } else if (params.scenarioMetadata.customerAccountId) {
      // Legacy backward compatibility in tests where only customerAccountId + scenarioId were passed
      const { data: legacyRow } = await supabase
        .from('provider_identities')
        .select('customer_account_id')
        .eq('workspace_id', params.workspaceId)
        .eq('customer_account_id', params.scenarioMetadata.customerAccountId)
        .eq('scenario_id', scenarioId)
        .eq('provider', params.provider)
        .maybeSingle();

      if (legacyRow) {
        return {
          status: 'verified',
          customerAccountId: legacyRow.customer_account_id,
          confidence: 0.95,
          matchType: 'trusted_scenario_metadata',
          matchedIdentity: normalizedId,
        };
      }
    }
  }

  // 3. Exact normalized email lookup against account_contacts.
  const candidateEmail =
    params.identityType === 'person_email' || params.identityType === 'email_address'
      ? normalizedId
      : params.fallbackEmail
      ? normalizeExternalId(params.fallbackEmail, 'email_address')
      : null;

  if (candidateEmail) {
    const { data: contactMatches, error: contactError } = await supabase
      .from('account_contacts')
      .select('customer_account_id, email, is_provisional')
      .eq('workspace_id', params.workspaceId)
      .eq('email', candidateEmail);

    if (!contactError && contactMatches && contactMatches.length > 0) {
      // Only non-provisional contacts can produce a verified cross-provider match
      const verifiedContacts = contactMatches.filter((c) => !c.is_provisional);
      const distinctVerifiedAccountIds = Array.from(new Set(verifiedContacts.map((c) => c.customer_account_id)));

      if (distinctVerifiedAccountIds.length === 1) {
        return {
          status: 'verified',
          customerAccountId: distinctVerifiedAccountIds[0],
          confidence: RECOVERY_CONFIG.VERIFIED_EMAIL_CONFIDENCE,
          matchType: 'exact_unique_verified_email',
          matchedIdentity: candidateEmail,
        };
      }
      if (distinctVerifiedAccountIds.length > 1) {
        return {
          status: 'conflict',
          customerAccountId: null,
          confidence: 0.0,
          matchType: 'ambiguous_email_multiple_accounts',
          matchedIdentity: candidateEmail,
          candidateAccountIds: distinctVerifiedAccountIds,
          conflictReason: `Email ${candidateEmail} matches ${distinctVerifiedAccountIds.length} verified accounts`,
        };
      }

      // If matches exist but all are provisional, return inferred (never verified)
      const distinctProvisionalAccountIds = Array.from(new Set(contactMatches.map((c) => c.customer_account_id)));
      if (distinctProvisionalAccountIds.length === 1) {
        return {
          status: 'inferred',
          customerAccountId: distinctProvisionalAccountIds[0],
          confidence: 0.6,
          matchType: 'exact_provisional_email',
          matchedIdentity: candidateEmail,
        };
      }
    }
  }

  // 4. Unmapped
  return {
    status: 'unmapped',
    customerAccountId: null,
    confidence: 0.0,
    matchType: 'no_match',
    matchedIdentity: normalizedId,
  };
}

// ---------------------------------------------------------------------------
// upsertProviderIdentity — atomic transactional write-path
// ---------------------------------------------------------------------------

/**
 * Persists a provider identity to `provider_identities` using atomic PostgreSQL RPC.
 *
 * Safety contract:
 * - Same workspace + provider + identity_type + normalized_external_id AND same account -> safe
 *   enrichment (last_seen_at, metadata). Never downgrades verified to inferred.
 * - Same key but DIFFERENT account -> writes a conflict row to `identity_conflicts`, returns
 *   { status: 'conflict' }. The existing row is NOT modified.
 * - New row -> insert.
 */
export async function upsertProviderIdentity(
  supabase: SupabaseClient,
  identity: {
    workspaceId: string;
    customerAccountId: string;
    provider: Provider;
    identityType: IdentityType;
    externalId: string;
    isPrimary?: boolean;
    verificationStatus?: 'verified' | 'inferred' | 'conflict' | 'revoked';
    source: string;
    metadata?: Record<string, unknown>;
    scenarioId?: string | null;
    scenarioRunId?: string | null;
    isProvisional?: boolean;
  }
): Promise<SyncIdentityResult> {
  const normalizedExternalId = normalizeExternalId(identity.externalId, identity.identityType);
  const now = new Date().toISOString();

  try {
    // 1. Try atomic PostgreSQL RPC first
    if (typeof supabase.rpc === 'function') {
      const { data: rpcResult, error: rpcError } = await supabase.rpc('link_provider_identity_safely', {
        p_workspace_id: identity.workspaceId,
        p_customer_account_id: identity.customerAccountId,
        p_provider: identity.provider,
        p_identity_type: identity.identityType,
        p_normalized_external_id: normalizedExternalId,
        p_is_primary: identity.isPrimary ?? false,
        p_verification_status: identity.verificationStatus ?? 'inferred',
        p_source: identity.source,
        p_scenario_id: identity.scenarioId ?? null,
        p_scenario_run_id: identity.scenarioRunId ?? null,
        p_metadata: identity.metadata ?? {},
        p_is_provisional: identity.isProvisional ?? false,
      });

      if (!rpcError && rpcResult && typeof rpcResult === 'object') {
        const res = rpcResult as {
          status: 'ok' | 'conflict' | 'error';
          accountId?: string;
          created?: boolean;
          verificationStatus?: 'verified' | 'inferred' | 'conflict' | 'revoked';
          conflictId?: string;
          existingAccountId?: string;
          candidateAccountId?: string;
          reason?: string;
          error?: string;
        };

        if (res.status === 'ok') {
          return {
            status: 'ok',
            accountId: res.accountId ?? identity.customerAccountId,
            created: res.created,
            verificationStatus: res.verificationStatus,
          };
        }
        if (res.status === 'conflict') {
          return {
            status: 'conflict',
            conflictId: res.conflictId ?? 'unknown',
            existingAccountId: res.existingAccountId,
            candidateAccountId: res.candidateAccountId ?? identity.customerAccountId,
            reason: res.reason ?? 'Provider identity collision',
          };
        }
        if (res.status === 'error') {
          return { status: 'error', error: res.error ?? 'RPC error' };
        }
      }
    }

    // 2. TypeScript transactional fallback (when RPC is unavailable or in mock test suites)
    const { data: existing, error: readError } = await supabase
      .from('provider_identities')
      .select('id, customer_account_id, verification_status')
      .eq('workspace_id', identity.workspaceId)
      .eq('provider', identity.provider)
      .eq('identity_type', identity.identityType)
      .eq('normalized_external_id', normalizedExternalId)
      .maybeSingle();

    if (readError) {
      return { status: 'error', error: `Read failed: ${readError.message}` };
    }

    if (existing) {
      if (existing.customer_account_id === identity.customerAccountId) {
        const { error: updateError } = await supabase
          .from('provider_identities')
          .update({
            last_seen_at: now,
            updated_at: now,
            metadata: { ...(identity.metadata ?? {}) },
            ...(identity.verificationStatus === 'verified' && existing.verification_status !== 'verified'
              ? { verification_status: 'verified', is_provisional: false }
              : {}),
          })
          .eq('id', existing.id);

        if (updateError) {
          return { status: 'error', error: `Update failed: ${updateError.message}` };
        }
        return {
          status: 'ok',
          accountId: identity.customerAccountId,
          created: false,
          verificationStatus: identity.verificationStatus === 'verified' ? 'verified' : existing.verification_status,
        };
      }

      // Conflict: Different account owns this provider identity
      const reason =
        `Provider ${identity.provider}/${identity.identityType} ` +
        `"${normalizedExternalId}" already belongs to account ${existing.customer_account_id}. ` +
        `Candidate account ${identity.customerAccountId} rejected. Source: ${identity.source}.`;

      console.warn('[identity] conflict detected:', reason);

      const { data: conflictRow, error: conflictError } = await supabase
        .from('identity_conflicts')
        .insert({
          workspace_id: identity.workspaceId,
          provider: identity.provider,
          identity_type: identity.identityType,
          normalized_external_id: normalizedExternalId,
          existing_account_id: existing.customer_account_id,
          candidate_account_id: identity.customerAccountId,
          source: identity.source,
          reason,
          status: 'pending',
          created_at: now,
        })
        .select('id')
        .single();

      if (conflictError) {
        console.error('[identity] failed to write conflict row:', conflictError.message);
        return {
          status: 'conflict',
          conflictId: 'unknown',
          existingAccountId: existing.customer_account_id,
          candidateAccountId: identity.customerAccountId,
          reason,
        };
      }

      return {
        status: 'conflict',
        conflictId: conflictRow.id,
        existingAccountId: existing.customer_account_id,
        candidateAccountId: identity.customerAccountId,
        reason,
      };
    }

    // Insert new row
    const { error: insertError } = await supabase.from('provider_identities').insert({
      workspace_id: identity.workspaceId,
      customer_account_id: identity.customerAccountId,
      provider: identity.provider,
      identity_type: identity.identityType,
      external_id: identity.externalId,
      normalized_external_id: normalizedExternalId,
      is_primary: identity.isPrimary ?? false,
      verification_status: identity.verificationStatus ?? 'inferred',
      source: identity.source,
      metadata: identity.metadata ?? {},
      scenario_id: identity.scenarioId ?? null,
      scenario_run_id: identity.scenarioRunId ?? null,
      is_provisional: identity.isProvisional ?? false,
      first_seen_at: now,
      last_seen_at: now,
      created_at: now,
      updated_at: now,
    });

    if (insertError) {
      return { status: 'error', error: `Insert failed: ${insertError.message}` };
    }

    return {
      status: 'ok',
      accountId: identity.customerAccountId,
      created: true,
      verificationStatus: identity.verificationStatus ?? 'inferred',
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { status: 'error', error: message };
  }
}

// ---------------------------------------------------------------------------
// linkContactSafely — atomic transactional account_contacts write-path
// ---------------------------------------------------------------------------

/**
 * Links an email address to a customer account in account_contacts.
 *
 * Safety contract:
 * - Email absent -> insert new contact row.
 * - Email present + same account -> enrich safely.
 * - Email present + DIFFERENT account -> write conflict row, return { status: 'conflict' }.
 * - Non-authoritative sources (intercom, posthog, gmail_bootstrap) can NEVER set is_primary = true.
 */
export async function linkContactSafely(
  supabase: SupabaseClient,
  contact: {
    workspaceId: string;
    customerAccountId: string;
    email: string;
    name?: string | null;
    role?: string;
    isPrimary?: boolean;
    externalIds?: Record<string, unknown>;
    source: string;
    isProvisional?: boolean;
  }
): Promise<SyncIdentityResult> {
  const normalizedEmail = contact.email.trim().toLowerCase();
  if (!normalizedEmail || !normalizedEmail.includes('@')) {
    return { status: 'error', error: `Invalid email: ${contact.email}` };
  }
  const now = new Date().toISOString();

  try {
    // 1. Try atomic PostgreSQL RPC first
    if (typeof supabase.rpc === 'function') {
      const { data: rpcResult, error: rpcError } = await supabase.rpc('link_account_contact_safely', {
        p_workspace_id: contact.workspaceId,
        p_customer_account_id: contact.customerAccountId,
        p_email: normalizedEmail,
        p_name: contact.name ?? null,
        p_role: contact.role ?? 'billing',
        p_is_primary: contact.isPrimary ?? false,
        p_external_ids: contact.externalIds ?? {},
        p_source: contact.source,
        p_is_provisional: contact.isProvisional ?? false,
      });

      if (!rpcError && rpcResult && typeof rpcResult === 'object') {
        const res = rpcResult as {
          status: 'ok' | 'conflict' | 'error';
          accountId?: string;
          created?: boolean;
          isProvisional?: boolean;
          conflictId?: string;
          existingAccountId?: string;
          candidateAccountId?: string;
          reason?: string;
          error?: string;
        };

        if (res.status === 'ok') {
          return {
            status: 'ok',
            accountId: res.accountId ?? contact.customerAccountId,
            created: res.created,
            isProvisional: res.isProvisional,
          };
        }
        if (res.status === 'conflict') {
          return {
            status: 'conflict',
            conflictId: res.conflictId ?? 'unknown',
            existingAccountId: res.existingAccountId,
            candidateAccountId: res.candidateAccountId ?? contact.customerAccountId,
            reason: res.reason ?? 'Contact email collision',
          };
        }
        if (res.status === 'error') {
          return { status: 'error', error: res.error ?? 'RPC error' };
        }
      }
    }

    // 2. TypeScript fallback
    const { data: existing, error: readError } = await supabase
      .from('account_contacts')
      .select('id, customer_account_id, external_ids, is_primary, name, is_provisional')
      .eq('workspace_id', contact.workspaceId)
      .eq('email', normalizedEmail)
      .maybeSingle();

    if (readError) {
      return { status: 'error', error: `Contact read failed: ${readError.message}` };
    }

    if (existing) {
      if (existing.customer_account_id === contact.customerAccountId) {
        const mergedExternalIds = {
          ...(existing.external_ids ?? {}),
          ...(contact.externalIds ?? {}),
        };

        const canPromote =
          existing.is_provisional === true &&
          contact.isProvisional === false &&
          contact.source === 'stripe_sync';

        const nextProvisionalState = canPromote
          ? false
          : existing.is_provisional === false
          ? false
          : (contact.isProvisional ?? true);

        const isPrimaryAllowed =
          contact.source === 'intercom_sync' || contact.source === 'posthog_sync' || contact.source === 'gmail_bootstrap'
            ? false
            : contact.isPrimary ?? false;

        const { error: updateError } = await supabase
          .from('account_contacts')
          .update({
            external_ids: mergedExternalIds,
            ...(contact.name ? { name: contact.name } : {}),
            ...(contact.role ? { role: contact.role } : {}),
            is_primary: isPrimaryAllowed ? true : existing.is_primary,
            is_provisional: nextProvisionalState,
            updated_at: now,
          })
          .eq('id', existing.id);

        if (updateError) {
          return { status: 'error', error: `Contact update failed: ${updateError.message}` };
        }
        return {
          status: 'ok',
          accountId: contact.customerAccountId,
          created: false,
          isProvisional: nextProvisionalState,
        };
      }

      // Conflict: Contact already belongs to a different account
      const reason =
        `Email "${normalizedEmail}" is already linked to account ${existing.customer_account_id}. ` +
        `Candidate account ${contact.customerAccountId} rejected. Source: ${contact.source}.`;

      console.warn('[identity] contact conflict:', reason);

      const { data: conflictRow, error: conflictError } = await supabase
        .from('identity_conflicts')
        .insert({
          workspace_id: contact.workspaceId,
          provider: 'email' as Provider,
          identity_type: 'email_address' as IdentityType,
          normalized_external_id: normalizedEmail,
          existing_account_id: existing.customer_account_id,
          candidate_account_id: contact.customerAccountId,
          source: contact.source,
          reason,
          status: 'pending',
          created_at: now,
        })
        .select('id')
        .single();

      if (conflictError) {
        console.error('[identity] failed to write contact conflict row:', conflictError.message);
        return {
          status: 'conflict',
          conflictId: 'unknown',
          existingAccountId: existing.customer_account_id,
          candidateAccountId: contact.customerAccountId,
          reason,
        };
      }

      return {
        status: 'conflict',
        conflictId: conflictRow.id,
        existingAccountId: existing.customer_account_id,
        candidateAccountId: contact.customerAccountId,
        reason,
      };
    }

    // Insert new contact
    const isPrimaryAllowed =
      contact.source === 'intercom_sync' || contact.source === 'posthog_sync' || contact.source === 'gmail_bootstrap'
        ? false
        : contact.isPrimary ?? false;

    const { error: insertError } = await supabase.from('account_contacts').insert({
      workspace_id: contact.workspaceId,
      customer_account_id: contact.customerAccountId,
      email: normalizedEmail,
      name: contact.name ?? null,
      role: contact.role ?? 'billing',
      is_primary: isPrimaryAllowed,
      external_ids: contact.externalIds ?? {},
      is_provisional: contact.isProvisional ?? false,
      created_at: now,
      updated_at: now,
    });

    if (insertError) {
      return { status: 'error', error: `Contact insert failed: ${insertError.message}` };
    }

    return {
      status: 'ok',
      accountId: contact.customerAccountId,
      created: true,
      isProvisional: contact.isProvisional ?? false,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { status: 'error', error: message };
  }
}

// ---------------------------------------------------------------------------
// promoteCustomerIdentitySafely — explicit deterministic promotion
// ---------------------------------------------------------------------------

/**
 * Promotes an isolated provisional account and its confirmed contacts/identities
 * to non-provisional canonical status when verified evidence is supplied.
 */
export async function promoteCustomerIdentitySafely(
  supabase: SupabaseClient,
  params: {
    workspaceId: string;
    customerAccountId: string;
    source: string;
    evidence?: Record<string, unknown>;
  }
): Promise<PromoteIdentityResult> {
  const now = new Date().toISOString();

  try {
    // 1. Try atomic PostgreSQL RPC first
    if (typeof supabase.rpc === 'function') {
      const { data: rpcResult, error: rpcError } = await supabase.rpc('promote_customer_identity_safely', {
        p_workspace_id: params.workspaceId,
        p_customer_account_id: params.customerAccountId,
        p_source: params.source,
        p_evidence: params.evidence ?? {},
      });

      if (!rpcError && rpcResult && typeof rpcResult === 'object') {
        const res = rpcResult as { status: 'ok' | 'conflict' | 'error'; accountId?: string; promoted?: boolean; reason?: string; error?: string };
        if (res.status === 'ok') {
          return { status: 'ok', accountId: res.accountId ?? params.customerAccountId, promoted: res.promoted ?? true };
        }
        if (res.status === 'conflict') {
          return { status: 'conflict', reason: res.reason ?? 'Promotion conflict' };
        }
        if (res.status === 'error') {
          return { status: 'error', error: res.error ?? 'Promotion failed' };
        }
      }
    }

    // 2. TypeScript fallback
    const { data: account, error: accError } = await supabase
      .from('customer_accounts')
      .select('id, is_provisional, summary')
      .eq('id', params.customerAccountId)
      .eq('workspace_id', params.workspaceId)
      .single();

    if (accError || !account) {
      return { status: 'error', error: `Account not found: ${accError?.message}` };
    }

    await supabase
      .from('customer_accounts')
      .update({
        is_provisional: false,
        summary: account.summary?.includes('Provisional')
          ? `Account identity confirmed by ${params.source}.`
          : account.summary,
        updated_at: now,
      })
      .eq('id', params.customerAccountId);

    await supabase
      .from('provider_identities')
      .update({ is_provisional: false, updated_at: now })
      .eq('workspace_id', params.workspaceId)
      .eq('customer_account_id', params.customerAccountId)
      .eq('verification_status', 'verified');

    await supabase
      .from('account_contacts')
      .update({ is_provisional: false, updated_at: now })
      .eq('workspace_id', params.workspaceId)
      .eq('customer_account_id', params.customerAccountId)
      .eq('is_primary', true);

    return { status: 'ok', accountId: params.customerAccountId, promoted: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { status: 'error', error: message };
  }
}
