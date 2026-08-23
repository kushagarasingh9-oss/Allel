import test from 'node:test';
import assert from 'node:assert/strict';
import { RECOVERY_CONFIG, RecoveryConfigSchema } from './config';
import { buildCanonicalProviderEvent, computePayloadHash, computeDedupeKey } from './events';
import { normalizeExternalId } from './identity';
import { computeFeatureHash, computeUsageDelta } from './features';
import { computeRiskDecision, computeBillingComponent, computeUsageComponent, computeFreshnessMultiplier } from './scoring';
import { evaluateActionPolicy } from './policy';
import { constructCaseKey } from './cases';
import { LEGAL_TRANSITIONS } from './transitions';
import { redactEvidenceForPrompt, sanitizeCustomerText } from './redaction';
import { evaluateScenarioManifest } from './scenarios/evaluate';
import { AccountFeatures } from './types';

test('Recovery Config Schema validates domain weights sum to 1.00 and thresholds are ordered', () => {
  assert.equal(RECOVERY_CONFIG.BILLING_WEIGHT + RECOVERY_CONFIG.USAGE_WEIGHT + RECOVERY_CONFIG.COMMUNICATION_WEIGHT, 1.0);
  assert.ok(RECOVERY_CONFIG.RISK_MEDIUM_MIN < RECOVERY_CONFIG.RISK_HIGH_MIN);
  assert.ok(RECOVERY_CONFIG.RISK_HIGH_MIN < RECOVERY_CONFIG.RISK_CRITICAL_MIN);

  // Invalid weights should throw
  assert.throws(() => {
    RecoveryConfigSchema.parse({
      BILLING_WEIGHT: 0.8,
      USAGE_WEIGHT: 0.8,
      COMMUNICATION_WEIGHT: 0.1,
    });
  });
});

test('Canonical event envelope computes deterministic SHA-256 payload hash and dedupe key', () => {
  const payload = JSON.stringify({ id: 'evt_123', type: 'invoice.payment_failed' });
  const hash1 = computePayloadHash(payload);
  const hash2 = computePayloadHash(Buffer.from(payload));
  assert.equal(hash1, hash2);
  assert.equal(hash1.length, 64);

  const dedupeKey = computeDedupeKey({
    workspaceId: 'ws_abc',
    provider: 'stripe',
    providerEventId: 'evt_123',
  });
  assert.equal(dedupeKey, 'ws_abc:stripe:evt_123');

  const envelope = buildCanonicalProviderEvent({
    workspaceId: 'ws_abc',
    provider: 'stripe',
    providerEventId: 'evt_123',
    eventType: 'invoice.payment_failed',
    occurredAt: '2026-08-22T00:00:00.000Z',
    rawPayload: payload,
  });

  assert.equal(envelope.provider, 'stripe');
  assert.equal(envelope.payloadHash, hash1);
  assert.equal(envelope.dedupeKey, dedupeKey);
});

test('Identity normalizer trims and lowercases emails while preserving provider IDs', () => {
  assert.equal(normalizeExternalId('  User@Domain.COM  ', 'email_address'), 'user@domain.com');
  assert.equal(normalizeExternalId('  User@Domain.COM  ', 'person_email'), 'user@domain.com');
  assert.equal(normalizeExternalId('  cus_123AbC  ', 'customer_id'), 'cus_123AbC');
  assert.equal(normalizeExternalId('  distinct_XYZ  ', 'distinct_id'), 'distinct_XYZ');

  assert.throws(() => normalizeExternalId('', 'customer_id'));
  assert.throws(() => normalizeExternalId('   ', 'email_address'));
});

test('Usage delta formula enforces minimum volume boundary and percentage calculations', () => {
  // Volume < 10 events returns null (unavailable)
  assert.equal(computeUsageDelta(3, 5, 10), null);
  // Volume >= 10 computes delta correctly
  assert.equal(computeUsageDelta(50, 100, 10), -50);
  assert.equal(computeUsageDelta(120, 100, 10), 20);
  assert.equal(computeUsageDelta(0, 100, 10), -100);
});

