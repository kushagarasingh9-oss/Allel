import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyCustomerRisk } from './customer-classification';
import { type UnifiedAccountFeatures } from './customer-scan-types';

const BASE_FEATURES: UnifiedAccountFeatures = {
  customerAccountId: '550e8400-e29b-41d4-a716-446655440000',
  workspaceId: 'ws_demo_123',
  identityStatus: 'verified',
  identityConfidence: 1.0,

  billingAvailable: true,
  billingStatus: 'active',
  currentMrrCents: 100000, // $1,000 MRR
  preCancelMrrCents: null,
  renewalAt: '2026-09-30T00:00:00.000Z',
  cancelAtPeriodEnd: false,
  cancelledAt: null,
  failedPaymentCount7d: 0,
  failedPaymentCount30d: 0,

  usageAvailable: true,
  lastProductActivityAt: '2026-09-02T00:00:00.000Z',
  usageCurrent7d: 250,
  usagePrevious7d: 240,
  usageDeltaPercent: 4.1,
  keyFeatureMissing: false,
  cancelIntentAt: null,

  signupAt: '2026-06-01T00:00:00.000Z',
  onboardingCompletedAt: '2026-06-02T00:00:00.000Z',
  activationCompletedAt: '2026-06-03T00:00:00.000Z',
  planSelectedAt: '2026-06-01T00:00:00.000Z',

  supportAvailable: true,
  openSupportConversationCount: 0,
  oldestOpenSupportConversationAt: null,
  supportCancelThreat: false,
  supportBlockerCategory: null,

  communicationAvailable: true,
  lastOutboundAt: null,
  lastInboundAt: null,

  billingFreshAt: '2026-09-02T05:00:00.000Z',
  usageFreshAt: '2026-09-02T05:00:00.000Z',
  supportFreshAt: '2026-09-02T05:00:00.000Z',
  communicationFreshAt: null,
};

const NOW = '2026-09-02T06:00:00.000Z';

test('Rule R1: Subscription Canceled -> CONFIRMED_CHURN', () => {
  const result = classifyCustomerRisk(
    {
      ...BASE_FEATURES,
      billingStatus: 'canceled',
      cancelledAt: '2026-09-01T12:00:00.000Z',
      preCancelMrrCents: 100000,
      currentMrrCents: 0,
    },
    NOW
  );

  assert.equal(result.classification, 'confirmed_churn');
  assert.equal(result.severity, 'critical');
  assert.equal(result.likelyRootCause, 'explicit_cancellation');
  assert.equal(result.mrrAtRiskCents, 100000);
  assert.equal(result.recommendedAction.type, 'winback_analysis');
});

test('Rule R2: cancel_at_period_end -> IMMINENT_CHURN', () => {
  const result = classifyCustomerRisk(
    {
      ...BASE_FEATURES,
      cancelAtPeriodEnd: true,
      renewalAt: '2026-09-06T00:00:00.000Z',
    },
    NOW
  );

  assert.equal(result.classification, 'imminent_churn');
  assert.equal(result.severity, 'critical');
  assert.equal(result.mrrAtRiskCents, 100000);
  assert.equal(result.daysUntilRenewal, 4);
  assert.equal(result.recommendedAction.type, 'renewal_rescue');
  assert.equal(result.recommendedAction.discountEligible, true);
});

test('Rule R3: PostHog Cancel Intent -> IMMINENT_CHURN', () => {
  const result = classifyCustomerRisk(
    {
      ...BASE_FEATURES,
      cancelIntentAt: '2026-09-02T04:30:00.000Z',
    },
    NOW
  );

  assert.equal(result.classification, 'imminent_churn');
  assert.equal(result.severity, 'critical');
  assert.equal(result.likelyRootCause, 'explicit_cancellation');
  assert.equal(result.recommendedAction.type, 'preemptive_save');
});

test('Rule R4: Intercom Support Cancel Threat -> IMMINENT_CHURN', () => {
  const result = classifyCustomerRisk(
    {
      ...BASE_FEATURES,
      supportCancelThreat: true,
      openSupportConversationCount: 1,
      oldestOpenSupportConversationAt: '2026-08-30T00:00:00.000Z',
    },
    NOW
  );

  assert.equal(result.classification, 'imminent_churn');
  assert.equal(result.severity, 'critical');
  assert.equal(result.likelyRootCause, 'product_or_support_blocker');
  assert.equal(result.recommendedAction.type, 'executive_outreach');
});

test('Rule R5: Repeated Payment Failure (2+ fails) -> IMMINENT_CHURN (Involuntary Churn, No Discount)', () => {
  const result = classifyCustomerRisk(
    {
      ...BASE_FEATURES,
      billingStatus: 'past_due',
      failedPaymentCount7d: 2,
    },
    NOW
  );

  assert.equal(result.classification, 'imminent_churn');
  assert.equal(result.severity, 'critical');
  assert.equal(result.likelyRootCause, 'payment_failure');
  assert.equal(result.recommendedAction.type, 'billing_recovery');
  assert.equal(result.recommendedAction.discountEligible, false); // No discount for card failure
});

