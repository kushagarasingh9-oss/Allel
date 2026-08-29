import { AccountFeatures, ComponentResult, RiskDecision, Severity } from './types';
import { RECOVERY_CONFIG } from './config';

export function computeFreshnessMultiplier(freshAtIso: string | null, now: Date = new Date()): number {
  if (!freshAtIso) return 0.0;
  const ageMs = now.getTime() - new Date(freshAtIso).getTime();
  if (isNaN(ageMs) || ageMs < 0) return 1.0;
  const ageHours = ageMs / (1000 * 60 * 60);

  if (ageHours <= 1) return 1.0;
  if (ageHours <= 6) return 0.95;
  if (ageHours <= 24) return 0.85;
  if (ageHours <= 72) return 0.60;
  return 0.0;
}

export function computeBillingComponent(features: AccountFeatures): ComponentResult {
  const available = features.billingAvailable;
  const freshness = computeFreshnessMultiplier(features.billingFreshAt);
  const inputFacts: Record<string, unknown> = {
    billingStatus: features.billingStatus,
    failedPaymentCount7d: features.failedPaymentCount7d,
    failedPaymentCount30d: features.failedPaymentCount30d,
    cancelAtPeriodEnd: features.cancelAtPeriodEnd,
    cancelledAt: features.cancelledAt,
  };
  const ruleIds: string[] = [];

  if (!available) {
    return { value: 0, available: false, freshness: 0, inputFacts, evidenceIds: [], ruleIds };
  }

  let value = 0;

  if (features.cancelledAt) {
    value = Math.max(value, 100);
    ruleIds.push('billing_cancelled');
  }
  if (features.failedPaymentCount30d >= RECOVERY_CONFIG.REPEATED_PAYMENT_FAILURE_30D_MIN) {
    value = Math.max(value, 100);
    ruleIds.push('billing_failures_30d_gte_3');
  }
  if (features.failedPaymentCount7d >= RECOVERY_CONFIG.REPEATED_PAYMENT_FAILURE_7D_MIN) {
    value = Math.max(value, 95);
    ruleIds.push('billing_failures_7d_gte_2');
  }
  if (features.cancelAtPeriodEnd) {
    value = Math.max(value, 90);
    ruleIds.push('billing_cancel_at_period_end');
  }
  if (
    features.failedPaymentCount7d === RECOVERY_CONFIG.SINGLE_PAYMENT_FAILURE_7D_COUNT ||
    features.failedPaymentCount30d >= RECOVERY_CONFIG.SINGLE_PAYMENT_FAILURE_30D_MIN
  ) {
    value = Math.max(value, 80);
    ruleIds.push('billing_single_payment_failure');
  }
  if (features.billingStatus === 'past_due') {
    value = Math.max(value, 75);
    ruleIds.push('billing_status_past_due');
  }
  if (features.lastInvoiceStatus === 'open') {
    value = Math.max(value, 20);
    ruleIds.push('billing_invoice_open');
  }

  return {
    value,
    available: true,
    freshness,
    inputFacts,
    evidenceIds: ruleIds.map((r) => `fact_billing_${r}`),
    ruleIds,
  };
}

export function computeUsageComponent(features: AccountFeatures): ComponentResult {
  const available = features.usageAvailable;
  const freshness = computeFreshnessMultiplier(features.usageFreshAt);
  const inputFacts: Record<string, unknown> = {
    usageCurrent7d: features.usageCurrent7d,
    usagePrevious7d: features.usagePrevious7d,
    usageDeltaPercent: features.usageDeltaPercent,
    keyFeatureMissing: features.keyFeatureMissing,
    cancelIntentAt: features.cancelIntentAt,
  };
  const ruleIds: string[] = [];

  if (!available) {
    return { value: 0, available: false, freshness: 0, inputFacts, evidenceIds: [], ruleIds };
  }

  let value = 0;

  if (features.cancelIntentAt) {
    value = Math.max(value, 100);
    ruleIds.push('usage_cancel_intent');
  }
  if (features.keyFeatureMissing) {
    value = Math.max(value, 90);
    ruleIds.push('usage_key_feature_missing');
  }
  if (features.usageDeltaPercent != null) {
    const delta = features.usageDeltaPercent;
    if (delta <= RECOVERY_CONFIG.USAGE_SEVERE_DECLINE_PERCENT) {
      // <= -60
      value = Math.max(value, 85);
      ruleIds.push('usage_severe_decline');
    } else if (delta <= RECOVERY_CONFIG.USAGE_HIGH_DECLINE_PERCENT) {
      // -60 < delta <= -40
      value = Math.max(value, 65);
      ruleIds.push('usage_high_decline');
    } else if (delta <= RECOVERY_CONFIG.USAGE_MODERATE_DECLINE_PERCENT) {
      // -40 < delta <= -20
      value = Math.max(value, 35);
      ruleIds.push('usage_moderate_decline');
    } else {
      ruleIds.push('usage_stable_or_growing');
    }
  }

  return {
    value,
    available: true,
    freshness,
    inputFacts,
    evidenceIds: ruleIds.map((r) => `fact_usage_${r}`),
    ruleIds,
  };
}

