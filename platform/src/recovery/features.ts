import crypto from 'crypto';
import { SupabaseClient } from '@supabase/supabase-js';
import { AccountFeatures } from './types';
import { RECOVERY_CONFIG } from './config';

/**
 * Named type for the raw snake_case row returned from Supabase.
 * §40.5.4: Every boundary must have a typed mapper — no `as unknown as`.
 */
export type AccountFeaturesDbRow = {
  workspace_id: string;
  customer_account_id: string;
  billing_available: boolean;
  billing_status: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  current_mrr_cents: number | null;
  pre_cancel_mrr_cents: number | null;
  last_invoice_id: string | null;
  last_invoice_status: string | null;
  failed_payment_count_7d: number;
  failed_payment_count_30d: number;
  last_payment_failed_at: string | null;
  last_payment_succeeded_at: string | null;
  cancel_at_period_end: boolean | null;
  cancelled_at: string | null;
  usage_available: boolean;
  usage_current_7d: number | null;
  usage_previous_7d: number | null;
  usage_delta_percent: number | null;
  key_feature_current_7d: number | null;
  key_feature_previous_7d: number | null;
  key_feature_missing: boolean | null;
  cancel_intent_at: string | null;
  last_product_activity_at: string | null;
  communication_available: boolean;
  last_outbound_at: string | null;
  last_inbound_at: string | null;
  unreplied_outbound_count: number;
  gmail_thread_id: string | null;
  billing_fresh_at: string | null;
  usage_fresh_at: string | null;
  communication_fresh_at: string | null;
  source_watermarks: Record<string, any>;
  feature_version: string;
  computed_at: string;
  updated_at: string;
};

/**
 * §40.5.4: Explicitly maps every snake_case DB field to camelCase domain type.
 * Exported for use everywhere a feature row enters domain logic.
 * Validates required fields and rejects invalid data.
 */
export function mapDbToAccountFeatures(row: AccountFeaturesDbRow): AccountFeatures {
  if (!row.workspace_id || !row.customer_account_id) {
    throw new Error('mapDbToAccountFeatures: missing required workspace_id or customer_account_id');
  }
  return {
    workspaceId: row.workspace_id,
    customerAccountId: row.customer_account_id,
    billingAvailable: row.billing_available ?? false,
    billingStatus: row.billing_status ?? null,
    stripeCustomerId: row.stripe_customer_id ?? null,
    stripeSubscriptionId: row.stripe_subscription_id ?? null,
    currentMrrCents: row.current_mrr_cents ?? null,
    preCancelMrrCents: row.pre_cancel_mrr_cents ?? null,
    lastInvoiceId: row.last_invoice_id ?? null,
    lastInvoiceStatus: row.last_invoice_status ?? null,
    failedPaymentCount7d: row.failed_payment_count_7d ?? 0,
    failedPaymentCount30d: row.failed_payment_count_30d ?? 0,
    lastPaymentFailedAt: row.last_payment_failed_at ?? null,
    lastPaymentSucceededAt: row.last_payment_succeeded_at ?? null,
    cancelAtPeriodEnd: row.cancel_at_period_end ?? null,
    cancelledAt: row.cancelled_at ?? null,
    usageAvailable: row.usage_available ?? false,
    usageCurrent7d: row.usage_current_7d ?? null,
    usagePrevious7d: row.usage_previous_7d ?? null,
    usageDeltaPercent: row.usage_delta_percent ?? null,
    keyFeatureCurrent7d: row.key_feature_current_7d ?? null,
    keyFeaturePrevious7d: row.key_feature_previous_7d ?? null,
    keyFeatureMissing: row.key_feature_missing ?? null,
    cancelIntentAt: row.cancel_intent_at ?? null,
    lastProductActivityAt: row.last_product_activity_at ?? null,
    communicationAvailable: row.communication_available ?? false,
    lastOutboundAt: row.last_outbound_at ?? null,
    lastInboundAt: row.last_inbound_at ?? null,
    unrepliedOutboundCount: row.unreplied_outbound_count ?? 0,
    gmailThreadId: row.gmail_thread_id ?? null,
    billingFreshAt: row.billing_fresh_at ?? null,
    usageFreshAt: row.usage_fresh_at ?? null,
    communicationFreshAt: row.communication_fresh_at ?? null,
    sourceWatermarks: row.source_watermarks || {},
    featureVersion: row.feature_version,
    computedAt: row.computed_at,
    updatedAt: row.updated_at,
  };
}