test('Rule R6: Compound Payment Failure + Usage Drop -> HIGH_RISK', () => {
  const result = classifyCustomerRisk(
    {
      ...BASE_FEATURES,
      failedPaymentCount7d: 1,
      usageDeltaPercent: -45.0,
      usageCurrent7d: 55,
      usagePrevious7d: 100,
    },
    NOW
  );

  assert.equal(result.classification, 'high_risk');
  assert.equal(result.severity, 'high');
  assert.equal(result.likelyRootCause, 'payment_failure');
  assert.equal(result.recommendedAction.type, 'compound_recovery');
});

test('Rule R7: Severe Usage Decline (>= 60%) -> HIGH_RISK', () => {
  const result = classifyCustomerRisk(
    {
      ...BASE_FEATURES,
      usageDeltaPercent: -75.0,
      usageCurrent7d: 25,
      usagePrevious7d: 100,
    },
    NOW
  );

  assert.equal(result.classification, 'high_risk');
  assert.equal(result.severity, 'high');
  assert.equal(result.likelyRootCause, 'product_disengagement');
  assert.equal(result.recommendedAction.type, 'value_restoration');
});

test('Rule R8: Key Feature Missing -> HIGH_RISK', () => {
  const result = classifyCustomerRisk(
    {
      ...BASE_FEATURES,
      keyFeatureMissing: true,
    },
    NOW
  );

  assert.equal(result.classification, 'high_risk');
  assert.equal(result.severity, 'high');
  assert.equal(result.likelyRootCause, 'product_disengagement');
  assert.equal(result.recommendedAction.type, 'feature_reengagement');
});

test('Rule R9: Extended Inactivity (>= 7 days) -> HIGH_RISK', () => {
  const result = classifyCustomerRisk(
    {
      ...BASE_FEATURES,
      lastProductActivityAt: '2026-08-20T00:00:00.000Z', // 13 days ago
    },
    NOW
  );

  assert.equal(result.classification, 'high_risk');
  assert.equal(result.severity, 'high');
  assert.equal(result.likelyRootCause, 'product_disengagement');
  assert.equal(result.daysSinceLastActivity, 13);
  assert.equal(result.recommendedAction.type, 'founder_nudge');
});

test('Rule R10: Open Support Blocker -> HIGH_RISK', () => {
  const result = classifyCustomerRisk(
    {
      ...BASE_FEATURES,
      openSupportConversationCount: 2,
      supportBlockerCategory: 'product_bug',
      oldestOpenSupportConversationAt: '2026-08-29T00:00:00.000Z',
    },
    NOW
  );

  assert.equal(result.classification, 'high_risk');
  assert.equal(result.severity, 'high');
  assert.equal(result.likelyRootCause, 'product_or_support_blocker');
  assert.equal(result.recommendedAction.type, 'support_escalation');
});

test('Rule R11: Stalled Onboarding (Signup >= 3d ago, onboarding incomplete) -> NEEDS_INTERVENTION', () => {
  const result = classifyCustomerRisk(
    {
      ...BASE_FEATURES,
      signupAt: '2026-08-28T00:00:00.000Z', // 5 days ago
      onboardingCompletedAt: null,
      activationCompletedAt: null,
    },
    NOW
  );

  assert.equal(result.classification, 'needs_intervention');
  assert.equal(result.severity, 'medium');
  assert.equal(result.likelyRootCause, 'onboarding_failure');
  assert.equal(result.recommendedAction.type, 'guided_onboarding');
});

test('Rule R12: Activation Incomplete (Onboarded but not activated) -> NEEDS_INTERVENTION', () => {
  const result = classifyCustomerRisk(
    {
      ...BASE_FEATURES,
      signupAt: '2026-08-28T00:00:00.000Z', // 5 days ago
      onboardingCompletedAt: '2026-08-29T00:00:00.000Z',
      activationCompletedAt: null,
    },
    NOW
  );

  assert.equal(result.classification, 'needs_intervention');
  assert.equal(result.severity, 'medium');
  assert.equal(result.likelyRootCause, 'onboarding_failure');
  assert.equal(result.recommendedAction.type, 'activation_nudge');
});

test('Rule R13: Active Billing + Current Usage -> HEALTHY ($0 MRR at risk)', () => {
  const result = classifyCustomerRisk(BASE_FEATURES, NOW);

  assert.equal(result.classification, 'healthy');
  assert.equal(result.severity, 'low');
  assert.equal(result.mrrAtRiskCents, 0);
  assert.equal(result.recommendedAction.type, 'no_action');
});

test('Rule R14: Identity Conflict -> INSUFFICIENT_DATA (Quarantined)', () => {
  const result = classifyCustomerRisk(
    {
      ...BASE_FEATURES,
      identityStatus: 'conflict',
    },
    NOW
  );

  assert.equal(result.classification, 'insufficient_data');
  assert.equal(result.severity, 'low');
  assert.equal(result.mrrAtRiskCents, 0);
  assert.equal(result.recommendedAction.type, 'verify_telemetry');
});

test('Rule R15: Missing Stripe Billing -> INSUFFICIENT_DATA', () => {
  const result = classifyCustomerRisk(
    {
      ...BASE_FEATURES,
      billingAvailable: false,
    },
    NOW
  );

  assert.equal(result.classification, 'insufficient_data');
  assert.equal(result.severity, 'low');
  assert.equal(result.missingData.includes('stripe'), true);
});