export function computeCommunicationComponent(features: AccountFeatures, now: Date = new Date()): ComponentResult {
  const available = features.communicationAvailable && Boolean(features.lastOutboundAt);
  const freshness = computeFreshnessMultiplier(features.communicationFreshAt, now);
  const inputFacts: Record<string, unknown> = {
    lastOutboundAt: features.lastOutboundAt,
    lastInboundAt: features.lastInboundAt,
    unrepliedOutboundCount: features.unrepliedOutboundCount,
  };
  const ruleIds: string[] = [];

  if (!available) {
    return { value: 0, available: false, freshness: 0, inputFacts, evidenceIds: [], ruleIds };
  }

  let value = 0;

  if (features.lastInboundAt && features.lastOutboundAt) {
    const inboundTime = new Date(features.lastInboundAt).getTime();
    const outboundTime = new Date(features.lastOutboundAt).getTime();
    if (inboundTime >= outboundTime) {
      // Customer replied after our outreach
      value = 0;
      ruleIds.push('communication_customer_replied');
      return { value, available: true, freshness, inputFacts, evidenceIds: ['fact_comm_replied'], ruleIds };
    }
  }

  if (features.lastOutboundAt) {
    const daysUnreplied = (now.getTime() - new Date(features.lastOutboundAt).getTime()) / (1000 * 60 * 60 * 24);
    if (daysUnreplied >= RECOVERY_CONFIG.UNREPLIED_HIGH_DAYS) {
      value = 70;
      ruleIds.push('communication_unreplied_14d_plus');
    } else if (daysUnreplied >= RECOVERY_CONFIG.UNREPLIED_MEDIUM_DAYS) {
      value = 55;
      ruleIds.push('communication_unreplied_7_to_13d');
    } else if (daysUnreplied >= RECOVERY_CONFIG.UNREPLIED_LOW_DAYS) {
      value = 30;
      ruleIds.push('communication_unreplied_3_to_6d');
    } else {
      value = 10;
      ruleIds.push('communication_unreplied_under_3d');
    }
  }

  return {
    value,
    available: true,
    freshness,
    inputFacts,
    evidenceIds: ruleIds.map((r) => `fact_comm_${r}`),
    ruleIds,
  };
}