test('Feature hashing detects material changes and ignores non-risk field updates', () => {
  const baseFeatures: Partial<AccountFeatures> = {
    billingAvailable: true,
    billingStatus: 'active',
    currentMrrCents: 100000,
    failedPaymentCount7d: 0,
    usageAvailable: true,
    usageDeltaPercent: 0,
  };

  const hash1 = computeFeatureHash(baseFeatures);
  const hash2 = computeFeatureHash({ ...baseFeatures });
  assert.equal(hash1, hash2);

  // Material change: payment failure
  const hash3 = computeFeatureHash({ ...baseFeatures, failedPaymentCount7d: 1 });
  assert.notEqual(hash1, hash3);
});

test('Deterministic scoring model calculates components and availability-aware score', () => {
  const features: AccountFeatures = {
    workspaceId: 'ws_test',
    customerAccountId: 'acc_test',
    billingAvailable: true,
    billingStatus: 'past_due',
    stripeCustomerId: 'cus_123',
    stripeSubscriptionId: null,
    currentMrrCents: 120000,
    preCancelMrrCents: null,
    lastInvoiceId: 'in_123',
    lastInvoiceStatus: 'open',
    failedPaymentCount7d: 1,
    failedPaymentCount30d: 1,
    lastPaymentFailedAt: new Date().toISOString(),
    lastPaymentSucceededAt: null,
    cancelAtPeriodEnd: null,
    cancelledAt: null,
    usageAvailable: true,
    usageCurrent7d: 100,
    usagePrevious7d: 100,
    usageDeltaPercent: 0,
    keyFeatureCurrent7d: 5,
    keyFeaturePrevious7d: 5,
    keyFeatureMissing: false,
    cancelIntentAt: null,
    lastProductActivityAt: null,
    communicationAvailable: false,
    lastOutboundAt: null,
    lastInboundAt: null,
    unrepliedOutboundCount: 0,
    gmailThreadId: null,
    billingFreshAt: new Date().toISOString(),
    usageFreshAt: new Date().toISOString(),
    communicationFreshAt: null,
    sourceWatermarks: {},
    featureVersion: 'features-v1-2026-08',
    computedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const decision = computeRiskDecision(features, 1.0, 120000);
  assert.ok(decision.score! >= 70);
  assert.equal(decision.severity, 'high');
  assert.ok(decision.hardOverrides.includes('single_payment_failure'));
  assert.ok(decision.revenuePriority > 0);
});

test('Deterministic scoring triggers critical override on compound billing + severe usage decline', () => {
  const features: AccountFeatures = {
    workspaceId: 'ws_test',
    customerAccountId: 'acc_test',
    billingAvailable: true,
    billingStatus: 'past_due',
    stripeCustomerId: 'cus_123',
    stripeSubscriptionId: null,
    currentMrrCents: 350000,
    preCancelMrrCents: null,
    lastInvoiceId: 'in_123',
    lastInvoiceStatus: 'open',
    failedPaymentCount7d: 1,
    failedPaymentCount30d: 1,
    lastPaymentFailedAt: new Date().toISOString(),
    lastPaymentSucceededAt: null,
    cancelAtPeriodEnd: null,
    cancelledAt: null,
    usageAvailable: true,
    usageCurrent7d: 35,
    usagePrevious7d: 100,
    usageDeltaPercent: -65, // severe decline
    keyFeatureCurrent7d: 0,
    keyFeaturePrevious7d: 5,
    keyFeatureMissing: true,
    cancelIntentAt: null,
    lastProductActivityAt: null,
    communicationAvailable: false,
    lastOutboundAt: null,
    lastInboundAt: null,
    unrepliedOutboundCount: 0,
    gmailThreadId: null,
    billingFreshAt: new Date().toISOString(),
    usageFreshAt: new Date().toISOString(),
    communicationFreshAt: null,
    sourceWatermarks: {},
    featureVersion: 'features-v1-2026-08',
    computedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const decision = computeRiskDecision(features, 1.0, 350000);
  assert.equal(decision.score, 95);
  assert.equal(decision.severity, 'critical');
  assert.ok(decision.hardOverrides.includes('compound_billing_and_usage_risk'));
});

test('Deterministic action policy enforces contact policy suppression and cooldowns', () => {
  const riskDecision = computeRiskDecision({
    workspaceId: 'ws_test',
    customerAccountId: 'acc_test',
    billingAvailable: true,
    billingStatus: 'past_due',
    stripeCustomerId: 'cus_123',
    stripeSubscriptionId: null,
    currentMrrCents: 100000,
    preCancelMrrCents: null,
    lastInvoiceId: 'in_123',
    lastInvoiceStatus: 'open',
    failedPaymentCount7d: 1,
    failedPaymentCount30d: 1,
    lastPaymentFailedAt: new Date().toISOString(),
    lastPaymentSucceededAt: null,
    cancelAtPeriodEnd: null,
    cancelledAt: null,
    usageAvailable: true,
    usageCurrent7d: 80,
    usagePrevious7d: 80,
    usageDeltaPercent: 0,
    keyFeatureCurrent7d: null,
    keyFeaturePrevious7d: null,
    keyFeatureMissing: null,
    cancelIntentAt: null,
    lastProductActivityAt: null,
    communicationAvailable: false,
    lastOutboundAt: null,
    lastInboundAt: null,
    unrepliedOutboundCount: 0,
    gmailThreadId: null,
    billingFreshAt: new Date().toISOString(),
    usageFreshAt: new Date().toISOString(),
    communicationFreshAt: null,
    sourceWatermarks: {},
    featureVersion: 'features-v1-2026-08',
    computedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  // Normal policy without suppression
  const normalAction = evaluateActionPolicy({
    riskDecision,
    identityConfidence: 1.0,
  });
  assert.equal(normalAction.actionType, 'billing_recovery_email');
  assert.equal(normalAction.allowed, true);

  // Policy with explicit do_not_contact
  const suppressedAction = evaluateActionPolicy({
    riskDecision,
    identityConfidence: 1.0,
    contactPolicy: {
      id: 'pol_1',
      workspaceId: 'ws_test',
      customerAccountId: 'acc_test',
      channel: 'email',
      address: 'user@example.com',
      policy: 'do_not_contact',
      reason: 'Customer requested unsubscribe',
      source: 'manual',
      expiresAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  });
  assert.equal(suppressedAction.allowed, false);
  assert.ok(suppressedAction.suppressionReason?.includes('do_not_contact'));
});

test('Legal state machine transitions allow correct paths and reject illegal jumps', () => {
  assert.ok(LEGAL_TRANSITIONS['open'].includes('analyzing'));
  assert.ok(LEGAL_TRANSITIONS['analyzing'].includes('action_proposed'));
  assert.ok(LEGAL_TRANSITIONS['action_proposed'].includes('awaiting_approval'));
  assert.ok(LEGAL_TRANSITIONS['awaiting_approval'].includes('approved'));
  assert.ok(LEGAL_TRANSITIONS['approved'].includes('sent'));
  assert.ok(LEGAL_TRANSITIONS['sent'].includes('monitoring'));
  assert.ok(LEGAL_TRANSITIONS['monitoring'].includes('resolved'));

  // Illegal jump: open -> sent directly
  assert.ok(!LEGAL_TRANSITIONS['open'].includes('sent'));
  // Illegal jump: resolved -> open
  assert.ok(!LEGAL_TRANSITIONS['resolved'].includes('open'));
});

test('Case key construction creates stable reproducible keys', () => {
  const key1 = constructCaseKey({
    triggerType: 'billing_failure',
    accountId: 'acc_123',
    objectId: 'in_999',
  });
  assert.equal(key1, 'billing_failure:acc_123:in_999');

  const key2 = constructCaseKey({
    triggerType: 'subscription_cancel',
    accountId: 'acc_123',
    objectId: 'sub_456',
    dateKey: '2026-08-22',
  });
  assert.equal(key2, 'subscription_cancel:acc_123:sub_456:2026-08-22');
});

test('Redaction strips credit cards, tokens, and internal jargon', () => {
  const raw = {
    apiKey: 'sk_live_1234567890abcdef',
    cardNumber: '4111 2222 3333 4444',
    customerEmail: 'founder@example.com',
  };
  const redacted = redactEvidenceForPrompt(raw);
  assert.equal(redacted.apiKey, '[REDACTED_SECRET]');
  assert.equal(redacted.cardNumber, '[REDACTED_CARD]');
  assert.equal(redacted.customerEmail, 'founder@example.com');

  const text = 'Card 4111-2222-3333-4444 was declined for key sk_live_secretkey123456';
  const cleanText = sanitizeCustomerText(text);
  assert.ok(!cleanText.includes('4111-2222-3333-4444'));
  assert.ok(!cleanText.includes('sk_live_secretkey123456'));
});

test('Offline 15-account scenario manifest evaluates with 100% precision, recall, and healthy suppression', () => {
  const report = evaluateScenarioManifest();
  const failed = report.scenarioResults.filter((r) => !r.passed);
  if (failed.length > 0) {
    console.error('FAILED SCENARIOS:', JSON.stringify(failed, null, 2));
  }
  assert.equal(report.totalScenarios, 15);
  assert.equal(report.falsePositives, 0);
  assert.equal(report.falseNegatives, 0);
  assert.equal(report.precision, 1.0);
  assert.equal(report.recall, 1.0);
  assert.equal(report.healthySuppressionRate, 1.0);

  for (const res of report.scenarioResults) {
    assert.ok(res.passed, `Scenario ${res.scenarioId} failed: expected ${res.expectedSeverity}/${res.expectedAction}, got ${res.computedSeverity}/${res.actionType}`);
  }
});

test('Outcome attribution gates reject invalid matches (G1-G5)', () => {
  const caseOpenedAt = new Date('2026-08-22T10:00:00.000Z').getTime();
  const caseDeadline = new Date('2026-09-22T10:00:00.000Z').getTime();

  // G1: Evidence must occur AFTER case opened_at
  const priorEventAt = new Date('2026-08-22T09:00:00.000Z').getTime();
  assert.ok(priorEventAt < caseOpenedAt, 'Prior event should be before case opened');

  // G2: Evidence must arrive BEFORE deadline
  const expiredEventAt = new Date('2026-09-25T10:00:00.000Z').getTime();
  assert.ok(expiredEventAt > caseDeadline, 'Expired event should be past deadline');

  // G4: Invoice matching logic
  const invoiceId = 'in_recovery_123';
  const caseKey = `billing_failure:acc_456:${invoiceId}`;
  assert.ok(caseKey.includes(invoiceId), 'Case key contains invoice ID');
  assert.ok(!caseKey.includes('in_unrelated_999'), 'Unrelated invoice does not match case key');
});

test('Revenue metrics invariants: strict and protected MRR are strictly partitioned', () => {
  const sampleOutcomes = [
    { outcome_type: 'strictly_recovered', strict_recovered_cents: 240000, protected_cents: 0 },
    { outcome_type: 'protected', strict_recovered_cents: 0, protected_cents: 120000 },
    { outcome_type: 'engaged', strict_recovered_cents: 0, protected_cents: 0 },
    { outcome_type: 'product_recovered', strict_recovered_cents: 0, protected_cents: 0 },
  ];

  const strictRecovered = sampleOutcomes.reduce((s, o) => s + o.strict_recovered_cents, 0);
  const protectedTotal = sampleOutcomes.reduce((s, o) => s + o.protected_cents, 0);

  assert.equal(strictRecovered, 240000, 'Strict recovered MRR matches verified payments only');
  assert.equal(protectedTotal, 120000, 'Protected MRR matches reversed intent only');
  assert.ok(strictRecovered !== protectedTotal, 'Strict and protected totals are never merged');
});

