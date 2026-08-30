import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateSendRecipient } from './recipient-validator';

function makeMockSupabase(responses: {
  account?: { id: string; is_provisional?: boolean } | null;
  accountError?: Error | null;
  contacts?: Array<{
    id: string;
    name?: string | null;
    is_primary: boolean;
    is_provisional: boolean;
    external_ids?: Record<string, unknown> | null;
  }> | null;
  contactError?: Error | null;
  emailIdentities?: Array<{
    id: string;
    provider: string;
    verification_status: string;
  }> | null;
  idError?: Error | null;
  policies?: Array<{ policy: string; expires_at: string | null }> | null;
  policyError?: Error | null;
}) {
  return {
    from: (table: string) => {
      const chain: any = {};
      chain.select = () => chain;
      chain.eq = () => chain;
      chain.in = () => chain;
      chain.maybeSingle = async () => {
        if (table === 'customer_accounts') {
          if (responses.accountError) return { data: null, error: responses.accountError };
          return { data: responses.account ?? null, error: null };
        }
        return { data: null, error: null };
      };
      chain.then = (resolve: (v: any) => any) => {
        if (table === 'account_contacts') {
          if (responses.contactError) return resolve({ data: null, error: responses.contactError });
          return resolve({ data: responses.contacts ?? [], error: null });
        }
        if (table === 'provider_identities') {
          if (responses.idError) return resolve({ data: null, error: responses.idError });
          return resolve({ data: responses.emailIdentities ?? [], error: null });
        }
        if (table === 'contact_policies') {
          if (responses.policyError) return resolve({ data: null, error: responses.policyError });
          return resolve({ data: responses.policies ?? [], error: null });
        }
        return resolve({ data: null, error: null });
      };
      return chain;
    },
  } as any;
}

describe('validateSendRecipient (TOCTOU & Recipient Safety)', () => {
  const workspaceId = 'ws-test-123';
  const customerAccountId = 'acc-test-456';
  const recipientEmail = 'founder@targetco.com';

  it('approves a valid, verified primary contact backed by verified email provider identity', async () => {
    const supabase = makeMockSupabase({
      account: { id: customerAccountId, is_provisional: false },
      contacts: [
        {
          id: 'cnt-1',
          name: 'Alice Founder',
          is_primary: true,
          is_provisional: false,
          external_ids: { stripe_customer_id: 'cus_123' },
        },
      ],
      emailIdentities: [{ id: 'pi-1', provider: 'stripe', verification_status: 'verified' }],
      policies: [{ policy: 'allow', expires_at: null }],
    });

    const result = await validateSendRecipient(supabase, {
      workspaceId,
      customerAccountId,
      recipientEmail,
      requirePrimary: true,
    });

    assert.equal(result.valid, true);
    assert.equal(result.contactId, 'cnt-1');
    assert.equal(result.isPrimary, true);
  });

  it('rejects invalid email format immediately', async () => {
    const supabase = makeMockSupabase({});
    const result = await validateSendRecipient(supabase, {
      workspaceId,
      customerAccountId,
      recipientEmail: 'not-an-email',
    });

    assert.equal(result.valid, false);
    assert.match(result.reason!, /Invalid email address format/);
  });

  it('rejects recipient when customer account is provisional', async () => {
    const supabase = makeMockSupabase({
      account: { id: customerAccountId, is_provisional: true },
      contacts: [{ id: 'cnt-1', is_primary: true, is_provisional: false }],
    });

    const result = await validateSendRecipient(supabase, {
      workspaceId,
      customerAccountId,
      recipientEmail,
    });

    assert.equal(result.valid, false);
    assert.match(result.reason!, /provisional account/);
  });

  it('rejects recipient when contact is provisional', async () => {
    const supabase = makeMockSupabase({
      account: { id: customerAccountId, is_provisional: false },
      contacts: [{ id: 'cnt-1', is_primary: true, is_provisional: true }],
    });

    const result = await validateSendRecipient(supabase, {
      workspaceId,
      customerAccountId,
      recipientEmail,
    });

    assert.equal(result.valid, false);
    assert.match(result.reason!, /is provisional/);
  });

  it('rejects recipient when contact does not exist on account', async () => {
    const supabase = makeMockSupabase({
      account: { id: customerAccountId, is_provisional: false },
      contacts: [],
    });

    const result = await validateSendRecipient(supabase, {
      workspaceId,
      customerAccountId,
      recipientEmail,
    });

    assert.equal(result.valid, false);
    assert.match(result.reason!, /not linked to customer account/);
  });

  it('rejects ambiguous recipient with multiple contact rows on same account', async () => {
    const supabase = makeMockSupabase({
      account: { id: customerAccountId, is_provisional: false },
      contacts: [
        { id: 'cnt-1', is_primary: true, is_provisional: false },
        { id: 'cnt-2', is_primary: false, is_provisional: false },
      ],
    });

    const result = await validateSendRecipient(supabase, {
      workspaceId,
      customerAccountId,
      recipientEmail,
    });

    assert.equal(result.valid, false);
    assert.match(result.reason!, /Ambiguous contact/);
  });

  it('rejects recipient without verified provider identity or billing evidence', async () => {
    const supabase = makeMockSupabase({
      account: { id: customerAccountId, is_provisional: false },
      contacts: [
        {
          id: 'cnt-1',
          name: 'Bob Unverified',
          is_primary: true,
          is_provisional: false,
          external_ids: {},
        },
      ],
      emailIdentities: [],
      policies: [{ policy: 'allow', expires_at: null }],
    });

    const result = await validateSendRecipient(supabase, {
      workspaceId,
      customerAccountId,
      recipientEmail,
    });

    assert.equal(result.valid, false);
    assert.match(result.reason!, /lacks verified provider identity evidence/);
  });

  it('rejects send when active do_not_contact policy is present', async () => {
    const supabase = makeMockSupabase({
      account: { id: customerAccountId, is_provisional: false },
      contacts: [
        {
          id: 'cnt-1',
          is_primary: true,
          is_provisional: false,
          external_ids: { stripe_customer_id: 'cus_123' },
        },
      ],
      emailIdentities: [{ id: 'pi-1', provider: 'stripe', verification_status: 'verified' }],
      policies: [{ policy: 'do_not_contact', expires_at: null }],
    });

    const result = await validateSendRecipient(supabase, {
      workspaceId,
      customerAccountId,
      recipientEmail,
    });

    assert.equal(result.valid, false);
    assert.match(result.reason!, /Communication suppressed by active contact policy/);
  });

  it('rejects send when requirePrimary is true but contact is not primary', async () => {
    const supabase = makeMockSupabase({
      account: { id: customerAccountId, is_provisional: false },
      contacts: [
        {
          id: 'cnt-1',
          is_primary: false,
          is_provisional: false,
          external_ids: { stripe_customer_id: 'cus_123' },
        },
      ],
      emailIdentities: [{ id: 'pi-1', provider: 'stripe', verification_status: 'verified' }],
      policies: [{ policy: 'allow', expires_at: null }],
    });

    const result = await validateSendRecipient(supabase, {
      workspaceId,
      customerAccountId,
      recipientEmail,
      requirePrimary: true,
    });

    assert.equal(result.valid, false);
    assert.match(result.reason!, /not the primary recovery contact/);
  });
});
