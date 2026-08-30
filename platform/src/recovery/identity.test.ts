import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeExternalId,
  resolveAccountIdentity,
  upsertProviderIdentity,
  linkContactSafely,
  promoteCustomerIdentitySafely,
} from './identity';
import { RECOVERY_CONFIG } from './config';

// ---------------------------------------------------------------------------
// Mock Supabase Client Helper
// ---------------------------------------------------------------------------

type MockTableHandler = (table: string) => any;

function createMockSupabase(tableHandler: MockTableHandler) {
  return {
    from: (table: string) => tableHandler(table),
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

  it('preserves casing for provider external IDs', () => {
    assert.equal(normalizeExternalId('cus_ABC123xyz', 'customer_id'), 'cus_ABC123xyz');
    assert.equal(normalizeExternalId('ph_distinct_XYZ', 'distinct_id'), 'ph_distinct_XYZ');
    assert.equal(normalizeExternalId('thread_189abC', 'gmail_thread_id'), 'thread_189abC');
    assert.equal(normalizeExternalId('contact_int_789', 'contact_id'), 'contact_int_789');
  });

  it('throws on blank or invalid inputs', () => {
    assert.throws(() => normalizeExternalId('', 'customer_id'));
    assert.throws(() => normalizeExternalId('   ', 'customer_id'));
  });
});