export function computeFeatureHash(features: Partial<AccountFeatures>): string {
  const normalized = {
    billingAvailable: features.billingAvailable ?? false,
    billingStatus: features.billingStatus ?? null,
    currentMrrCents: features.currentMrrCents ?? null,
    preCancelMrrCents: features.preCancelMrrCents ?? null,
    failedPaymentCount7d: features.failedPaymentCount7d ?? 0,
    failedPaymentCount30d: features.failedPaymentCount30d ?? 0,
    cancelAtPeriodEnd: features.cancelAtPeriodEnd ?? null,
    cancelledAt: features.cancelledAt ?? null,
    usageAvailable: features.usageAvailable ?? false,
    usageCurrent7d: features.usageCurrent7d ?? null,
    usagePrevious7d: features.usagePrevious7d ?? null,
    usageDeltaPercent: features.usageDeltaPercent != null ? Math.round(features.usageDeltaPercent * 100) / 100 : null,
    keyFeatureCurrent7d: features.keyFeatureCurrent7d ?? null,
    keyFeaturePrevious7d: features.keyFeaturePrevious7d ?? null,
    keyFeatureMissing: features.keyFeatureMissing ?? null,
    cancelIntentAt: features.cancelIntentAt ?? null,
    communicationAvailable: features.communicationAvailable ?? false,
    unrepliedOutboundCount: features.unrepliedOutboundCount ?? 0,
  };
  return crypto.createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
}

export function computeUsageDelta(
  current: number | null,
  previous: number | null,
  minBaseline: number = RECOVERY_CONFIG.USAGE_MIN_BASELINE_EVENTS
): number | null {
  if (previous == null || current == null || previous < minBaseline) {
    return null;
  }
  if (previous === 0) {
    return null;
  }
  return ((current - previous) / previous) * 100;
}

