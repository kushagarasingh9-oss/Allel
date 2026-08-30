import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateSendRecipient } from './recipient-validator';

function makeMockSupabase(responses: {
  account?: { id: string; is_provisional?: boolean } | null;
  accountError?: Error | null;
  contact?: { id: string; name?: string | null; is_primary: boolean; is_provisional: boolean } | null;
  contactError?: Error | null;
  policies?: Array<{ policy: string; expires_at: string | null }> | null;
  policyError?: Error | null;
}) {
  return {
    from: (table: string) => {
      const chain: any = {};
      chain.select = () => chain;
      chain.eq = () => chain;
      chain.maybeSingle = async () => {
        if (table === 'customer_accounts') {
          if (responses.accountError) return { data: null, error: responses.accountError };
          return { data: responses.account ?? null, error: null };
        }
        if (table === 'account_contacts') {
          if (responses.contactError) return { data: null, error: responses.contactError };
          return { data: responses.contact ?? null, error: null };
        }
        return { data: null, error: null };
      };
      chain.then = (resolve: (v: any) => any) => {
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

  it('approves a valid, verified non-provisional contact on a verified account', async () => {
    const supabase = makeMockSupabase({
      account: { id: customerAccountId, is_provisional: false },
      contact: { id: 'cnt-1', name: 'Alice Founder', is_primary: true, is_provisional: false },
      policies: [{ policy: 'allow', expires_at: null }],
    });

    const result = await validateSendRecipient(supabase, {
      workspaceId,
      customerAccountId,
      recipientEmail,
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
      contact: { id: 'cnt-1', is_primary: true, is_provisional: false },
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
      contact: { id: 'cnt-1', is_primary: true, is_provisional: true },
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
      contact: null,
    });

    const result = await validateSendRecipient(supabase, {
      workspaceId,
      customerAccountId,
      recipientEmail,
    });

    assert.equal(result.valid, false);
    assert.match(result.reason!, /not linked to customer account/);
  });

  it('rejects send when active do_not_contact policy is present', async () => {
    const supabase = makeMockSupabase({
      account: { id: customerAccountId, is_provisional: false },
      contact: { id: 'cnt-1', is_primary: true, is_provisional: false },
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
      contact: { id: 'cnt-1', is_primary: false, is_provisional: false },
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
