import { SupabaseClient } from '@supabase/supabase-js';
import { IdentityType, IdentityResolutionResult, Provider } from './types';
import { RECOVERY_CONFIG } from './config';

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

  if (type === 'person_email' || type === 'email_address') {
    return trimmed.toLowerCase();
  }

  // Stripe and PostHog and Gmail Thread IDs preserved
  return trimmed;
}

export async function resolveAccountIdentity(
  supabase: SupabaseClient,
  params: {
    workspaceId: string;
    provider: Provider;
    identityType: IdentityType;
    externalId: string;
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

  // 2. Exact cross-provider identity from trusted test scenario metadata
  if (params.scenarioMetadata?.customerAccountId) {
    return {
      status: 'verified',
      customerAccountId: params.scenarioMetadata.customerAccountId,
      confidence: 0.95,
      matchType: 'trusted_scenario_metadata',
      matchedIdentity: normalizedId,
    };
  }

  // 3. Exact normalized email lookup against account_contacts
  const candidateEmail =
    params.identityType === 'person_email' || params.identityType === 'email_address'
      ? normalizedId
      : params.fallbackEmail
      ? normalizeExternalId(params.fallbackEmail, 'email_address')
      : null;

  if (candidateEmail) {
    const { data: contactMatches, error: contactError } = await supabase
      .from('account_contacts')
      .select('customer_account_id, email')
      .eq('workspace_id', params.workspaceId)
      .ilike('email', candidateEmail);

    if (!contactError && contactMatches && contactMatches.length > 0) {
      const distinctAccountIds = Array.from(new Set(contactMatches.map((c) => c.customer_account_id)));
      if (distinctAccountIds.length === 1) {
        return {
          status: 'verified',
          customerAccountId: distinctAccountIds[0],
          confidence: RECOVERY_CONFIG.VERIFIED_EMAIL_CONFIDENCE,
          matchType: 'exact_unique_verified_email',
          matchedIdentity: candidateEmail,
        };
      }
      if (distinctAccountIds.length > 1) {
        return {
          status: 'conflict',
          customerAccountId: null,
          confidence: 0.0,
          matchType: 'ambiguous_email_multiple_accounts',
          matchedIdentity: candidateEmail,
          candidateAccountIds: distinctAccountIds,
          conflictReason: `Email ${candidateEmail} matches ${distinctAccountIds.length} accounts`,
        };
      }
    }
  }

  // 4. Unmapped state
  return {
    status: 'unmapped',
    customerAccountId: null,
    confidence: 0.0,
    matchType: 'no_match',
    matchedIdentity: normalizedId,
  };
}

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
  }
): Promise<void> {
  const normalizedExternalId = normalizeExternalId(identity.externalId, identity.identityType);
  const now = new Date().toISOString();

  await supabase.from('provider_identities').upsert(
    {
      workspace_id: identity.workspaceId,
      customer_account_id: identity.customerAccountId,
      provider: identity.provider,
      identity_type: identity.identityType,
      external_id: identity.externalId,
      normalized_external_id: normalizedExternalId,
      is_primary: identity.isPrimary ?? false,
      verification_status: identity.verificationStatus ?? 'verified',
      source: identity.source,
      metadata: identity.metadata ?? {},
      last_seen_at: now,
      updated_at: now,
    },
    {
      onConflict: 'workspace_id,provider,identity_type,normalized_external_id',
    }
  );
}