export function computeRiskDecision(
  features: AccountFeatures,
  identityConfidence: number = 1.0,
  mrrBaselineCents: number = 0
): RiskDecision {
  const billing = computeBillingComponent(features);
  const usage = computeUsageComponent(features);
  const communication = computeCommunicationComponent(features);

  const availableDomains: string[] = [];
  const missingDomains: string[] = [];

  let weightedSum = 0;
  let availableWeight = 0;
  let weightedFreshnessSum = 0;

  if (billing.available) {
    availableDomains.push('billing');
    weightedSum += billing.value * RECOVERY_CONFIG.BILLING_WEIGHT;
    availableWeight += RECOVERY_CONFIG.BILLING_WEIGHT;
    weightedFreshnessSum += billing.freshness * RECOVERY_CONFIG.BILLING_WEIGHT;
  } else {
    missingDomains.push('billing');
  }

  if (usage.available) {
    availableDomains.push('usage');
    weightedSum += usage.value * RECOVERY_CONFIG.USAGE_WEIGHT;
    availableWeight += RECOVERY_CONFIG.USAGE_WEIGHT;
    weightedFreshnessSum += usage.freshness * RECOVERY_CONFIG.USAGE_WEIGHT;
  } else {
    missingDomains.push('usage');
  }

  if (communication.available) {
    availableDomains.push('communication');
    weightedSum += communication.value * RECOVERY_CONFIG.COMMUNICATION_WEIGHT;
    availableWeight += RECOVERY_CONFIG.COMMUNICATION_WEIGHT;
    weightedFreshnessSum += communication.freshness * RECOVERY_CONFIG.COMMUNICATION_WEIGHT;
  } else {
    missingDomains.push('communication');
  }

  const baseScore = availableWeight > 0 ? weightedSum / availableWeight : null;
  const coverage = availableWeight; // weights sum to 1.0
  const avgFreshness = availableWeight > 0 ? weightedFreshnessSum / availableWeight : 0;
  const confidence = Math.max(0, Math.min(1, coverage * avgFreshness * identityConfidence));

  // Hard-event overrides & floors
  let finalScore = baseScore != null ? Math.round(baseScore) : null;
  let severity: Severity = 'low';
  const hardOverrides: string[] = [];

  if (finalScore != null) {
    if (finalScore >= RECOVERY_CONFIG.RISK_CRITICAL_MIN) severity = 'critical';
    else if (finalScore >= RECOVERY_CONFIG.RISK_HIGH_MIN) severity = 'high';
    else if (finalScore >= RECOVERY_CONFIG.RISK_MEDIUM_MIN) severity = 'medium';
    else severity = 'low';
  }

  // Compound signal check: billing >= 75 and usage >= 65
  if (billing.available && billing.value >= 75 && usage.available && usage.value >= 65) {
    finalScore = Math.max(finalScore ?? 0, RECOVERY_CONFIG.COMPOUND_SCORE_FLOOR);
    severity = 'critical';
    hardOverrides.push('compound_billing_and_usage_risk');
  }

  if (features.cancelledAt) {
    finalScore = Math.max(finalScore ?? 0, 95);
    severity = 'critical';
    hardOverrides.push('subscription_cancelled');
  } else if (features.cancelAtPeriodEnd) {
    finalScore = Math.max(finalScore ?? 0, 90);
    severity = 'critical';
    hardOverrides.push('cancel_at_period_end');
  } else if (features.cancelIntentAt) {
    finalScore = Math.max(finalScore ?? 0, 90);
    severity = 'critical';
    hardOverrides.push('cancel_intent');
  } else if (
    features.failedPaymentCount7d >= RECOVERY_CONFIG.REPEATED_PAYMENT_FAILURE_7D_MIN ||
    features.failedPaymentCount30d >= RECOVERY_CONFIG.REPEATED_PAYMENT_FAILURE_30D_MIN
  ) {
    finalScore = Math.max(finalScore ?? 0, 90);
    severity = 'critical';
    hardOverrides.push('repeated_payment_failure');
  } else if (
    features.failedPaymentCount7d === RECOVERY_CONFIG.SINGLE_PAYMENT_FAILURE_7D_COUNT ||
    features.failedPaymentCount30d >= RECOVERY_CONFIG.SINGLE_PAYMENT_FAILURE_30D_MIN
  ) {
    finalScore = Math.max(finalScore ?? 0, 80);
    if (severity === 'low' || severity === 'medium') severity = 'high';
    hardOverrides.push('single_payment_failure');
  } else if (features.billingStatus === 'past_due') {
    finalScore = Math.max(finalScore ?? 0, 75);
    if (severity === 'low' || severity === 'medium') severity = 'high';
    hardOverrides.push('past_due_billing');
  } else if (features.keyFeatureMissing) {
    finalScore = Math.max(finalScore ?? 0, 75);
    if (severity === 'low' || severity === 'medium') severity = 'high';
    hardOverrides.push('key_feature_disappearance');
  } else if (usage.available && usage.value >= 65) {
    finalScore = Math.max(finalScore ?? 0, 70);
    if (severity === 'low' || severity === 'medium') severity = 'high';
    hardOverrides.push('severe_usage_decline');
  } else if (usage.available && usage.value >= 35) {
    finalScore = Math.max(finalScore ?? 0, 45);
    if (severity === 'low') severity = 'medium';
    hardOverrides.push('moderate_usage_decline');
  }

  // Calculate Revenue Priority
  const severityMultiplier =
    severity === 'critical' ? 1.0 : severity === 'high' ? 0.75 : severity === 'medium' ? 0.4 : 0.1;
  const revenuePriority = mrrBaselineCents * severityMultiplier * Math.max(confidence, 0.25);

  return {
    score: finalScore,
    confidence: Math.round(confidence * 100) / 100,
    severity,
    components: {
      billing,
      usage,
      communication,
    },
    availableDomains,
    missingDomains,
    hardOverrides,
    revenuePriority: Math.round(revenuePriority),
    scoreVersion: RECOVERY_CONFIG.SCORE_VERSION,
    evaluatedAt: new Date().toISOString(),
  };
}
