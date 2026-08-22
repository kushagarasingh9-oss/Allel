import crypto from 'crypto';
import { SupabaseClient } from '@supabase/supabase-js';
import { AccountFeatures } from './types';
import { RECOVERY_CONFIG } from './config';

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

  const previousHash = existing ? computeFeatureHash(mapDbToFeatures(existing)) : null;

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
  await supabase.from('account_features').upsert(
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

  return { features: merged, materialChange, previousHash, currentHash };
}

function mapDbToFeatures(row: Record<string, any>): AccountFeatures {
  return {
    workspaceId: row.workspace_id,
    customerAccountId: row.customer_account_id,
    billingAvailable: row.billing_available,
    billingStatus: row.billing_status,
    stripeCustomerId: row.stripe_customer_id,
    stripeSubscriptionId: row.stripe_subscription_id,
    currentMrrCents: row.current_mrr_cents,
    preCancelMrrCents: row.pre_cancel_mrr_cents,
    lastInvoiceId: row.last_invoice_id,
    lastInvoiceStatus: row.last_invoice_status,
    failedPaymentCount7d: row.failed_payment_count_7d,
    failedPaymentCount30d: row.failed_payment_count_30d,
    lastPaymentFailedAt: row.last_payment_failed_at,
    lastPaymentSucceededAt: row.last_payment_succeeded_at,
    cancelAtPeriodEnd: row.cancel_at_period_end,
    cancelledAt: row.cancelled_at,
    usageAvailable: row.usage_available,
    usageCurrent7d: row.usage_current_7d,
    usagePrevious7d: row.usage_previous_7d,
    usageDeltaPercent: row.usage_delta_percent,
    keyFeatureCurrent7d: row.key_feature_current_7d,
    keyFeaturePrevious7d: row.key_feature_previous_7d,
    keyFeatureMissing: row.key_feature_missing,
    cancelIntentAt: row.cancel_intent_at,
    lastProductActivityAt: row.last_product_activity_at,
    communicationAvailable: row.communication_available,
    lastOutboundAt: row.last_outbound_at,
    lastInboundAt: row.last_inbound_at,
    unrepliedOutboundCount: row.unreplied_outbound_count,
    gmailThreadId: row.gmail_thread_id,
    billingFreshAt: row.billing_fresh_at,
    usageFreshAt: row.usage_fresh_at,
    communicationFreshAt: row.communication_fresh_at,
    sourceWatermarks: row.source_watermarks || {},
    featureVersion: row.feature_version,
    computedAt: row.computed_at,
    updatedAt: row.updated_at,
  };
}