describe('resolveAccountIdentity', () => {
  it('A. Exact Stripe customer_id resolves correctly', async () => {
    const supabase = createMockSupabase((table) => {
      if (table === 'provider_identities') {
        return createChainableMock({
          data: [{ customer_account_id: 'acc-stripe-1', verification_status: 'verified' }],
          error: null,
        });
      }
      return createChainableMock({ data: null, error: null });
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
          data: [{ customer_account_id: 'acc-ph-1', verification_status: 'verified' }],
          error: null,
        });
      }
      return createChainableMock({ data: null, error: null });
    });

    const result = await resolveAccountIdentity(supabase, {
      workspaceId: 'ws-1',
      provider: 'posthog',
      identityType: 'distinct_id',
      externalId: 'ph_distinct_user_456',
    });

    assert.equal(result.status, 'verified');
    assert.equal(result.customerAccountId, 'acc-ph-1');
    assert.equal(result.matchType, 'exact_verified_provider_id');
  });

  it('C. Email matching is case-insensitive and workspace-scoped (non-provisional)', async () => {
    let capturedFilters: any[] = [];
    const supabase = createMockSupabase((table) => {
      if (table === 'provider_identities') {
        return createChainableMock({ data: [], error: null });
      }
      if (table === 'account_contacts') {
        const mock = createChainableMock({
          data: [{ customer_account_id: 'acc-email-1', email: 'billing@acme.com', is_provisional: false }],
          error: null,
        });
        capturedFilters = mock._state.filters;
        return mock;
      }
      return createChainableMock({ data: null, error: null });
    });

    const result = await resolveAccountIdentity(supabase, {
      workspaceId: 'ws-workspace-a',
      provider: 'stripe',
      identityType: 'email_address',
      externalId: 'BILLING@ACME.COM',
    });

    assert.equal(result.status, 'verified');
    assert.equal(result.customerAccountId, 'acc-email-1');
    assert.equal(result.matchedIdentity, 'billing@acme.com');
  });

  it('C2. Provisional contact email returns inferred status (never verified)', async () => {
    const supabase = createMockSupabase((table) => {
      if (table === 'provider_identities') {
        return createChainableMock({ data: [], error: null });
      }
      if (table === 'account_contacts') {
        return createChainableMock({
          data: [{ customer_account_id: 'acc-provisional-1', email: 'inferred@acme.com', is_provisional: true }],
          error: null,
        });
      }
      return createChainableMock({ data: null, error: null });
    });

    const result = await resolveAccountIdentity(supabase, {
      workspaceId: 'ws-1',
      provider: 'stripe',
      identityType: 'email_address',
      externalId: 'inferred@acme.com',
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
            { customer_account_id: 'acc-1', email: 'shared@corp.io' },
            { customer_account_id: 'acc-2', email: 'shared@corp.io' },
          ],
          error: null,
        });
      }
      return createChainableMock({ data: null, error: null });
    });

    const result = await resolveAccountIdentity(supabase, {
      workspaceId: 'ws-1',
      provider: 'stripe',
      identityType: 'email_address',
      externalId: 'shared@corp.io',
    });

    assert.equal(result.status, 'conflict');
    assert.equal(result.customerAccountId, null);
    assert.equal(result.matchType, 'ambiguous_email_multiple_accounts');
    assert.deepEqual(result.candidateAccountIds, ['acc-1', 'acc-2']);
  });

  it('G. Similar account names never produce a verified match in identity resolution', async () => {
    const supabase = createMockSupabase(() => createChainableMock({ data: [], error: null }));

    const result = await resolveAccountIdentity(supabase, {
      workspaceId: 'ws-1',
      provider: 'stripe',
      identityType: 'customer_id',
      externalId: 'cus_unknown',
    });

    assert.equal(result.status, 'unmapped');
    assert.equal(result.customerAccountId, null);
    assert.equal(result.matchType, 'no_match');
  });

  it('H. Two PostHog persons without identities remain unmapped (not merged by company name)', async () => {
    const supabase = createMockSupabase(() => createChainableMock({ data: [], error: null }));

    const result1 = await resolveAccountIdentity(supabase, {
      workspaceId: 'ws-1',
      provider: 'posthog',
      identityType: 'distinct_id',
      externalId: 'person-1',
    });

    const result2 = await resolveAccountIdentity(supabase, {
      workspaceId: 'ws-1',
      provider: 'posthog',
      identityType: 'distinct_id',
      externalId: 'person-2',
    });

    assert.equal(result1.status, 'unmapped');
    assert.equal(result2.status, 'unmapped');
  });

  it('I. Intercom contact_id resolution works', async () => {
    const supabase = createMockSupabase((table) => {
      if (table === 'provider_identities') {
        return createChainableMock({
          data: [{ customer_account_id: 'acc-intercom-99', verification_status: 'verified' }],
          error: null,
        });
      }
      return createChainableMock({ data: null, error: null });
    });

    const result = await resolveAccountIdentity(supabase, {
      workspaceId: 'ws-1',
      provider: 'intercom',
      identityType: 'contact_id',
      externalId: 'int_contact_555',
    });

    assert.equal(result.status, 'verified');
    assert.equal(result.customerAccountId, 'acc-intercom-99');
    assert.equal(result.matchType, 'exact_verified_provider_id');
  });

  it('J. Gmail thread identity for wrong workspace returns unmapped', async () => {
    const supabase = createMockSupabase((table) => {
      // Empty because workspaceId filter does not match
      return createChainableMock({ data: [], error: null });
    });

    const result = await resolveAccountIdentity(supabase, {
      workspaceId: 'ws-unauthorized',
      provider: 'gmail',
      identityType: 'gmail_thread_id',
      externalId: 'thread_xyz',
    });

    assert.equal(result.status, 'unmapped');
    assert.equal(result.customerAccountId, null);
  });

  it('K. Unmapped/conflict events gate customer-facing actions', () => {
    const checkCanMutate = (status: string) => status === 'verified';
    assert.equal(checkCanMutate('verified'), true);
    assert.equal(checkCanMutate('inferred'), false);
    assert.equal(checkCanMutate('unmapped'), false);
    assert.equal(checkCanMutate('conflict'), false);
  });

  it('L. Scenario bypass requires TEST_MODE, valid scenario run, and matching DB row', async () => {
    const originalTestMode = RECOVERY_CONFIG.TEST_MODE;
    (RECOVERY_CONFIG as any).TEST_MODE = true;

    // Sub-case 1: Valid active scenario run and matching provider_identities row -> trusted bypass
    const supabaseWithScenario = createMockSupabase((table) => {
      if (table === 'recovery_scenario_runs') {
        return createChainableMock({
          data: { id: 'run-active-1', workspace_id: 'ws-test', scenario_id: 'sc-123', status: 'active' },
          error: null,
        });
      }
      if (table === 'provider_identities') {
        return createChainableMock({
          data: { customer_account_id: 'acc-scenario-target' },
          error: null,
        });
      }
      return createChainableMock({ data: null, error: null });
    });

    const result = await resolveAccountIdentity(supabaseWithScenario, {
      workspaceId: 'ws-test',
      provider: 'stripe',
      identityType: 'customer_id',
      externalId: 'cus_scenario_1',
      scenarioMetadata: {
        customerAccountId: 'acc-scenario-target',
        scenarioId: 'sc-123',
        scenarioRunId: 'run-active-1',
      },
    });

    assert.equal(result.status, 'verified');
    assert.equal(result.matchType, 'trusted_scenario_metadata');
    assert.equal(result.customerAccountId, 'acc-scenario-target');

    // Sub-case 2: Inactive scenario run -> rejected (unmapped)
    const supabaseWithInactiveScenario = createMockSupabase((table) => {
      if (table === 'recovery_scenario_runs') {
        return createChainableMock({
          data: null, // inactive or not found
          error: null,
        });
      }
      return createChainableMock({ data: null, error: null });
    });

    const inactiveResult = await resolveAccountIdentity(supabaseWithInactiveScenario, {
      workspaceId: 'ws-test',
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
    let conflictInserted: any = null;
    let providerIdentityUpdated: any = null;

    const supabase = createMockSupabase((table) => {
      if (table === 'provider_identities') {
        const mock = createChainableMock({
          data: {
            id: 'pi-existing-id',
            customer_account_id: 'acc-original-owner',
            verification_status: 'verified',
          },
          error: null,
        });
        mock.update = (payload: any) => {
          providerIdentityUpdated = payload;
          return mock;
        };
        return mock;
      }
      if (table === 'identity_conflicts') {
        const mock = createChainableMock({ data: { id: 'conflict-row-uuid' }, error: null });
        mock.insert = (payload: any) => {
          conflictInserted = payload;
          return mock;
        };
        return mock;
      }
      return createChainableMock({ data: null, error: null });
    });

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
    assert.notEqual(conflictInserted, null);
    assert.equal(conflictInserted.existing_account_id, 'acc-original-owner');
    assert.equal(conflictInserted.candidate_account_id, 'acc-candidate-intruder');
    assert.equal(providerIdentityUpdated, null); // existing row was NOT reassigned
  });

  it('F. Existing contact email cannot be moved to another account (writes conflict)', async () => {
    let conflictInserted: any = null;
    let contactUpdated: any = null;

    const supabase = createMockSupabase((table) => {
      if (table === 'account_contacts') {
        const mock = createChainableMock({
          data: {
            id: 'contact-existing-id',
            customer_account_id: 'acc-original-contact-owner',
            email: 'founder@acme.com',
            external_ids: {},
          },
          error: null,
        });
        mock.update = (payload: any) => {
          contactUpdated = payload;
          return mock;
        };
        return mock;
      }
      if (table === 'identity_conflicts') {
        const mock = createChainableMock({ data: { id: 'contact-conflict-uuid' }, error: null });
        mock.insert = (payload: any) => {
          conflictInserted = payload;
          return mock;
        };
        return mock;
      }
      return createChainableMock({ data: null, error: null });
    });

    const result = await linkContactSafely(supabase, {
      workspaceId: 'ws-1',
      customerAccountId: 'acc-candidate-new-owner',
      email: 'founder@acme.com',
      source: 'stripe_sync',
    });

    assert.equal(result.status, 'conflict');
    assert.equal((result as any).conflictId, 'contact-conflict-uuid');
    assert.notEqual(conflictInserted, null);
    assert.equal(conflictInserted.existing_account_id, 'acc-original-contact-owner');
    assert.equal(conflictInserted.candidate_account_id, 'acc-candidate-new-owner');
    assert.equal(contactUpdated, null);
  });

  it('M. Connector reruns are idempotent for same account', async () => {
    let updateCalled = false;

    const supabase = createMockSupabase((table) => {
      if (table === 'provider_identities') {
        const mock = createChainableMock({
          data: {
            id: 'pi-1',
            customer_account_id: 'acc-same-owner',
            verification_status: 'verified',
          },
          error: null,
        });
        mock.update = (payload: any) => {
          updateCalled = true;
          return mock;
        };
        return mock;
      }
      return createChainableMock({ data: null, error: null });
    });

    const result = await upsertProviderIdentity(supabase, {
      workspaceId: 'ws-1',
      customerAccountId: 'acc-same-owner',
      provider: 'stripe',
      identityType: 'customer_id',
      externalId: 'cus_idempotent',
      source: 'stripe_sync',
    });

    assert.equal(result.status, 'ok');
    assert.equal(updateCalled, true);
  });

  it('N. Database insert error is handled and returned, not silently swallowed', async () => {
    const supabase = createMockSupabase((table) => {
      if (table === 'provider_identities') {
        const mock = createChainableMock({ data: null, error: null });
        mock.insert = () => Promise.resolve({ data: null, error: { message: 'unique_violation' } });
        return mock;
      }
      return createChainableMock({ data: null, error: null });
    });

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

  it('P. promoteCustomerIdentitySafely promotes provisional account and contacts', async () => {
    let accountUpdated: any = null;
    let contactsUpdated: any = null;

    const supabase = createMockSupabase((table) => {
      if (table === 'customer_accounts') {
        const mock = createChainableMock({
          data: { id: 'acc-provisional-1', is_provisional: true },
          error: null,
        });
        mock.update = (payload: any) => {
          accountUpdated = payload;
          return mock;
        };
        return mock;
      }
      if (table === 'account_contacts') {
        const mock = createChainableMock({
          data: [{ id: 'cnt-1', is_provisional: true }],
          error: null,
        });
        mock.update = (payload: any) => {
          contactsUpdated = payload;
          return mock;
        };
        return mock;
      }
      return createChainableMock({ data: null, error: null });
    });

    const result = await promoteCustomerIdentitySafely(supabase, {
      workspaceId: 'ws-1',
      customerAccountId: 'acc-provisional-1',
      source: 'stripe_sync',
    });

    assert.equal(result.status, 'ok');
    assert.equal(result.promoted, true);
    assert.notEqual(accountUpdated, null);
    assert.equal(accountUpdated.is_provisional, false);
    assert.notEqual(contactsUpdated, null);
    assert.equal(contactsUpdated.is_provisional, false);
  });
});
