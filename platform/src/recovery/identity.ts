import { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import {
  IdentityType,
  IdentityResolutionResult,
  Provider,
  SyncIdentityResult,
  PromoteIdentityResult,
  ScenarioResolutionMetadata,
  VerificationStatus,
} from './types';
export type {
  IdentityType,
  IdentityResolutionResult,
  Provider,
  SyncIdentityResult,
  PromoteIdentityResult,
  ScenarioResolutionMetadata,
  VerificationStatus,
};
import { RECOVERY_CONFIG } from './config';

// ---------------------------------------------------------------------------
// Schemas for RPC Responses
// ---------------------------------------------------------------------------

export const IdentityWriteResultSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('ok'),
    accountId: z.string(),
    created: z.boolean().optional(),
    verificationStatus: z.enum(['verified', 'inferred', 'conflict', 'revoked']).optional(),
    isProvisional: z.boolean().optional(),
  }),
  z.object({
    status: z.literal('conflict'),
    conflictId: z.string(),
    existingAccountId: z.string().optional(),
    candidateAccountId: z.string().optional(),
    reason: z.string(),
  }),
  z.object({
    status: z.literal('error'),
    error: z.string(),
  }),
]);

export const ContactLinkResultSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('ok'),
    accountId: z.string(),
    created: z.boolean().optional(),
    isProvisional: z.boolean().optional(),
  }),
  z.object({
    status: z.literal('conflict'),
    conflictId: z.string(),
    existingAccountId: z.string().optional(),
    candidateAccountId: z.string().optional(),
    reason: z.string(),
  }),
  z.object({
    status: z.literal('error'),
    error: z.string(),
  }),
]);

export const PromoteIdentityResultSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('ok'),
    accountId: z.string(),
    promoted: z.boolean(),
    auditId: z.string().optional(),
  }),
  z.object({
    status: z.literal('conflict'),
    conflictId: z.string().optional(),
    reason: z.string(),
  }),
  z.object({
    status: z.literal('error'),
    error: z.string(),
  }),
]);

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
  // Intercom contact_id, HubSpot contact/company IDs) are preserved exactly as returned by the provider.
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
     * active recovery_scenario_runs record exists in the database.
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
  //    active recovery_scenario_runs row in the same workspace.
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
        const candidateAccId = distinctVerifiedAccountIds[0];
        const { data: accRow } = await supabase
          .from('customer_accounts')
          .select('is_provisional')
          .eq('id', candidateAccId)
          .eq('workspace_id', params.workspaceId)
          .maybeSingle();

        if (accRow && accRow.is_provisional !== true) {
          return {
            status: 'verified',
            customerAccountId: candidateAccId,
            confidence: RECOVERY_CONFIG.VERIFIED_EMAIL_CONFIDENCE,
            matchType: 'exact_unique_verified_email',
            matchedIdentity: candidateEmail,
          };
        } else {
          return {
            status: 'inferred',
            customerAccountId: candidateAccId,
            confidence: 0.6,
            matchType: 'exact_provisional_email',
            matchedIdentity: candidateEmail,
          };
        }
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
 * - Same key but DIFFERENT account -> writes a deterministic conflict row to `identity_conflicts`,
 *   returns { status: 'conflict' }. The existing row is NOT modified.
 * - New row -> insert with advisory lock protection against concurrent first claims.
 * - Non-atomic fallback is strictly prohibited in production; errors fail closed.
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

  try {
    if (typeof supabase.rpc !== 'function') {
      return { status: 'error', error: 'supabase.rpc function is unavailable' };
    }

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

    if (rpcError) {
      return { status: 'error', error: `RPC link_provider_identity_safely error: ${rpcError.message}` };
    }

    const parsed = IdentityWriteResultSchema.safeParse(rpcResult);
    if (!parsed.success) {
      return { status: 'error', error: `Malformed RPC output: ${parsed.error.message}` };
    }

    return parsed.data;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { status: 'error', error: message };
  }
}

// ---------------------------------------------------------------------------
// linkContactSafely — atomic transactional contact linking
// ---------------------------------------------------------------------------

/**
 * Persists an account contact using atomic PostgreSQL RPC.
 *
 * Safety contract:
 * - Same workspace + normalized email AND same account -> safe enrichment and promotion.
 * - Same workspace + normalized email AND DIFFERENT account -> writes conflict row, returns { status: 'conflict' }.
 * - Non-authoritative sources (intercom_sync, posthog_sync, gmail_bootstrap, hubspot_sync) NEVER set is_primary = true.
 * - Non-atomic fallback is strictly prohibited in production; errors fail closed.
 */
export async function linkContactSafely(
  supabase: SupabaseClient,
  contact: {
    workspaceId: string;
    customerAccountId: string;
    email: string;
    name?: string | null;
    role?: string | null;
    isPrimary?: boolean;
    externalIds?: Record<string, unknown>;
    source: string;
    isProvisional?: boolean;
  }
): Promise<SyncIdentityResult> {
  const normalizedEmail = normalizeExternalId(contact.email, 'email_address');
  if (!normalizedEmail || !normalizedEmail.includes('@')) {
    return { status: 'error', error: `Invalid email address format: ${contact.email}` };
  }

  try {
    if (typeof supabase.rpc !== 'function') {
      return { status: 'error', error: 'supabase.rpc function is unavailable' };
    }

    const { data: rpcResult, error: rpcError } = await supabase.rpc('link_account_contact_safely', {
      p_workspace_id: contact.workspaceId,
      p_customer_account_id: contact.customerAccountId,
      p_email: normalizedEmail,
      p_name: contact.name ?? null,
      p_role: contact.role ?? null,
      p_is_primary: contact.isPrimary ?? false,
      p_external_ids: contact.externalIds ?? {},
      p_source: contact.source,
      p_is_provisional: contact.isProvisional ?? false,
    });

    if (rpcError) {
      return { status: 'error', error: `RPC link_account_contact_safely error: ${rpcError.message}` };
    }

    const parsed = ContactLinkResultSchema.safeParse(rpcResult);
    if (!parsed.success) {
      return { status: 'error', error: `Malformed RPC output: ${parsed.error.message}` };
    }

    return parsed.data;
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
 * Writes an immutable audit row in customer_identity_promotions.
 */
export async function promoteCustomerIdentitySafely(
  supabase: SupabaseClient,
  params: {
    workspaceId: string;
    customerAccountId: string;
    source: string;
    evidence: Record<string, unknown>;
  }
): Promise<PromoteIdentityResult> {
  try {
    if (typeof supabase.rpc !== 'function') {
      return { status: 'error', error: 'supabase.rpc function is unavailable' };
    }

    const { data: rpcResult, error: rpcError } = await supabase.rpc('promote_customer_identity_safely', {
      p_workspace_id: params.workspaceId,
      p_customer_account_id: params.customerAccountId,
      p_source: params.source,
      p_evidence: params.evidence ?? {},
    });

    if (rpcError) {
      return { status: 'error', error: `RPC promote_customer_identity_safely error: ${rpcError.message}` };
    }

    const parsed = PromoteIdentityResultSchema.safeParse(rpcResult);
    if (!parsed.success) {
      return { status: 'error', error: `Malformed RPC output: ${parsed.error.message}` };
    }

    return parsed.data;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { status: 'error', error: message };
  }
}
