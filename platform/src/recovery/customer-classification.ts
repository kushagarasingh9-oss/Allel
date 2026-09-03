import {
  type OperationalClassification,
  type RiskSeverity,
  type RootCauseCategory,
  type EvidenceItem,
  type RecommendedAction,
  type UnifiedAccountFeatures,
  type IdentitySummary,
  type SourceFreshness,
  isActionableIdentity,
} from './customer-scan-types';

export type CustomerClassificationResult = {
  classification: OperationalClassification;
  severity: RiskSeverity;
  mrrAtRiskCents: number;
  daysUntilRenewal: number | null;
  daysSinceLastActivity: number | null;
  likelyRootCause: RootCauseCategory;
  evidence: EvidenceItem[];
  recommendedAction: RecommendedAction;
  identity: IdentitySummary;
  freshness: SourceFreshness;
  missingData: string[];
};

/**
 * Pure deterministic risk classifier.
 *
 * Evaluates unified telemetry across Stripe, PostHog, and Intercom
 * against 14 explainable operational rules without side effects.
 */
export function classifyCustomerRisk(
  features: UnifiedAccountFeatures,
  referenceNowIso?: string
): CustomerClassificationResult {
  const now = referenceNowIso ? new Date(referenceNowIso) : new Date();
  const evidence: EvidenceItem[] = [];
  const missingData: string[] = [];

  const identity: IdentitySummary = {
    status: features.identityStatus,
    confidence: features.identityConfidence,
  };

  const freshness: SourceFreshness = {
    stripe: features.billingFreshAt,
    posthog: features.usageFreshAt,
    intercom: features.supportFreshAt,
    gmail: features.communicationFreshAt,
  };

  // ─── 1. Check Source Availability & Freshness ─────────────────────
  if (!features.billingAvailable) missingData.push('stripe');
  if (!features.usageAvailable) missingData.push('posthog');
  if (!features.supportAvailable) missingData.push('intercom');

  // ─── 2. Calculate Renewal & Inactivity Proximity ──────────────────
  let daysUntilRenewal: number | null = null;
  if (features.renewalAt) {
    const renewalDate = new Date(features.renewalAt);
    const diffMs = renewalDate.getTime() - now.getTime();
    daysUntilRenewal = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
  }

  let daysSinceLastActivity: number | null = null;
  if (features.lastProductActivityAt) {
    const lastActivity = new Date(features.lastProductActivityAt);
    const diffMs = now.getTime() - lastActivity.getTime();
    daysSinceLastActivity = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
  }

  let daysSinceSignup: number | null = null;
  if (features.signupAt) {
    const signupDate = new Date(features.signupAt);
    const diffMs = now.getTime() - signupDate.getTime();
    daysSinceSignup = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
  }

  // ─── 3. Identity Conflict or Provisional Gating ───────────────────
  if (features.identityStatus === 'conflict') {
    evidence.push({
      provider: 'stripe',
      code: 'IDENTITY_CONFLICT_DETECTED',
      statement: 'Customer identity is conflicted across multiple provider records; outreach quarantined',
      observedAt: features.billingFreshAt || now.toISOString(),
    });

    return {
      classification: 'insufficient_data',
      severity: 'low',
      mrrAtRiskCents: 0,
      daysUntilRenewal,
      daysSinceLastActivity,
      likelyRootCause: 'unknown',
      evidence,
      recommendedAction: {
        type: 'verify_telemetry',
        urgency: 'monitor',
        reason: 'Quarantine outreach until customer identity conflict is resolved',
        discountEligible: false,
      },
      identity,
      freshness,
      missingData,
    };
  }

  // ─── 4. Missing Critical Providers / Stale Telemetry ──────────────
  if (!features.billingAvailable) {
    return {
      classification: 'insufficient_data',
      severity: 'low',
      mrrAtRiskCents: 0,
      daysUntilRenewal: null,
      daysSinceLastActivity,
      likelyRootCause: 'unknown',
      evidence: [
        {
          provider: 'stripe',
          code: 'STRIPE_TELEMETRY_MISSING',
          statement: 'No billing or subscription record found in Stripe',
          observedAt: now.toISOString(),
        },
      ],
      recommendedAction: {
        type: 'verify_telemetry',
        urgency: 'monitor',
        reason: 'Connect or sync Stripe billing to establish revenue-bearing baseline',
        discountEligible: false,
      },
      identity,
      freshness,
      missingData,
    };
  }

  // ─── 5. RULE R1: Confirmed Churn (Subscription Canceled) ──────────
  if (features.billingStatus === 'canceled' || features.cancelledAt !== null) {
    evidence.push({
      provider: 'stripe',
      code: 'STRIPE_SUBSCRIPTION_CANCELED',
      statement: `Subscription is canceled (Previously $${((features.preCancelMrrCents ?? features.currentMrrCents) / 100).toFixed(2)} MRR)`,
      observedAt: features.cancelledAt || features.billingFreshAt || now.toISOString(),
    });

    return {
      classification: 'confirmed_churn',
      severity: 'critical',
      mrrAtRiskCents: features.preCancelMrrCents ?? features.currentMrrCents,
      daysUntilRenewal: 0,
      daysSinceLastActivity,
      likelyRootCause: 'explicit_cancellation',
      evidence,
      recommendedAction: {
        type: 'winback_analysis',
        urgency: 'this_week',
        reason: 'Revenue already lost; conduct win-back analysis rather than immediate churn prevention',
        discountEligible: true,
        suggestedDiscountPercent: 30,
        suggestedDiscountDurationMonths: 6,
      },
      identity,
      freshness,
      missingData,
    };
  }

  const mrrAtRisk = features.currentMrrCents;

  // ─── 6. RULE R2: Scheduled Cancellation (cancel_at_period_end) ────
  if (features.cancelAtPeriodEnd) {
    evidence.push({
      provider: 'stripe',
      code: 'STRIPE_CANCEL_AT_PERIOD_END',
      statement: `Subscription scheduled to cancel at end of current period${daysUntilRenewal !== null ? ` (in ${daysUntilRenewal} days)` : ''}`,
      observedAt: features.billingFreshAt || now.toISOString(),
    });

    // Check if PostHog or Intercom provides deeper root cause
    let likelyRootCause: RootCauseCategory = 'explicit_cancellation';
    let actionReason = `Customer scheduled cancellation in ${daysUntilRenewal ?? 'few'} days. Immediate intervention required.`;

    if (features.cancelIntentAt) {
      evidence.push({
        provider: 'posthog',
        code: 'POSTHOG_CANCEL_PAGE_INTENT',
        statement: 'Customer navigated to billing cancellation flow in product',
        observedAt: features.cancelIntentAt,
      });
    }

    if (features.openSupportConversationCount > 0) {
      evidence.push({
        provider: 'intercom',
        code: 'INTERCOM_OPEN_BLOCKER_DURING_CANCEL',
        statement: `${features.openSupportConversationCount} open support conversation(s) (${features.supportBlockerCategory || 'general issue'})`,
        observedAt: features.oldestOpenSupportConversationAt || features.supportFreshAt || now.toISOString(),
      });
      likelyRootCause = 'product_or_support_blocker';
      actionReason = `Customer scheduled cancellation after facing unresolved support blocker (${features.supportBlockerCategory || 'support issue'}).`;
    } else if (daysSinceLastActivity !== null && daysSinceLastActivity >= 5) {
      evidence.push({
        provider: 'posthog',
        code: 'POSTHOG_INACTIVITY_DURING_CANCEL',
        statement: `Customer inactive for ${daysSinceLastActivity} days prior to cancellation`,
        observedAt: features.lastProductActivityAt || features.usageFreshAt || now.toISOString(),
      });
      likelyRootCause = 'product_disengagement';
    }

    return {
      classification: 'imminent_churn',
      severity: 'critical',
      mrrAtRiskCents: mrrAtRisk,
      daysUntilRenewal,
      daysSinceLastActivity,
      likelyRootCause,
      evidence,
      recommendedAction: {
        type: 'renewal_rescue',
        urgency: 'now',
        reason: actionReason,
        discountEligible: true,
        suggestedDiscountPercent: 20,
        suggestedDiscountDurationMonths: 3,
      },
      identity,
      freshness,
      missingData,
    };
  }

  // ─── 7. RULE R3: PostHog Explicit Cancellation Intent ─────────────
  if (features.cancelIntentAt) {
    evidence.push({
      provider: 'posthog',
      code: 'POSTHOG_EXPLICIT_CANCEL_INTENT',
      statement: 'Customer clicked cancellation or downgrade button in product settings',
      observedAt: features.cancelIntentAt,
    });

    return {
      classification: 'imminent_churn',
      severity: 'critical',
      mrrAtRiskCents: mrrAtRisk,
      daysUntilRenewal,
      daysSinceLastActivity,
      likelyRootCause: 'explicit_cancellation',
      evidence,
      recommendedAction: {
        type: 'preemptive_save',
        urgency: 'today',
        reason: 'Customer triggered cancellation intent in app; reach out before subscription is officially canceled',
        discountEligible: true,
        suggestedDiscountPercent: 20,
        suggestedDiscountDurationMonths: 3,
      },
      identity,
      freshness,
      missingData,
    };
  }

  // ─── 8. RULE R4: Intercom Explicit Cancellation Threat ────────────
  if (features.supportCancelThreat) {
    evidence.push({
      provider: 'intercom',
      code: 'INTERCOM_EXPLICIT_CANCEL_THREAT',
      statement: 'Customer explicitly stated intention to cancel or request refund in support message',
      observedAt: features.oldestOpenSupportConversationAt || features.supportFreshAt || now.toISOString(),
    });

    return {
      classification: 'imminent_churn',
      severity: 'critical',
      mrrAtRiskCents: mrrAtRisk,
      daysUntilRenewal,
      daysSinceLastActivity,
      likelyRootCause: 'product_or_support_blocker',
      evidence,
      recommendedAction: {
        type: 'executive_outreach',
        urgency: 'now',
        reason: 'Customer threatened cancellation in support ticket; executive founder outreach required',
        discountEligible: true,
        suggestedDiscountPercent: 25,
        suggestedDiscountDurationMonths: 3,
      },
      identity,
      freshness,
      missingData,
    };
  }

  // ─── 9. RULE R5: Repeated Failed Payments (Involuntary Churn) ─────
  if (features.failedPaymentCount7d >= 2) {
    evidence.push({
      provider: 'stripe',
      code: 'STRIPE_REPEATED_PAYMENT_FAILURE',
      statement: `${features.failedPaymentCount7d} failed payment attempts in the last 7 days`,
      observedAt: features.billingFreshAt || now.toISOString(),
    });

    return {
      classification: 'imminent_churn',
      severity: 'critical',
      mrrAtRiskCents: mrrAtRisk,
      daysUntilRenewal,
      daysSinceLastActivity,
      likelyRootCause: 'payment_failure',
      evidence,
      recommendedAction: {
        type: 'billing_recovery',
        urgency: 'now',
        reason: 'Urgent card update required; do not offer discount for involuntary card failure',
        discountEligible: false,
      },
      identity,
      freshness,
      missingData,
    };
  }

  // ─── 10. RULE R6: Compound Billing + Usage Deterioration ───────────
  if (features.failedPaymentCount7d >= 1 && features.usageDeltaPercent <= -40) {
    evidence.push({
      provider: 'stripe',
      code: 'STRIPE_PAYMENT_FAILURE',
      statement: '1 failed payment attempt in the last 7 days',
      observedAt: features.billingFreshAt || now.toISOString(),
    });
    evidence.push({
      provider: 'posthog',
      code: 'POSTHOG_COMPOUND_USAGE_DECLINE',
      statement: `Weekly product usage dropped by ${Math.abs(features.usageDeltaPercent).toFixed(1)}% (${features.usagePrevious7d} -> ${features.usageCurrent7d} events)`,
      observedAt: features.usageFreshAt || now.toISOString(),
    });

    return {
      classification: 'high_risk',
      severity: 'high',
      mrrAtRiskCents: mrrAtRisk,
      daysUntilRenewal,
      daysSinceLastActivity,
      likelyRootCause: 'payment_failure',
      evidence,
      recommendedAction: {
        type: 'compound_recovery',
        urgency: 'today',
        reason: 'Compound risk: Customer has payment failure alongside significant product usage drop',
        discountEligible: false,
      },
      identity,
      freshness,
      missingData,
    };
  }

  // ─── 10b. RULE R6b: Single Payment Failure / Past Due Billing ─────
  if (features.billingStatus === 'past_due' || features.failedPaymentCount7d >= 1) {
    evidence.push({
      provider: 'stripe',
      code: 'STRIPE_PAYMENT_PAST_DUE',
      statement: features.failedPaymentCount7d >= 1
        ? `${features.failedPaymentCount7d} failed payment attempt in the last 7 days; invoice is past due`
        : 'Subscription is past due; invoice payment pending',
      observedAt: features.billingFreshAt || now.toISOString(),
    });

    return {
      classification: 'high_risk',
      severity: 'high',
      mrrAtRiskCents: mrrAtRisk,
      daysUntilRenewal,
      daysSinceLastActivity,
      likelyRootCause: 'payment_failure',
      evidence,
      recommendedAction: {
        type: 'billing_recovery',
        urgency: 'today',
        reason: 'Invoice payment is past due; send card update reminder without discount',
        discountEligible: false,
      },
      identity,
      freshness,
      missingData,
    };
  }

  // ─── 11. RULE R7: Severe Usage Decline (≥60% drop) ────────────────
  if (features.usageAvailable && features.usagePrevious7d >= 10 && features.usageDeltaPercent <= -60) {
    evidence.push({
      provider: 'posthog',
      code: 'POSTHOG_SEVERE_USAGE_COLLAPSE',
      statement: `Severe usage decline of ${Math.abs(features.usageDeltaPercent).toFixed(1)}% in the last 7 days`,
      observedAt: features.usageFreshAt || now.toISOString(),
    });

    return {
      classification: 'high_risk',
      severity: 'high',
      mrrAtRiskCents: mrrAtRisk,
      daysUntilRenewal,
      daysSinceLastActivity,
      likelyRootCause: 'product_disengagement',
      evidence,
      recommendedAction: {
        type: 'value_restoration',
        urgency: 'today',
        reason: 'Usage collapsed by >60%; customer is disengaging from the product',
        discountEligible: false,
      },
      identity,
      freshness,
      missingData,
    };
  }

  // ─── 12. RULE R8: Key Feature Abandonment ─────────────────────────
  if (features.usageAvailable && features.keyFeatureMissing) {
    evidence.push({
      provider: 'posthog',
      code: 'POSTHOG_KEY_FEATURE_MISSING',
      statement: 'Core product feature was previously used actively, now zero usage in the last 7 days',
      observedAt: features.usageFreshAt || now.toISOString(),
    });

    return {
      classification: 'high_risk',
      severity: 'high',
      mrrAtRiskCents: mrrAtRisk,
      daysUntilRenewal,
      daysSinceLastActivity,
      likelyRootCause: 'product_disengagement',
      evidence,
      recommendedAction: {
        type: 'feature_reengagement',
        urgency: 'today',
        reason: 'Customer stopped using core value-delivering feature',
        discountEligible: false,
      },
      identity,
      freshness,
      missingData,
    };
  }

  // ─── 13. RULE R9: Extended Inactivity (≥7 days inactive) ──────────
  if (features.usageAvailable && daysSinceLastActivity !== null && daysSinceLastActivity >= 7) {
    evidence.push({
      provider: 'posthog',
      code: 'POSTHOG_INACTIVITY_STREAK',
      statement: `Zero product logins or activity for ${daysSinceLastActivity} consecutive days`,
      observedAt: features.lastProductActivityAt || features.usageFreshAt || now.toISOString(),
    });

    return {
      classification: 'high_risk',
      severity: 'high',
      mrrAtRiskCents: mrrAtRisk,
      daysUntilRenewal,
      daysSinceLastActivity,
      likelyRootCause: 'product_disengagement',
      evidence,
      recommendedAction: {
        type: 'founder_nudge',
        urgency: 'today',
        reason: `Customer completely inactive for ${daysSinceLastActivity} days; high risk of silent churn`,
        discountEligible: false,
      },
      identity,
      freshness,
      missingData,
    };
  }

  // ─── 14. RULE R10: Unresolved Support Blocker (≥3 days open) ───────
  if (features.supportAvailable && features.openSupportConversationCount > 0) {
    evidence.push({
      provider: 'intercom',
      code: 'INTERCOM_UNRESOLVED_BLOCKER',
      statement: `${features.openSupportConversationCount} unresolved support ticket(s) in category: ${features.supportBlockerCategory || 'general'}`,
      observedAt: features.oldestOpenSupportConversationAt || features.supportFreshAt || now.toISOString(),
    });

    return {
      classification: 'high_risk',
      severity: 'high',
      mrrAtRiskCents: mrrAtRisk,
      daysUntilRenewal,
      daysSinceLastActivity,
      likelyRootCause: 'product_or_support_blocker',
      evidence,
      recommendedAction: {
        type: 'support_escalation',
        urgency: 'today',
        reason: 'Unresolved support blocker is causing adoption friction',
        discountEligible: false,
      },
      identity,
      freshness,
      missingData,
    };
  }

  // ─── 15. RULE R11: Stalled Onboarding (Signup ≥3d ago, not done) ──
  if (daysSinceSignup !== null && daysSinceSignup >= 3 && features.onboardingCompletedAt === null) {
    evidence.push({
      provider: 'posthog',
      code: 'POSTHOG_ONBOARDING_STALLED',
      statement: `Signed up ${daysSinceSignup} days ago but onboarding workflow has not been completed`,
      observedAt: features.signupAt || now.toISOString(),
    });

    return {
      classification: 'needs_intervention',
      severity: 'medium',
      mrrAtRiskCents: mrrAtRisk,
      daysUntilRenewal,
      daysSinceLastActivity,
      likelyRootCause: 'onboarding_failure',
      evidence,
      recommendedAction: {
        type: 'guided_onboarding',
        urgency: 'this_week',
        reason: 'Onboarding is stalled; customer has not reached initial setup milestone',
        discountEligible: false,
      },
      identity,
      freshness,
      missingData,
    };
  }

  // ─── 16. RULE R12: Activation Failure (Onboarded but not activated)
  if (
    features.onboardingCompletedAt !== null &&
    features.activationCompletedAt === null &&
    daysSinceSignup !== null &&
    daysSinceSignup >= 3
  ) {
    evidence.push({
      provider: 'posthog',
      code: 'POSTHOG_ACTIVATION_INCOMPLETE',
      statement: 'Completed onboarding setup but has not triggered core activation milestone',
      observedAt: features.onboardingCompletedAt,
    });

    return {
      classification: 'needs_intervention',
      severity: 'medium',
      mrrAtRiskCents: mrrAtRisk,
      daysUntilRenewal,
      daysSinceLastActivity,
      likelyRootCause: 'onboarding_failure',
      evidence,
      recommendedAction: {
        type: 'activation_nudge',
        urgency: 'this_week',
        reason: 'Customer completed setup but has not realized core product value',
        discountEligible: false,
      },
      identity,
      freshness,
      missingData,
    };
  }

  // ─── 17. RULE R13: Healthy Active Account ─────────────────────────
  if (features.billingStatus === 'active' && features.usageCurrent7d > 0) {
    evidence.push({
      provider: 'stripe',
      code: 'STRIPE_BILLING_HEALTHY',
      statement: `Active subscription ($${(features.currentMrrCents / 100).toFixed(2)} MRR) in good standing`,
      observedAt: features.billingFreshAt || now.toISOString(),
    });
    if (features.usageAvailable) {
      evidence.push({
        provider: 'posthog',
        code: 'POSTHOG_USAGE_HEALTHY',
        statement: `Active product usage with ${features.usageCurrent7d} events in the last 7 days`,
        observedAt: features.usageFreshAt || now.toISOString(),
      });
    }

    return {
      classification: 'healthy',
      severity: 'low',
      mrrAtRiskCents: 0,
      daysUntilRenewal,
      daysSinceLastActivity,
      likelyRootCause: 'unknown',
      evidence,
      recommendedAction: {
        type: 'no_action',
        urgency: 'monitor',
        reason: 'Account is healthy with active billing and sustained product engagement',
        discountEligible: false,
      },
      identity,
      freshness,
      missingData,
    };
  }

  // ─── 18. Default Fallback ─────────────────────────────────────────
  return {
    classification: 'insufficient_data',
    severity: 'low',
    mrrAtRiskCents: 0,
    daysUntilRenewal,
    daysSinceLastActivity,
    likelyRootCause: 'unknown',
    evidence: [
      {
        provider: 'stripe',
        code: 'TELEMETRY_INCONCLUSIVE',
        statement: 'Telemetry is inconclusive; maintain monitoring',
        observedAt: now.toISOString(),
      },
    ],
    recommendedAction: {
      type: 'verify_telemetry',
      urgency: 'monitor',
      reason: 'Collect additional product usage baseline before triggering outreach',
      discountEligible: false,
    },
    identity,
    freshness,
    missingData,
  };
}
