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
  const { data: account, error: accError } = await supabase
    .from('customer_accounts')
    .select('id, is_provisional')
    .eq('id', params.customerAccountId)
    .eq('workspace_id', params.workspaceId)
    .maybeSingle();

  if (accError || !account) {
    return {
      valid: false,
      reason: `Customer account ${params.customerAccountId} not found in workspace ${params.workspaceId}`,
    };
  }

  if (account.is_provisional === true) {
    return {
      valid: false,
      reason: `Cannot send communication to provisional account ${params.customerAccountId}. Requires verified canonical identity.`,
    };
  }

  // 2. Check contact exists and belongs to the exact workspace + account
  const { data: contact, error: contactError } = await supabase
    .from('account_contacts')
    .select('id, name, is_primary, is_provisional')
    .eq('workspace_id', params.workspaceId)
    .eq('customer_account_id', params.customerAccountId)
    .eq('email', email)
    .maybeSingle();

  if (contactError || !contact) {
    return {
      valid: false,
      reason: `Recipient email "${email}" is not linked to customer account ${params.customerAccountId}`,
    };
  }

  // 3. Enforce that contact must NOT be provisional
  if (contact.is_provisional === true) {
    return {
      valid: false,
      reason: `Recipient contact "${email}" is provisional. Communications require a verified contact.`,
    };
  }

  // 4. If primary is required, check primary status
  if (params.requirePrimary && !contact.is_primary) {
    return {
      valid: false,
      reason: `Recipient contact "${email}" is not the primary recovery contact for account ${params.customerAccountId}`,
    };
  }

  // 5. Check active contact policies permit email channel
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
    isPrimary: contact.is_primary,
  };
}