export async function projectAccountFeatures(
  supabase: SupabaseClient,
  params: {
    workspaceId: string;
    customerAccountId: string;
    patch?: Partial<AccountFeatures>;
  }
): Promise<{ features: AccountFeatures; materialChange: boolean; previousHash: string | null; currentHash: string }> {
  const now = new Date().toISOString();

  // 1. Fetch current features row
  const { data: existing } = await supabase
    .from('account_features')
    .select('*')
    .eq('workspace_id', params.workspaceId)
    .eq('customer_account_id', params.customerAccountId)
    .maybeSingle();

  const previousHash = existing ? computeFeatureHash(mapDbToAccountFeatures(existing as AccountFeaturesDbRow)) : null;

  // 2. Merge existing with patch
  const merged: AccountFeatures = {
    workspaceId: params.workspaceId,
    customerAccountId: params.customerAccountId,
    billingAvailable: params.patch?.billingAvailable ?? existing?.billing_available ?? false,
    billingStatus: params.patch?.billingStatus ?? existing?.billing_status ?? null,
    stripeCustomerId: params.patch?.stripeCustomerId ?? existing?.stripe_customer_id ?? null,
    stripeSubscriptionId: params.patch?.stripeSubscriptionId ?? existing?.stripe_subscription_id ?? null,
    currentMrrCents: params.patch?.currentMrrCents ?? existing?.current_mrr_cents ?? null,
    preCancelMrrCents: params.patch?.preCancelMrrCents ?? existing?.pre_cancel_mrr_cents ?? null,
    lastInvoiceId: params.patch?.lastInvoiceId ?? existing?.last_invoice_id ?? null,
    lastInvoiceStatus: params.patch?.lastInvoiceStatus ?? existing?.last_invoice_status ?? null,
    failedPaymentCount7d: params.patch?.failedPaymentCount7d ?? existing?.failed_payment_count_7d ?? 0,
    failedPaymentCount30d: params.patch?.failedPaymentCount30d ?? existing?.failed_payment_count_30d ?? 0,
    lastPaymentFailedAt: params.patch?.lastPaymentFailedAt ?? existing?.last_payment_failed_at ?? null,
    lastPaymentSucceededAt: params.patch?.lastPaymentSucceededAt ?? existing?.last_payment_succeeded_at ?? null,
    cancelAtPeriodEnd: params.patch?.cancelAtPeriodEnd ?? existing?.cancel_at_period_end ?? null,
    cancelledAt: params.patch?.cancelledAt ?? existing?.cancelled_at ?? null,
    usageAvailable: params.patch?.usageAvailable ?? existing?.usage_available ?? false,
    usageCurrent7d: params.patch?.usageCurrent7d ?? existing?.usage_current_7d ?? null,
    usagePrevious7d: params.patch?.usagePrevious7d ?? existing?.usage_previous_7d ?? null,
    usageDeltaPercent: params.patch?.usageDeltaPercent ?? existing?.usage_delta_percent ?? null,
    keyFeatureCurrent7d: params.patch?.keyFeatureCurrent7d ?? existing?.key_feature_current_7d ?? null,
    keyFeaturePrevious7d: params.patch?.keyFeaturePrevious7d ?? existing?.key_feature_previous_7d ?? null,
    keyFeatureMissing: params.patch?.keyFeatureMissing ?? existing?.key_feature_missing ?? null,
    cancelIntentAt: params.patch?.cancelIntentAt ?? existing?.cancel_intent_at ?? null,
    lastProductActivityAt: params.patch?.lastProductActivityAt ?? existing?.last_product_activity_at ?? null,
    communicationAvailable: params.patch?.communicationAvailable ?? existing?.communication_available ?? false,
    lastOutboundAt: params.patch?.lastOutboundAt ?? existing?.last_outbound_at ?? null,
    lastInboundAt: params.patch?.lastInboundAt ?? existing?.last_inbound_at ?? null,
    unrepliedOutboundCount: params.patch?.unrepliedOutboundCount ?? existing?.unreplied_outbound_count ?? 0,
    gmailThreadId: params.patch?.gmailThreadId ?? existing?.gmail_thread_id ?? null,
    billingFreshAt: params.patch?.billingFreshAt ?? existing?.billing_fresh_at ?? null,
    usageFreshAt: params.patch?.usageFreshAt ?? existing?.usage_fresh_at ?? null,
    communicationFreshAt: params.patch?.communicationFreshAt ?? existing?.communication_fresh_at ?? null,
    sourceWatermarks: params.patch?.sourceWatermarks ?? existing?.source_watermarks ?? {},
    featureVersion: RECOVERY_CONFIG.FEATURE_VERSION,
    computedAt: now,
    updatedAt: now,
  };

  // Re-calculate delta if usage counts updated
  if (merged.usageCurrent7d != null && merged.usagePrevious7d != null && params.patch?.usageDeltaPercent === undefined) {
    merged.usageDeltaPercent = computeUsageDelta(merged.usageCurrent7d, merged.usagePrevious7d);
  }

  // Key feature disappearance rule
  if (merged.keyFeaturePrevious7d != null && merged.keyFeatureCurrent7d != null && params.patch?.keyFeatureMissing === undefined) {
    merged.keyFeatureMissing =
      merged.keyFeaturePrevious7d >= RECOVERY_CONFIG.KEY_FEATURE_MIN_BASELINE_EVENTS &&
      merged.keyFeatureCurrent7d === 0;
  }

  const currentHash = computeFeatureHash(merged);
  const materialChange = previousHash !== currentHash;

  // 3. Upsert to account_features table
  const { error: upsertError } = await supabase.from('account_features').upsert(
    {
      workspace_id: merged.workspaceId,
      customer_account_id: merged.customerAccountId,
      billing_available: merged.billingAvailable,
      billing_status: merged.billingStatus,
      stripe_customer_id: merged.stripeCustomerId,
      stripe_subscription_id: merged.stripeSubscriptionId,
      current_mrr_cents: merged.currentMrrCents,
      pre_cancel_mrr_cents: merged.preCancelMrrCents,
      last_invoice_id: merged.lastInvoiceId,
      last_invoice_status: merged.lastInvoiceStatus,
      failed_payment_count_7d: merged.failedPaymentCount7d,
      failed_payment_count_30d: merged.failedPaymentCount30d,
      last_payment_failed_at: merged.lastPaymentFailedAt,
      last_payment_succeeded_at: merged.lastPaymentSucceededAt,
      cancel_at_period_end: merged.cancelAtPeriodEnd,
      cancelled_at: merged.cancelledAt,
      usage_available: merged.usageAvailable,
      usage_current_7d: merged.usageCurrent7d,
      usage_previous_7d: merged.usagePrevious7d,
      usage_delta_percent: merged.usageDeltaPercent,
      key_feature_current_7d: merged.keyFeatureCurrent7d,
      key_feature_previous_7d: merged.keyFeaturePrevious7d,
      key_feature_missing: merged.keyFeatureMissing,
      cancel_intent_at: merged.cancelIntentAt,
      last_product_activity_at: merged.lastProductActivityAt,
      communication_available: merged.communicationAvailable,
      last_outbound_at: merged.lastOutboundAt,
      last_inbound_at: merged.lastInboundAt,
      unreplied_outbound_count: merged.unrepliedOutboundCount,
      gmail_thread_id: merged.gmailThreadId,
      billing_fresh_at: merged.billingFreshAt,
      usage_fresh_at: merged.usageFreshAt,
      communication_fresh_at: merged.communicationFreshAt,
      source_watermarks: merged.sourceWatermarks,
      feature_version: merged.featureVersion,
      computed_at: merged.computedAt,
      updated_at: merged.updatedAt,
    },
    { onConflict: 'customer_account_id' }
  );

  if (upsertError) {
    throw new Error(`projectAccountFeatures upsert failed: ${upsertError.message}`);
  }

  return { features: merged, materialChange, previousHash, currentHash };
}

// §40.5.4: Private mapDbToFeatures removed — use exported mapDbToAccountFeatures instead.
