import { SupabaseClient } from '@supabase/supabase-js';
import { SCENARIO_MANIFEST_V1 } from './manifest.v1';
import { upsertProviderIdentity } from '../identity';
import { projectAccountFeatures } from '../features';

export async function seedScenarios(
  supabase: SupabaseClient,
  workspaceId: string
): Promise<{ seededCount: number; accountIds: Record<string, string> }> {
  const accountIds: Record<string, string> = {};

  for (const def of SCENARIO_MANIFEST_V1) {
    // 1. Upsert customer_account
    const { data: account, error: accError } = await supabase
      .from('customer_accounts')
      .upsert(
        {
          workspace_id: workspaceId,
          name: def.accountName,
          account_status: def.featuresPatch.billingStatus === 'cancelled' ? 'cancelled' : def.featuresPatch.billingStatus === 'past_due' ? 'past_due' : 'active',
          mrr_cents: def.featuresPatch.currentMrrCents ?? def.initialMrrCents,
          risk_score: def.expectedRisk ? (def.expectedSeverity === 'critical' ? 95 : 75) : 20,
          risk_level: def.expectedSeverity,
          domain: `${def.scenarioId.toLowerCase()}.example.com`,
          contact_email: def.contactEmail,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'workspace_id,domain' }
      )
      .select('id')
      .single();

    if (accError || !account) {
      throw new Error(`Failed to seed account ${def.accountName}: ${accError?.message}`);
    }

    const accountId = account.id;
    accountIds[def.scenarioId] = accountId;

    // 2. Upsert account_contact
    await supabase.from('account_contacts').upsert(
      {
        workspace_id: workspaceId,
        customer_account_id: accountId,
        name: `${def.accountName} Primary`,
        email: def.contactEmail.toLowerCase(),
        role: 'Owner',
        is_primary: true,
        external_ids: {
          stripe_customer_id: def.stripeCustomerId,
          posthog_distinct_ids: [def.posthogDistinctId],
        },
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'workspace_id,email' }
    );

    // 3. Upsert provider identities
    await upsertProviderIdentity(supabase, {
      workspaceId,
      customerAccountId: accountId,
      provider: 'stripe',
      identityType: 'customer_id',
      externalId: def.stripeCustomerId,
      isPrimary: true,
      source: 'scenario_seed',
    });

    await upsertProviderIdentity(supabase, {
      workspaceId,
      customerAccountId: accountId,
      provider: 'posthog',
      identityType: 'distinct_id',
      externalId: def.posthogDistinctId,
      isPrimary: true,
      source: 'scenario_seed',
    });

    await upsertProviderIdentity(supabase, {
      workspaceId,
      customerAccountId: accountId,
      provider: 'gmail',
      identityType: 'email_address',
      externalId: def.contactEmail,
      isPrimary: true,
      source: 'scenario_seed',
    });

    // 4. Upsert contact policy if present
    if (def.contactPolicy) {
      await supabase.from('contact_policies').upsert(
        {
          workspace_id: workspaceId,
          customer_account_id: accountId,
          channel: 'email',
          address: def.contactEmail.toLowerCase(),
          policy: def.contactPolicy,
          reason: 'Configured scenario policy',
          source: 'scenario_seed',
        },
        { onConflict: 'workspace_id,customer_account_id,channel' }
      );
    }

    // 5. Project canonical features
    await projectAccountFeatures(supabase, {
      workspaceId,
      customerAccountId: accountId,
      patch: {
        ...def.featuresPatch,
        stripeCustomerId: def.stripeCustomerId,
        billingFreshAt: new Date().toISOString(),
        usageFreshAt: new Date().toISOString(),
        communicationFreshAt: new Date().toISOString(),
      },
    });
  }

  return { seededCount: SCENARIO_MANIFEST_V1.length, accountIds };
}
