import test from 'node:test';
import assert from 'node:assert/strict';
import {
  OperationalClassificationSchema,
  RootCauseCategorySchema,
  EvidenceItemSchema,
  RecommendedActionSchema,
  CustomerRiskScanSchema,
  FleetRiskScanSchema,
  UnifiedAccountFeaturesSchema,
  isActionableIdentity,
  validateCustomerRiskScan,
  validateFleetRiskScan,
  type CustomerRiskScan,
  type FleetRiskScan,
} from './customer-scan-types';

test('Block 1: Scan Contracts — Operational Classifications Schema', () => {
  const validClassifications = [
    'confirmed_churn',
    'imminent_churn',
    'high_risk',
    'needs_intervention',
    'healthy',
    'insufficient_data',
  ];

  for (const c of validClassifications) {
    assert.equal(OperationalClassificationSchema.parse(c), c);
  }

  assert.throws(() => OperationalClassificationSchema.parse('invalid_class'), /Invalid/);
});

test('Block 1: Scan Contracts — Root Cause Categories Schema', () => {
  const validRootCauses = [
    'payment_failure',
    'onboarding_failure',
    'product_disengagement',
    'product_or_support_blocker',
    'explicit_cancellation',
    'unknown',
  ];

  for (const rc of validRootCauses) {
    assert.equal(RootCauseCategorySchema.parse(rc), rc);
  }

  assert.throws(() => RootCauseCategorySchema.parse('random_reason'), /Invalid/);
});

test('Block 1: Scan Contracts — Evidence Item Validation', () => {
  const validEvidence = {
    provider: 'stripe',
    code: 'STRIPE_CANCEL_AT_PERIOD_END',
    statement: 'Subscription scheduled to cancel on Sept 6, 2026',
    observedAt: '2026-09-02T05:00:00.000Z',
  };

  const parsed = EvidenceItemSchema.parse(validEvidence);
  assert.equal(parsed.provider, 'stripe');
  assert.equal(parsed.code, 'STRIPE_CANCEL_AT_PERIOD_END');

  // Must reject invalid provider
  assert.throws(
    () => EvidenceItemSchema.parse({ ...validEvidence, provider: 'salesforce' }),
    /Invalid/
  );

  // Must reject invalid date
  assert.throws(
    () => EvidenceItemSchema.parse({ ...validEvidence, observedAt: 'not-a-date' }),
    /observedAt must be ISO-8601/
  );
});

test('Block 1: Scan Contracts — Customer Risk Scan validates complete fixture & integer cents MRR', () => {
  const validScan: CustomerRiskScan = {
    accountId: '550e8400-e29b-41d4-a716-446655440000',
    accountName: 'Acme Corp',
    primaryEmail: 'founder@acme.com',
    classification: 'imminent_churn',
    severity: 'critical',
    mrrAtRiskCents: 100000, // $1,000.00 in integer cents
    daysUntilRenewal: 4,
    daysSinceLastActivity: 6,
    likelyRootCause: 'explicit_cancellation',
    evidence: [
      {
        provider: 'stripe',
        code: 'STRIPE_CANCEL_AT_PERIOD_END',
        statement: 'Subscription scheduled to cancel in 4 days',
        observedAt: '2026-09-02T05:00:00.000Z',
      },
      {
        provider: 'posthog',
        code: 'POSTHOG_VISITED_CANCEL_PAGE',
        statement: 'Visited /billing/cancel and triggered cancel button',
        observedAt: '2026-09-02T04:30:00.000Z',
      },
    ],
    recommendedAction: {
      type: 'renewal_rescue',
      urgency: 'today',
      reason: 'Scheduled cancellation in 4 days due to product frustration',
      discountEligible: true,
      suggestedDiscountPercent: 20,
      suggestedDiscountDurationMonths: 3,
    },
    identity: {
      status: 'verified',
      confidence: 1.0,
    },
    freshness: {
      stripe: '2026-09-02T05:00:00.000Z',
      posthog: '2026-09-02T04:45:00.000Z',
      intercom: '2026-09-02T04:50:00.000Z',
      gmail: null,
    },
    missingData: [],
  };

  const validated = validateCustomerRiskScan(validScan);
  assert.equal(validated.accountName, 'Acme Corp');
  assert.equal(validated.mrrAtRiskCents, 100000);
  assert.equal(validated.classification, 'imminent_churn');

  // Must reject fractional / floating MRR (cents must be integer)
  assert.throws(
    () => validateCustomerRiskScan({ ...validScan, mrrAtRiskCents: 1000.5 }),
    /expected int|integer/i
  );

  // Must reject negative MRR
  assert.throws(
    () => validateCustomerRiskScan({ ...validScan, mrrAtRiskCents: -500 }),
    /MRR must be non-negative integer cents/
  );

  // Must reject invalid UUID for accountId
  assert.throws(
    () => validateCustomerRiskScan({ ...validScan, accountId: 'not-a-uuid' }),
    /accountId must be a valid UUID/
  );
});

