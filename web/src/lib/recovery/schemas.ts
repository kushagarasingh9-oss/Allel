import { z } from 'zod';

export const ProviderSchema = z.enum(['stripe', 'posthog', 'gmail']);

export const CanonicalProviderEventSchema = z.object({
  eventId: z.string().uuid(),
  workspaceId: z.string().uuid().nullable(),
  provider: ProviderSchema,
  providerEventId: z.string().min(1),
  dedupeKey: z.string().min(1),
  eventType: z.string().min(1),
  occurredAt: z.string().datetime(),
  receivedAt: z.string().datetime(),
  endpointId: z.string().nullable(),
  providerAccountId: z.string().nullable(),
  primaryExternalIdentity: z.string().nullable(),
  secondaryExternalIdentities: z.array(z.string()).default([]),
  scenarioId: z.string().nullable().default(null),
  payloadHash: z.string().min(1),
  payloadVersion: z.number().int().default(1),
  testMode: z.boolean().default(false),
});

export const SeveritySchema = z.enum(['low', 'medium', 'high', 'critical']);

export const CaseAnalysisSchema = z.object({
  caseId: z.string().uuid(),
  primaryCause: z.enum(['billing', 'usage', 'compound', 'cancellation_intent']),
  summary: z.string().min(1),
  customerSafeReason: z.string().min(1),
  evidence: z.array(
    z.object({
      evidenceId: z.string().min(1),
      claim: z.string().min(1),
    })
  ).min(1),
  uncertainty: z.array(z.string()).default([]),
  recommendedTone: z.enum(['helpful', 'concise', 'empathetic', 'urgent']),
  recommendedNextStep: z.string().min(1),
  prohibitedClaims: z.array(z.string()).default([]),
});

export const RecoveryDraftSchema = z.object({
  caseId: z.string().uuid(),
  actionType: z.string().min(1),
  recipientEmail: z.string().email(),
  subject: z.string().min(1).max(120),
  bodyText: z.string().min(10).max(3000),
  evidenceIdsUsed: z.array(z.string()).default([]),
  offerId: z.string().nullable().default(null),
  callToAction: z.string().min(1),
  safetyNotes: z.array(z.string()).default([]),
});

export const DraftVerificationSchema = z.object({
  caseId: z.string().uuid(),
  draftId: z.string().uuid(),
  passed: z.boolean(),
  deterministicChecks: z.array(
    z.object({
      ruleId: z.string(),
      passed: z.boolean(),
      detail: z.string(),
    })
  ),
  critique: z.array(z.string()).default([]),
  contentHash: z.string().min(1),
  verifierVersion: z.string().min(1),
});

export const RecoveryMetricsSchema = z.object({
  testMode: z.boolean(),
  currency: z.string().default('usd'),
  strictRecoveredCents: z.number().int().nonnegative(),
  protectedCents: z.number().int().nonnegative(),
  atRiskCents: z.number().int().nonnegative(),
  engagedCases: z.number().int().nonnegative(),
  productRecoveredCases: z.number().int().nonnegative(),
  churnedCases: z.number().int().nonnegative(),
  pendingCases: z.number().int().nonnegative(),
  unknownCases: z.number().int().nonnegative(),
  observationStart: z.string().datetime(),
  observationEnd: z.string().datetime(),
  policyVersion: z.string(),
});
