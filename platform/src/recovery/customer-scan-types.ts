import { z } from 'zod';

// ─── 1. Operational Classifications ──────────────────────────────────
export const OperationalClassificationSchema = z.enum([
  'confirmed_churn',
  'imminent_churn',
  'high_risk',
  'needs_intervention',
  'healthy',
  'insufficient_data',
]);

export type OperationalClassification = z.infer<typeof OperationalClassificationSchema>;

// ─── 2. Severity ─────────────────────────────────────────────────────
export const RiskSeveritySchema = z.enum(['critical', 'high', 'medium', 'low']);

export type RiskSeverity = z.infer<typeof RiskSeveritySchema>;

// ─── 3. Likely Root Cause Category ───────────────────────────────────
export const RootCauseCategorySchema = z.enum([
  'payment_failure',
  'onboarding_failure',
  'product_disengagement',
  'product_or_support_blocker',
  'explicit_cancellation',
  'unknown',
]);

export type RootCauseCategory = z.infer<typeof RootCauseCategorySchema>;

// ─── 4. Evidence Item ────────────────────────────────────────────────
export const EvidenceProviderSchema = z.enum(['stripe', 'posthog', 'intercom', 'gmail']);

export type EvidenceProvider = z.infer<typeof EvidenceProviderSchema>;

export const EvidenceItemSchema = z.object({
  provider: EvidenceProviderSchema,
  code: z.string().min(1, 'Evidence code is required'),
  statement: z.string().min(1, 'Evidence statement is required'),
  observedAt: z.string().datetime({ offset: true, message: 'observedAt must be ISO-8601' }),
});

export type EvidenceItem = z.infer<typeof EvidenceItemSchema>;

// ─── 5. Recommended Action ───────────────────────────────────────────
export const ActionUrgencySchema = z.enum(['now', 'today', 'this_week', 'monitor']);

export type ActionUrgency = z.infer<typeof ActionUrgencySchema>;

export const RecommendedActionSchema = z.object({
  type: z.string().min(1, 'Action type is required'),
  urgency: ActionUrgencySchema,
  reason: z.string().min(1, 'Action reason is required'),
  discountEligible: z.boolean(),
  suggestedDiscountPercent: z.number().int().min(1).max(100).optional(),
  suggestedDiscountDurationMonths: z.number().int().min(1).max(24).optional(),
});

export type RecommendedAction = z.infer<typeof RecommendedActionSchema>;

// ─── 6. Identity Summary ─────────────────────────────────────────────
export const IdentityStatusSchema = z.enum(['verified', 'provisional', 'conflict']);

export type IdentityStatus = z.infer<typeof IdentityStatusSchema>;

export const IdentitySummarySchema = z.object({
  status: IdentityStatusSchema,
  confidence: z.number().min(0).max(1),
});

export type IdentitySummary = z.infer<typeof IdentitySummarySchema>;

// ─── 7. Source Freshness ─────────────────────────────────────────────
export const SourceFreshnessSchema = z.object({
  stripe: z.string().datetime({ offset: true }).nullable(),
  posthog: z.string().datetime({ offset: true }).nullable(),
  intercom: z.string().datetime({ offset: true }).nullable(),
  gmail: z.string().datetime({ offset: true }).nullable(),
});

export type SourceFreshness = z.infer<typeof SourceFreshnessSchema>;

// ─── 8. Unified Account Features (Normalized Backend Representation) ──
export const UnifiedAccountFeaturesSchema = z.object({
  customerAccountId: z.string().uuid({ message: 'customerAccountId must be a valid UUID' }),
  workspaceId: z.string().min(1, 'workspaceId is required'),

  // Identity
  identityStatus: IdentityStatusSchema,
  identityConfidence: z.number().min(0).max(1),

  // Revenue & Billing (Stripe)
  billingAvailable: z.boolean(),
  billingStatus: z.enum(['active', 'past_due', 'unpaid', 'canceled', 'trialing']).nullable(),
  currentMrrCents: z.number().int().nonnegative(),
  preCancelMrrCents: z.number().int().nonnegative().nullable(),
  renewalAt: z.string().datetime({ offset: true }).nullable(),
  cancelAtPeriodEnd: z.boolean(),
  cancelledAt: z.string().datetime({ offset: true }).nullable(),
  failedPaymentCount7d: z.number().int().nonnegative(),
  failedPaymentCount30d: z.number().int().nonnegative(),

  // Product Behavior (PostHog)
  usageAvailable: z.boolean(),
  lastProductActivityAt: z.string().datetime({ offset: true }).nullable(),
  usageCurrent7d: z.number().int().nonnegative(),
  usagePrevious7d: z.number().int().nonnegative(),
  usageDeltaPercent: z.number(), // e.g. -75.5 or +20.0
  keyFeatureMissing: z.boolean(),
  cancelIntentAt: z.string().datetime({ offset: true }).nullable(),

  // Lifecycle & Activation
  signupAt: z.string().datetime({ offset: true }).nullable(),
  onboardingCompletedAt: z.string().datetime({ offset: true }).nullable(),
  activationCompletedAt: z.string().datetime({ offset: true }).nullable(),
  planSelectedAt: z.string().datetime({ offset: true }).nullable(),

  // Support & Sentiment (Intercom)
  supportAvailable: z.boolean(),
  openSupportConversationCount: z.number().int().nonnegative(),
  oldestOpenSupportConversationAt: z.string().datetime({ offset: true }).nullable(),
  supportCancelThreat: z.boolean(),
  supportBlockerCategory: z.enum([
    'onboarding',
    'billing',
    'product_bug',
    'missing_feature',
    'performance',
    'cancellation',
    'unknown',
  ]).nullable(),

  // Communication & History (Gmail)
  communicationAvailable: z.boolean(),
  lastOutboundAt: z.string().datetime({ offset: true }).nullable(),
  lastInboundAt: z.string().datetime({ offset: true }).nullable(),

  // Source Freshness
  billingFreshAt: z.string().datetime({ offset: true }).nullable(),
  usageFreshAt: z.string().datetime({ offset: true }).nullable(),
  supportFreshAt: z.string().datetime({ offset: true }).nullable(),
  communicationFreshAt: z.string().datetime({ offset: true }).nullable(),
});