test('Block 1: Scan Contracts — Fleet Risk Scan validates bounds and aggregates', () => {
  const sampleScan: CustomerRiskScan = {
    accountId: '550e8400-e29b-41d4-a716-446655440001',
    accountName: 'Beta Ltd',
    primaryEmail: 'ceo@beta.com',
    classification: 'high_risk',
    severity: 'high',
    mrrAtRiskCents: 45000,
    daysUntilRenewal: 12,
    daysSinceLastActivity: 8,
    likelyRootCause: 'product_disengagement',
    evidence: [],
    recommendedAction: {
      type: 'value_restoration',
      urgency: 'today',
      reason: '70% drop in active usage',
      discountEligible: false,
    },
    identity: {
      status: 'verified',
      confidence: 0.95,
    },
    freshness: {
      stripe: '2026-09-02T05:00:00.000Z',
      posthog: '2026-09-02T05:00:00.000Z',
      intercom: null,
      gmail: null,
    },
    missingData: ['intercom'],
  };

  const validFleet: FleetRiskScan = {
    workspaceId: 'ws_demo_123',
    scannedAt: '2026-09-02T05:00:00.000Z',
    totalAccountsScanned: 10,
    actionableAccountsCount: 10,
    totalMrrProtectedCents: 1200000,
    totalMrrAtRiskCents: 45000,
    breakdown: {
      confirmedChurn: 0,
      imminentChurn: 0,
      highRisk: 1,
      needsIntervention: 0,
      healthy: 9,
      insufficientData: 0,
    },
    topAtRiskAccounts: [sampleScan],
  };

  const parsedFleet = validateFleetRiskScan(validFleet);
  assert.equal(parsedFleet.workspaceId, 'ws_demo_123');
  assert.equal(parsedFleet.topAtRiskAccounts.length, 1);

  // Must reject fleet with > 20 accounts (bounded to 20 for buildathon)
  const twentyOneAccounts = Array(21).fill(sampleScan);
  assert.throws(
    () => validateFleetRiskScan({ ...validFleet, topAtRiskAccounts: twentyOneAccounts }),
    /Fleet scan is bounded to top 20 accounts/
  );
});

test('Block 1: Scan Contracts — Identity Actionability Guard', () => {
  // Verified with high confidence is actionable
  assert.equal(isActionableIdentity({ status: 'verified', confidence: 0.95 }), true);
  assert.equal(isActionableIdentity({ status: 'verified', confidence: 0.70 }), true);

  // Verified with low confidence is NOT actionable
  assert.equal(isActionableIdentity({ status: 'verified', confidence: 0.50 }), false);

  // Provisional is NEVER actionable for outreach
  assert.equal(isActionableIdentity({ status: 'provisional', confidence: 0.95 }), false);

  // Conflict is NEVER actionable
  assert.equal(isActionableIdentity({ status: 'conflict', confidence: 1.0 }), false);
});
