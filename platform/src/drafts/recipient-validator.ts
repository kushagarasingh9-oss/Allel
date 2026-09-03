import { SupabaseClient } from '@supabase/supabase-js';

export type RecipientValidationResult = {
  valid: boolean;
  reason?: string;
  contactId?: string;
  contactName?: string | null;
  isPrimary?: boolean;
};

/**
 * Shared authoritative server-side recipient validator.
 * Used across draft generation, verification, and immediate pre-send execution
 * to guarantee that customer-facing messages can NEVER be dispatched to:
 * - Unverified or provisional email addresses
 * - Contacts belonging to other accounts or workspaces
 * - Provisional or unverified customer accounts
 * - Contacts suppressed by active contact policies
 *
 * Prevents Time-of-Check to Time-of-Use (TOCTOU) security vulnerabilities.
 */
export async function validateSendRecipient(
  supabase: SupabaseClient,
  params: {
    workspaceId: string;
    customerAccountId: string;
    recipientEmail: string;
    requirePrimary?: boolean;
  }
): Promise<RecipientValidationResult> {
  const email = params.recipientEmail?.trim().toLowerCase();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!email || !emailRegex.test(email)) {
    return {
      valid: false,
      reason: `Invalid email address format: "${params.recipientEmail}"`,
    };
  }

  // 1. Check customer account is non-provisional
  let account: { id: string; is_provisional?: boolean } | null = null;
  const accQuery = await supabase
    .from('customer_accounts')
    .select('id, is_provisional')
    .eq('id', params.customerAccountId)
    .eq('workspace_id', params.workspaceId)
    .maybeSingle();

  if (accQuery.error && (accQuery.error as { code?: string }).code === '42703') {
    // Column is_provisional does not exist in this database schema version
    const fallback = await supabase
      .from('customer_accounts')
      .select('id')
      .eq('id', params.customerAccountId)
      .eq('workspace_id', params.workspaceId)
      .maybeSingle();

    if (fallback.error || !fallback.data) {
      return {
        valid: false,
        reason: `Customer account ${params.customerAccountId} not found in workspace ${params.workspaceId}`,
      };
    }
    account = fallback.data;
  } else if (accQuery.error || !accQuery.data) {
    return {
      valid: false,
      reason: `Customer account ${params.customerAccountId} not found in workspace ${params.workspaceId}`,
    };
  } else {
    account = accQuery.data;
  }

  if (account.is_provisional === true) {
    return {
      valid: false,
      reason: `Cannot send communication to provisional account ${params.customerAccountId}. Requires verified canonical identity.`,
    };
  }

  // 2. Check contact exists and belongs to the exact workspace + account
  let contactMatches: Array<{
    id: string;
    name?: string | null;
    is_primary?: boolean | null;
    is_provisional?: boolean | null;
    external_ids?: unknown;
  }> | null = null;

  const contactQuery = await supabase
    .from('account_contacts')
    .select('id, name, is_primary, is_provisional, external_ids')
    .eq('workspace_id', params.workspaceId)
    .eq('customer_account_id', params.customerAccountId)
    .eq('email', email);

  if (contactQuery.error && (contactQuery.error as { code?: string }).code === '42703') {
    // Column is_provisional does not exist in this database schema version
    const fallback = await supabase
      .from('account_contacts')
      .select('id, name, is_primary, external_ids')
      .eq('workspace_id', params.workspaceId)
      .eq('customer_account_id', params.customerAccountId)
      .eq('email', email);

    if (fallback.error) {
      return {
        valid: false,
        reason: `Failed to query account contact: ${fallback.error.message}`,
      };
    }
    contactMatches = fallback.data;
  } else if (contactQuery.error) {
    return {
      valid: false,
      reason: `Failed to query account contact: ${contactQuery.error.message}`,
    };
  } else {
    contactMatches = contactQuery.data;
  }

  if (!contactMatches || contactMatches.length === 0) {
    return {
      valid: false,
      reason: `Recipient email "${email}" is not linked to customer account ${params.customerAccountId}`,
    };
  }

  if (contactMatches.length > 1) {
    return {
      valid: false,
      reason: `Ambiguous contact: multiple contact rows found for email "${email}" on account ${params.customerAccountId}`,
    };
  }

  const contact = contactMatches[0];

  // 3. Enforce that contact must NOT be provisional
  if (contact.is_provisional === true) {
    return {
      valid: false,
      reason: `Recipient contact "${email}" is provisional. Communications require a verified contact.`,
    };
  }

  // 4. Enforce that recipient email is backed by verified email identity proof
  const { data: verifiedEmailIdentities, error: idError } = await supabase
    .from('provider_identities')
    .select('id, provider, verification_status')
    .eq('workspace_id', params.workspaceId)
    .eq('customer_account_id', params.customerAccountId)
    .in('identity_type', ['person_email', 'email_address'])
    .eq('normalized_external_id', email)
    .eq('verification_status', 'verified');

  const hasDirectVerifiedIdentity = !idError && verifiedEmailIdentities && verifiedEmailIdentities.length > 0;
  const hasAuthoritativeBillingEvidence = Boolean(
    contact.external_ids &&
      typeof contact.external_ids === 'object' &&
      ((contact.external_ids as Record<string, unknown>).stripe_customer_id ||
        (contact.external_ids as Record<string, unknown>).stripe_subscription_id)
  );

  if (!hasDirectVerifiedIdentity && !hasAuthoritativeBillingEvidence) {
    return {
      valid: false,
      reason: `Recipient email "${email}" lacks verified provider identity evidence for account ${params.customerAccountId}`,
    };
  }

  // 5. If primary is required, check primary status
  if (params.requirePrimary && !contact.is_primary) {
    return {
      valid: false,
      reason: `Recipient contact "${email}" is not the primary recovery contact for account ${params.customerAccountId}`,
    };
  }

  // 6. Check active contact policies permit email channel
  const { data: policies, error: policyError } = await supabase
    .from('contact_policies')
    .select('policy, expires_at')
    .eq('workspace_id', params.workspaceId)
    .eq('customer_account_id', params.customerAccountId)
    .eq('channel', 'email');

  if (policyError) {
    return {
      valid: false,
      reason: `Failed to evaluate contact policy: ${policyError.message}`,
    };
  }

  const now = new Date();
  const activeRestrictivePolicy = (policies ?? []).find((p) => {
    if (p.expires_at && new Date(p.expires_at) < now) return false;
    return p.policy !== 'allow';
  });

  if (activeRestrictivePolicy) {
    return {
      valid: false,
      reason: `Communication suppressed by active contact policy: "${activeRestrictivePolicy.policy}"`,
    };
  }

  return {
    valid: true,
    contactId: contact.id,
    contactName: contact.name,
    isPrimary: contact.is_primary ?? undefined,
  };
}
