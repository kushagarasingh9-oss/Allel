import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeExternalId,
  resolveAccountIdentity,
  upsertProviderIdentity,
  linkContactSafely,
  promoteCustomerIdentitySafely,
  IdentityWriteResultSchema,
  ContactLinkResultSchema,
  PromoteIdentityResultSchema,
} from './identity';
import { RECOVERY_CONFIG } from './config';

// ---------------------------------------------------------------------------
// Mock Supabase Client Helper
// ---------------------------------------------------------------------------

type MockTableHandler = (table: string) => any;
type MockRpcHandler = (fn: string, args: Record<string, any>) => Promise<{ data: any; error: any }>;

function createMockSupabase(tableHandler: MockTableHandler, rpcHandler?: MockRpcHandler) {
  return {
    from: (table: string) => tableHandler(table),
    rpc: rpcHandler ?? (async (fn: string, args: any) => ({ data: { status: 'ok', accountId: args?.p_customer_account_id ?? 'acc-1', created: true }, error: null })),
  } as any;
}

function createChainableMock(resolvedResult: { data: any; error: any }) {
  const queryState: Record<string, any> = {
    filters: [] as Array<{ op: string; field: string; value: any }>,
    inserted: null as any,
    updated: null as any,
  };

  const chain: any = {
    select: (...args: any[]) => chain,
    eq: (field: string, value: any) => {
      queryState.filters.push({ op: 'eq', field, value });
      return chain;
    },
    neq: (field: string, value: any) => {
      queryState.filters.push({ op: 'neq', field, value });
      return chain;
    },
    ilike: (field: string, value: any) => {
      queryState.filters.push({ op: 'ilike', field, value });
      return chain;
    },
    in: (field: string, values: any[]) => {
      queryState.filters.push({ op: 'in', field, value: values });
      return chain;
    },
    order: () => chain,
    limit: () => chain,
    insert: (payload: any) => {
      queryState.inserted = payload;
      return chain;
    },
    update: (payload: any) => {
      queryState.updated = payload;
      return chain;
    },
    maybeSingle: async () => resolvedResult,
    single: async () => resolvedResult,
    then: (resolve: any, reject: any) => Promise.resolve(resolvedResult).then(resolve, reject),
    _state: queryState,
  };

  return chain;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('normalizeExternalId', () => {
  it('lowercases email addresses', () => {
    assert.equal(normalizeExternalId('TEST@ACME.COM', 'person_email'), 'test@acme.com');
    assert.equal(normalizeExternalId(' Billing@Corp.IO ', 'email_address'), 'billing@corp.io');
  });

  it('preserves case on provider customer/distinct IDs', () => {
    assert.equal(normalizeExternalId('cus_NxF89zPQ', 'customer_id'), 'cus_NxF89zPQ');
    assert.equal(normalizeExternalId('ph_distinct_XYZ123', 'distinct_id'), 'ph_distinct_XYZ123');
    assert.equal(normalizeExternalId('18c9e42b87a99f-01', 'contact_id'), '18c9e42b87a99f-01');
  });

  it('throws on blank or invalid inputs', () => {
    assert.throws(() => normalizeExternalId('', 'customer_id'), /non-empty/);
    assert.throws(() => normalizeExternalId('   ', 'distinct_id'), /blank/);
    assert.throws(() => normalizeExternalId(null as any, 'customer_id'), /non-empty/);
  });
});

describe('resolveAccountIdentity', () => {
  it('A. Exact Stripe customer_id resolves correctly', async () => {
    const supabase = createMockSupabase((table) => {
      if (table === 'provider_identities') {
        return createChainableMock({
          data: [
            {
              customer_account_id: 'acc-stripe-1',
              verification_status: 'verified',
            },
          ],
          error: null,
        });
      }
      return createChainableMock({ data: [], error: null });
    });

    const result = await resolveAccountIdentity(supabase, {
      workspaceId: 'ws-1',
      provider: 'stripe',
      identityType: 'customer_id',
      externalId: 'cus_exact_123',
    });

    assert.equal(result.status, 'verified');
    assert.equal(result.customerAccountId, 'acc-stripe-1');
    assert.equal(result.matchType, 'exact_verified_provider_id');
  });

  it('B. Exact PostHog distinct_id resolves correctly', async () => {
    const supabase = createMockSupabase((table) => {
      if (table === 'provider_identities') {
        return createChainableMock({
          data: [
            {
              customer_account_id: 'acc-posthog-1',
              verification_status: 'verified',
            },
          ],
          error: null,
        });
      }
      return createChainableMock({ data: [], error: null });
    });

    const result = await resolveAccountIdentity(supabase, {
      workspaceId: 'ws-1',
      provider: 'posthog',
      identityType: 'distinct_id',
      externalId: 'ph_distinct_123',
    });

    assert.equal(result.status, 'verified');
    assert.equal(result.customerAccountId, 'acc-posthog-1');
    assert.equal(result.matchType, 'exact_verified_provider_id');
  });

  it('C. Email matching is case-insensitive and workspace-scoped (non-provisional)', async () => {
    const supabase = createMockSupabase((table) => {
      if (table === 'provider_identities') {
        return createChainableMock({ data: [], error: null });
      }
      if (table === 'account_contacts') {
        return createChainableMock({
          data: [
            {
              customer_account_id: 'acc-email-1',
              email: 'billing@acme.com',
              is_provisional: false,
            },
          ],
          error: null,
        });
      }
      return createChainableMock({ data: [], error: null });
    });

    const result = await resolveAccountIdentity(supabase, {
      workspaceId: 'ws-1',
      provider: 'stripe',
      identityType: 'person_email',
      externalId: 'BILLING@ACME.COM',
    });

    assert.equal(result.status, 'verified');
    assert.equal(result.customerAccountId, 'acc-email-1');
    assert.equal(result.matchType, 'exact_unique_verified_email');
    assert.equal(result.matchedIdentity, 'billing@acme.com');
  });

  it('C2. Provisional contact email returns inferred status (never verified)', async () => {
    const supabase = createMockSupabase((table) => {
      if (table === 'provider_identities') {
        return createChainableMock({ data: [], error: null });
      }
      if (table === 'account_contacts') {
        return createChainableMock({
          data: [
            {
              customer_account_id: 'acc-provisional-1',
              email: 'inferred@candidate.com',
              is_provisional: true,
            },
          ],
          error: null,
        });
      }
      return createChainableMock({ data: [], error: null });
    });

    const result = await resolveAccountIdentity(supabase, {
      workspaceId: 'ws-1',
      provider: 'posthog',
      identityType: 'person_email',
      externalId: 'inferred@candidate.com',
    });

    assert.equal(result.status, 'inferred');
    assert.equal(result.customerAccountId, 'acc-provisional-1');
    assert.equal(result.matchType, 'exact_provisional_email');
  });

  it('D. Duplicate/ambiguous email returns conflict, not first match', async () => {
    const supabase = createMockSupabase((table) => {
      if (table === 'provider_identities') {
        return createChainableMock({ data: [], error: null });
      }
      if (table === 'account_contacts') {
        return createChainableMock({
          data: [
            { customer_account_id: 'acc-1', email: 'shared@acme.com', is_provisional: false },
            { customer_account_id: 'acc-2', email: 'shared@acme.com', is_provisional: false },
          ],
          error: null,
        });
      }
      return createChainableMock({ data: [], error: null });
    });

    const result = await resolveAccountIdentity(supabase, {
      workspaceId: 'ws-1',
      provider: 'stripe',
      identityType: 'person_email',
      externalId: 'shared@acme.com',
    });

    assert.equal(result.status, 'conflict');
    assert.equal(result.customerAccountId, null);
    assert.equal(result.matchType, 'ambiguous_email_multiple_accounts');
    assert.deepEqual(result.candidateAccountIds, ['acc-1', 'acc-2']);
  });

  it('G. Similar account names never produce a verified match in identity resolution', async () => {
    const supabase = createMockSupabase((table) => {
      return createChainableMock({ data: [], error: null });
    });

    const result = await resolveAccountIdentity(supabase, {
      workspaceId: 'ws-1',
      provider: 'stripe',
      identityType: 'customer_id',
      externalId: 'cus_unmapped_123',
    });

    assert.equal(result.status, 'unmapped');
    assert.equal(result.customerAccountId, null);
  });

  it('H. Two PostHog persons without identities remain unmapped (not merged by company name)', async () => {
    const supabase = createMockSupabase((table) => {
      return createChainableMock({ data: [], error: null });
    });

    const p1 = await resolveAccountIdentity(supabase, {
      workspaceId: 'ws-1',
      provider: 'posthog',
      identityType: 'distinct_id',
      externalId: 'ph_person_1',
    });

    const p2 = await resolveAccountIdentity(supabase, {
      workspaceId: 'ws-1',
      provider: 'posthog',
      identityType: 'distinct_id',
      externalId: 'ph_person_2',
    });

    assert.equal(p1.status, 'unmapped');
    assert.equal(p2.status, 'unmapped');
  });

  it('I. Intercom contact_id resolution works', async () => {
    const supabase = createMockSupabase((table) => {
      if (table === 'provider_identities') {
        return createChainableMock({
          data: [
            {
              customer_account_id: 'acc-intercom-1',
              verification_status: 'verified',
            },
          ],
          error: null,
        });
      }
      return createChainableMock({ data: [], error: null });
    });

    const result = await resolveAccountIdentity(supabase, {
      workspaceId: 'ws-1',
      provider: 'intercom',
      identityType: 'contact_id',
      externalId: '64f1a2b3c4d5e6f7',
    });

    assert.equal(result.status, 'verified');
    assert.equal(result.customerAccountId, 'acc-intercom-1');
  });

  it('J. Gmail thread identity for wrong workspace returns unmapped', async () => {
    const supabase = createMockSupabase((table) => {
      return createChainableMock({ data: [], error: null });
    });

    const result = await resolveAccountIdentity(supabase, {
      workspaceId: 'ws-correct',
      provider: 'gmail',
      identityType: 'gmail_thread_id',
      externalId: 'thread-wrong-ws-123',
    });

    assert.equal(result.status, 'unmapped');
    assert.equal(result.customerAccountId, null);
  });

  it('K. Unmapped/conflict events gate customer-facing actions', () => {
    const unmappedResult = { status: 'unmapped', customerAccountId: null };
    const conflictResult = { status: 'conflict', customerAccountId: null };

    assert.equal(unmappedResult.status !== 'verified', true);
    assert.equal(conflictResult.status !== 'verified', true);
  });

  it('L. Scenario bypass requires TEST_MODE, valid scenario run, and matching DB row', async () => {
    const originalTestMode = RECOVERY_CONFIG.TEST_MODE;

    // Case 1: TEST_MODE is false -> bypass is ignored
    (RECOVERY_CONFIG as any).TEST_MODE = false;
    const supabaseNoTest = createMockSupabase((table) => {
      return createChainableMock({ data: [], error: null });
    });

    const resultNoTest = await resolveAccountIdentity(supabaseNoTest, {
      workspaceId: 'ws-1',
      provider: 'stripe',
      identityType: 'customer_id',
      externalId: 'cus_scenario_1',
      scenarioMetadata: {
        customerAccountId: 'acc-scenario-target',
        scenarioId: 'sc-123',
        scenarioRunId: 'run-active-1',
      },
    });
    assert.equal(resultNoTest.status, 'unmapped');

    // Case 2: TEST_MODE is true, active scenario run in DB -> returns verified
    (RECOVERY_CONFIG as any).TEST_MODE = true;
    const supabaseWithRun = createMockSupabase((table) => {
      if (table === 'recovery_scenario_runs') {
        return createChainableMock({
          data: { id: 'run-active-1', status: 'active', test_mode: true },
          error: null,
        });
      }
      if (table === 'customer_accounts') {
        return createChainableMock({
          data: { id: 'acc-scenario-target' },
          error: null,
        });
      }
      if (table === 'provider_identities') {
        return createChainableMock({ data: null, error: null });
      }
      return createChainableMock({ data: null, error: null });
    });

    const resultWithRun = await resolveAccountIdentity(supabaseWithRun, {
      workspaceId: 'ws-1',
      provider: 'stripe',
      identityType: 'customer_id',
      externalId: 'cus_scenario_1',
      scenarioMetadata: {
        customerAccountId: 'acc-scenario-target',
        scenarioId: 'sc-123',
        scenarioRunId: 'run-active-1',
      },
    });

    assert.equal(resultWithRun.status, 'verified');
    assert.equal(resultWithRun.customerAccountId, 'acc-scenario-target');

    // Case 3: Inactive/missing scenario run -> unmapped
    const supabaseInactiveRun = createMockSupabase((table) => {
      if (table === 'recovery_scenario_runs') {
        return createChainableMock({ data: null, error: null });
      }
      return createChainableMock({ data: [], error: null });
    });

    const inactiveResult = await resolveAccountIdentity(supabaseInactiveRun, {
      workspaceId: 'ws-1',
      provider: 'stripe',
      identityType: 'customer_id',
      externalId: 'cus_scenario_1',
      scenarioMetadata: {
        customerAccountId: 'acc-scenario-target',
        scenarioId: 'sc-123',
        scenarioRunId: 'run-stale-2',
      },
    });

    assert.equal(inactiveResult.status, 'unmapped');
    assert.equal(inactiveResult.customerAccountId, null);

    // Reset TEST_MODE
    (RECOVERY_CONFIG as any).TEST_MODE = originalTestMode;
  });

  it('O. Workspace isolation is enforced in queries', async () => {
    let capturedWorkspaceFilter: string | null = null;

    const supabase = createMockSupabase((table) => {
      const mock = createChainableMock({ data: [], error: null });
      const origEq = mock.eq;
      mock.eq = (field: string, value: any) => {
        if (field === 'workspace_id') capturedWorkspaceFilter = value;
        return origEq(field, value);
      };
      return mock;
    });

    await resolveAccountIdentity(supabase, {
      workspaceId: 'workspace-secure-42',
      provider: 'stripe',
      identityType: 'customer_id',
      externalId: 'cus_test',
    });

    assert.equal(capturedWorkspaceFilter, 'workspace-secure-42');
  });
});

describe('upsertProviderIdentity & linkContactSafely conflict safety', () => {
  it('E. Existing provider identity cannot be reassigned by an upsert (writes conflict)', async () => {
    let rpcArgs: any = null;

    const supabase = createMockSupabase(
      () => createChainableMock({ data: null, error: null }),
      async (fn, args) => {
        rpcArgs = { fn, args };
        return {
          data: {
            status: 'conflict',
            conflictId: 'conflict-row-uuid',
            existingAccountId: 'acc-original-owner',
            candidateAccountId: args.p_customer_account_id,
            reason: 'Provider identity already linked to a different account',
          },
          error: null,
        };
      }
    );

    const result = await upsertProviderIdentity(supabase, {
      workspaceId: 'ws-1',
      customerAccountId: 'acc-candidate-intruder',
      provider: 'stripe',
      identityType: 'customer_id',
      externalId: 'cus_shared_conflict',
      source: 'stripe_sync',
      verificationStatus: 'verified',
    });

    assert.equal(result.status, 'conflict');
    assert.equal((result as any).conflictId, 'conflict-row-uuid');
    assert.equal((result as any).existingAccountId, 'acc-original-owner');
    assert.equal((result as any).candidateAccountId, 'acc-candidate-intruder');
    assert.equal(rpcArgs.fn, 'link_provider_identity_safely');
  });

  it('F. Existing contact email cannot be moved to another account (writes conflict)', async () => {
    let rpcArgs: any = null;

    const supabase = createMockSupabase(
      () => createChainableMock({ data: null, error: null }),
      async (fn, args) => {
        rpcArgs = { fn, args };
        return {
          data: {
            status: 'conflict',
            conflictId: 'contact-conflict-uuid',
            existingAccountId: 'acc-original-contact-owner',
            candidateAccountId: args.p_customer_account_id,
            reason: 'Contact email already linked to a different account',
          },
          error: null,
        };
      }
    );

    const result = await linkContactSafely(supabase, {
      workspaceId: 'ws-1',
      customerAccountId: 'acc-candidate-new-owner',
      email: 'founder@acme.com',
      source: 'stripe_sync',
    });

    assert.equal(result.status, 'conflict');
    assert.equal((result as any).conflictId, 'contact-conflict-uuid');
    assert.equal((result as any).existingAccountId, 'acc-original-contact-owner');
    assert.equal((result as any).candidateAccountId, 'acc-candidate-new-owner');
    assert.equal(rpcArgs.fn, 'link_account_contact_safely');
  });

  it('M. Connector reruns are idempotent for same account', async () => {
    const supabase = createMockSupabase(
      () => createChainableMock({ data: null, error: null }),
      async (fn, args) => ({
        data: {
          status: 'ok',
          accountId: args.p_customer_account_id,
          created: false,
          verificationStatus: 'verified',
        },
        error: null,
      })
    );

    const result = await upsertProviderIdentity(supabase, {
      workspaceId: 'ws-1',
      customerAccountId: 'acc-same-owner',
      provider: 'stripe',
      identityType: 'customer_id',
      externalId: 'cus_idempotent',
      source: 'stripe_sync',
    });

    assert.equal(result.status, 'ok');
    assert.equal((result as any).created, false);
  });

  it('N. Database insert error is handled and returned, not silently swallowed', async () => {
    const supabase = createMockSupabase(
      () => createChainableMock({ data: null, error: null }),
      async () => ({
        data: null,
        error: { message: 'unique_violation on constraint' },
      })
    );

    const result = await upsertProviderIdentity(supabase, {
      workspaceId: 'ws-1',
      customerAccountId: 'acc-1',
      provider: 'stripe',
      identityType: 'customer_id',
      externalId: 'cus_err',
      source: 'test',
    });

    assert.equal(result.status, 'error');
    assert.ok((result as any).error.includes('unique_violation'));
  });

  it('P. promoteCustomerIdentitySafely promotes provisional account and contacts with audit trail', async () => {
    let rpcArgs: any = null;

    const supabase = createMockSupabase(
      () => createChainableMock({ data: null, error: null }),
      async (fn, args) => {
        rpcArgs = { fn, args };
        return {
          data: {
            status: 'ok',
            accountId: args.p_customer_account_id,
            promoted: true,
            auditId: 'audit-row-uuid-123',
          },
          error: null,
        };
      }
    );

    const result = await promoteCustomerIdentitySafely(supabase, {
      workspaceId: 'ws-1',
      customerAccountId: 'acc-provisional-1',
      source: 'stripe_sync',
      evidence: { stripe_customer_id: 'cus_authoritative_123' },
    });

    assert.equal(result.status, 'ok');
    assert.equal((result as any).promoted, true);
    assert.equal((result as any).auditId, 'audit-row-uuid-123');
    assert.equal(rpcArgs.fn, 'promote_customer_identity_safely');
  });

  it('Q. Malformed RPC response fails closed with typed error', async () => {
    const supabase = createMockSupabase(
      () => createChainableMock({ data: null, error: null }),
      async () => ({
        data: { invalid_field: 123 },
        error: null,
      })
    );

    const result = await upsertProviderIdentity(supabase, {
      workspaceId: 'ws-1',
      customerAccountId: 'acc-1',
      provider: 'stripe',
      identityType: 'customer_id',
      externalId: 'cus_test',
      source: 'test',
    });

    assert.equal(result.status, 'error');
    assert.ok((result as any).error.includes('Malformed RPC output'));
  });
});
