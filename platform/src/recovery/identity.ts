import { SupabaseClient } from '@supabase/supabase-js';
import { IdentityType, IdentityResolutionResult, Provider, SyncIdentityResult } from './types';
export type { IdentityType, IdentityResolutionResult, Provider, SyncIdentityResult };
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
     * provider_identities row with the given scenario_id exists in the database.
     * It is never trusted blindly.
     */
    scenarioMetadata?: { customerAccountId?: string; scenarioId?: string };
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

  // 2. Scenario metadata bypass — only in TEST_MODE, and only when there is a matching
  //    provider_identities row with the given scenario_id (no blind trust).
  if (
    RECOVERY_CONFIG.TEST_MODE &&
    params.scenarioMetadata?.customerAccountId &&
    params.scenarioMetadata?.scenarioId
  ) {
    const { data: scenarioRow } = await supabase
      .from('provider_identities')
      .select('customer_account_id')
      .eq('workspace_id', params.workspaceId)
      .eq('customer_account_id', params.scenarioMetadata.customerAccountId)
      .eq('scenario_id', params.scenarioMetadata.scenarioId)
      .eq('provider', params.provider)
      .maybeSingle();

    if (scenarioRow) {
      return {
        status: 'verified',
        customerAccountId: scenarioRow.customer_account_id,
        confidence: 0.95,
        matchType: 'trusted_scenario_metadata',
        matchedIdentity: normalizedId,
      };
    }
  }

  // 3. Exact normalized email lookup against account_contacts.
  //    Use .eq() (not .ilike()) because normalizeExternalId already lowercases emails,
  //    and ilike performs pattern matching that can match substrings.
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
// upsertProviderIdentity — conflict-aware write-path
// ---------------------------------------------------------------------------

/**
 * Persists a provider identity to `provider_identities`.
 *
 * Safety contract:
 * - Same workspace + provider + identity_type + normalized_external_id AND same account → safe
 *   update (last_seen_at, metadata only).
 * - Same key but DIFFERENT account → writes a conflict row to `identity_conflicts`, returns
 *   { status: 'conflict' }. The existing row is NOT modified.
 * - New row → insert.
 *
 * Never silently reassigns a provider identity to a different account.
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
  }
): Promise<SyncIdentityResult> {
  const normalizedExternalId = normalizeExternalId(identity.externalId, identity.identityType);
  const now = new Date().toISOString();

  try {
    // 1. Read any existing row for this unique key
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
      // 2a. Same account — safe to update last_seen_at and metadata
      if (existing.customer_account_id === identity.customerAccountId) {
        const { error: updateError } = await supabase
          .from('provider_identities')
          .update({
            last_seen_at: now,
            updated_at: now,
            metadata: { ...(identity.metadata ?? {}) },
            // Only escalate verification_status, never downgrade
            ...(
              identity.verificationStatus === 'verified' &&
              existing.verification_status !== 'verified'
                ? { verification_status: 'verified' }
                : {}
            ),
          })
          .eq('id', existing.id);

        if (updateError) {
          return { status: 'error', error: `Update failed: ${updateError.message}` };
        }
        return { status: 'ok' };
      }

      // 2b. Different account — record conflict, do NOT reassign
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
        // Non-fatal: log but don't throw — we already know not to reassign
        console.error('[identity] failed to write conflict row:', conflictError.message);
        return { status: 'conflict', conflictId: 'unknown', reason };
      }

      return { status: 'conflict', conflictId: conflictRow.id, reason };
    }

    // 3. New row — insert
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
      first_seen_at: now,
      last_seen_at: now,
      created_at: now,
      updated_at: now,
    });

    if (insertError) {
      return { status: 'error', error: `Insert failed: ${insertError.message}` };
    }

    return { status: 'ok' };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { status: 'error', error: message };
  }
}

// ---------------------------------------------------------------------------
// linkContactSafely — conflict-aware account_contacts write-path
// ---------------------------------------------------------------------------

/**
 * Links an email address to a customer account in account_contacts.
 *
 * Safety contract:
 * - Email absent → insert new contact row.
 * - Email present + same account → enrich (update external_ids, name, role).
 * - Email present + DIFFERENT account → write conflict row, return { status: 'conflict' }.
 *   The existing contact is NOT moved.
 *
 * Never silently reassigns a contact email to a different account.
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
    // 1. Read existing contact for this workspace + email
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
      // 2a. Same account — safe to enrich
      if (existing.customer_account_id === contact.customerAccountId) {
        const mergedExternalIds = {
          ...(existing.external_ids ?? {}),
          ...(contact.externalIds ?? {}),
        };

        // Explicit promotion rule (§do.md §7):
        // Provisional contacts (is_provisional = true) can only be promoted to verified (is_provisional = false)
        // when confirmed by a direct API provider sync with authority (e.g. stripe_sync).
        // Never promote because of a name/domain guess.
        const canPromote =
          existing.is_provisional === true &&
          contact.isProvisional === false &&
          contact.source === 'stripe_sync';

        const nextProvisionalState = canPromote
          ? false
          : existing.is_provisional === false
          ? false
          : (contact.isProvisional ?? true);

        const { error: updateError } = await supabase
          .from('account_contacts')
          .update({
            external_ids: mergedExternalIds,
            ...(contact.name ? { name: contact.name } : {}),
            ...(contact.role ? { role: contact.role } : {}),
            is_provisional: nextProvisionalState,
            updated_at: now,
          })
          .eq('id', existing.id);

        if (updateError) {
          return { status: 'error', error: `Contact update failed: ${updateError.message}` };
        }
        return { status: 'ok' };
      }

      // 2b. Different account — record conflict, do NOT move the contact
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
        return { status: 'conflict', conflictId: 'unknown', reason };
      }

      return { status: 'conflict', conflictId: conflictRow.id, reason };
    }

    // 3. No existing row — insert
    const { error: insertError } = await supabase.from('account_contacts').insert({
      workspace_id: contact.workspaceId,
      customer_account_id: contact.customerAccountId,
      email: normalizedEmail,
      name: contact.name ?? null,
      role: contact.role ?? 'billing',
      is_primary: contact.isPrimary ?? false,
      external_ids: contact.externalIds ?? {},
      is_provisional: contact.isProvisional ?? false,
      created_at: now,
      updated_at: now,
    });

    if (insertError) {
      return { status: 'error', error: `Contact insert failed: ${insertError.message}` };
    }

    return { status: 'ok' };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { status: 'error', error: message };
  }
}