export type UnifiedAccountFeatures = z.infer<typeof UnifiedAccountFeaturesSchema>;

// ─── 8.5 Provider Result Schemas (Unified Nested Timeline Contract) ───
export const CustomerProviderStatusSchema = z.enum([
  'found',
  'not_found',
  'unavailable',
  'conflict',
  'stale',
]);
export type CustomerProviderStatus = z.infer<typeof CustomerProviderStatusSchema>;

export const CustomerProviderIdentitySchema = z.object({
  matched: z.boolean(),
  matchedBy: z.enum(['provider_id', 'email', 'provisional', 'none']),
  externalId: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
});
export type CustomerProviderIdentity = z.infer<typeof CustomerProviderIdentitySchema>;

export const CustomerProviderRecordSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  title: z.string().min(1),
  detail: z.string().nullable().optional(),
  occurredAt: z.string().nullable().optional(),
});
export type CustomerProviderRecord = z.infer<typeof CustomerProviderRecordSchema>;

export const CustomerProviderResultSchema = z.object({
  provider: z.enum(['stripe', 'posthog', 'intercom']),
  status: CustomerProviderStatusSchema,
  title: z.string().min(1),
  summary: z.string(),
  identity: CustomerProviderIdentitySchema,
  records: z.array(CustomerProviderRecordSchema),
  observedAt: z.string().nullable().optional(),
  error: z.string().nullable().optional(),
});
export type CustomerProviderResult = z.infer<typeof CustomerProviderResultSchema>;

export const CustomerProviderResultsSchema = z.object({
  stripe: CustomerProviderResultSchema,
  posthog: CustomerProviderResultSchema,
  intercom: CustomerProviderResultSchema,
});
export type CustomerProviderResults = z.infer<typeof CustomerProviderResultsSchema>;

// ─── 9. Customer Risk Scan (Single Customer Verdict) ──────────────────
export const CustomerRiskScanSchema = z.object({
  accountId: z.string().uuid({ message: 'accountId must be a valid UUID' }),
  accountName: z.string().min(1, 'accountName is required'),
  primaryEmail: z.string().email().nullable(),

  classification: OperationalClassificationSchema,
  severity: RiskSeveritySchema,
  mrrAtRiskCents: z.number().int().nonnegative({ message: 'MRR must be non-negative integer cents' }),
  daysUntilRenewal: z.number().int().nullable(),
  daysSinceLastActivity: z.number().int().nonnegative().nullable(),

  likelyRootCause: RootCauseCategorySchema,
  evidence: z.array(EvidenceItemSchema),
  recommendedAction: RecommendedActionSchema,

  identity: IdentitySummarySchema,
  freshness: SourceFreshnessSchema,
  missingData: z.array(z.string()),
  providerResults: CustomerProviderResultsSchema.optional(),
});

export type CustomerRiskScan = z.infer<typeof CustomerRiskScanSchema>;

// ─── 10. Fleet Risk Scan (Workspace-wide Fleet Overview) ──────────────
export const FleetRiskScanSchema = z.object({
  workspaceId: z.string().min(1, 'workspaceId is required'),
  scannedAt: z.string().datetime({ offset: true, message: 'scannedAt must be ISO-8601' }),
  totalAccountsScanned: z.number().int().nonnegative(),
  actionableAccountsCount: z.number().int().nonnegative(),
  totalMrrProtectedCents: z.number().int().nonnegative(),
  totalMrrAtRiskCents: z.number().int().nonnegative(),
  breakdown: z.object({
    confirmedChurn: z.number().int().nonnegative(),
    imminentChurn: z.number().int().nonnegative(),
    highRisk: z.number().int().nonnegative(),
    needsIntervention: z.number().int().nonnegative(),
    healthy: z.number().int().nonnegative(),
    insufficientData: z.number().int().nonnegative(),
  }),
  topAtRiskAccounts: z.array(CustomerRiskScanSchema).max(20, 'Fleet scan is bounded to top 20 accounts'),
});

export type FleetRiskScan = z.infer<typeof FleetRiskScanSchema>;

// ─── 11. Helper Predicates & Boundary Guards ──────────────────────────
export function isActionableIdentity(identity: IdentitySummary): boolean {
  return identity.status === 'verified' && identity.confidence >= 0.7;
}

export function validateCustomerRiskScan(data: unknown): CustomerRiskScan {
  return CustomerRiskScanSchema.parse(data);
}

export function validateFleetRiskScan(data: unknown): FleetRiskScan {
  return FleetRiskScanSchema.parse(data);
}
