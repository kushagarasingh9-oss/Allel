export type Provider = 'stripe' | 'posthog' | 'gmail';

export type CanonicalProviderEvent = {
  eventId: string;
  workspaceId: string | null;
  provider: Provider;
  providerEventId: string;
  dedupeKey: string;
  eventType: string;
  occurredAt: string;
  receivedAt: string;
  endpointId: string | null;
  providerAccountId: string | null;
  primaryExternalIdentity: string | null;
  secondaryExternalIdentities: string[];
  scenarioId: string | null;
  payloadHash: string;
  payloadVersion: number;
  testMode: boolean;
};

export type IdentityType =
  | 'customer_id'
  | 'subscription_id'
  | 'invoice_customer_id'
  | 'distinct_id'
  | 'person_email'
  | 'email_address'
  | 'gmail_thread_id';

export type VerificationStatus = 'verified' | 'inferred' | 'conflict' | 'revoked';

export type ProviderIdentity = {
  id: string;
  workspaceId: string;
  customerAccountId: string;
  provider: Provider;
  identityType: IdentityType;
  externalId: string;
  normalizedExternalId: string;
  isPrimary: boolean;
  verificationStatus: VerificationStatus;
  source: string;
  metadata: Record<string, unknown>;
  firstSeenAt: string;
  lastSeenAt: string;
  createdAt: string;
  updatedAt: string;
};

export type IdentityResolutionResult = {
  status: 'verified' | 'inferred' | 'conflict' | 'unmapped';
  customerAccountId: string | null;
  confidence: number;
  matchType: string;
  matchedIdentity: string | null;
  candidateAccountIds?: string[];
  conflictReason?: string;
};

export type AccountFeatures = {
  workspaceId: string;
  customerAccountId: string;
  billingAvailable: boolean;
  billingStatus: string | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  currentMrrCents: number | null;
  preCancelMrrCents: number | null;
  lastInvoiceId: string | null;
  lastInvoiceStatus: string | null;
  failedPaymentCount7d: number;
  failedPaymentCount30d: number;
  lastPaymentFailedAt: string | null;
  lastPaymentSucceededAt: string | null;
  cancelAtPeriodEnd: boolean | null;
  cancelledAt: string | null;
  usageAvailable: boolean;
  usageCurrent7d: number | null;
  usagePrevious7d: number | null;
  usageDeltaPercent: number | null;
  keyFeatureCurrent7d: number | null;
  keyFeaturePrevious7d: number | null;
  keyFeatureMissing: boolean | null;
  cancelIntentAt: string | null;
  lastProductActivityAt: string | null;
  communicationAvailable: boolean;
  lastOutboundAt: string | null;
  lastInboundAt: string | null;
  unrepliedOutboundCount: number;
  gmailThreadId: string | null;
  billingFreshAt: string | null;
  usageFreshAt: string | null;
  communicationFreshAt: string | null;
  sourceWatermarks: Record<string, string>;
  featureVersion: string;
  computedAt: string;
  updatedAt: string;
};

export type Severity = 'low' | 'medium' | 'high' | 'critical';

export type ComponentResult = {
  value: number;
  available: boolean;
  freshness: number;
  inputFacts: Record<string, unknown>;
  evidenceIds: string[];
  ruleIds: string[];
};

export type RiskDecision = {
  score: number | null;
  confidence: number;
  severity: Severity;
  components: {
    billing: ComponentResult;
    usage: ComponentResult;
    communication: ComponentResult;
  };
  availableDomains: string[];
  missingDomains: string[];
  hardOverrides: string[];
  revenuePriority: number;
  scoreVersion: string;
  evaluatedAt: string;
};

export type ActionType =
  | 'no_action'
  | 'founder_review'
  | 'billing_recovery_email'
  | 'cancellation_rescue_email'
  | 'usage_checkin_email'
  | 'compound_recovery_email'
  | 'monitor_only';

export type ActionUrgency = 'none' | 'this_week' | 'today' | 'immediate';

export type ActionDecision = {
  actionType: ActionType;
  allowed: boolean;
  requiresApproval: boolean;
  urgency: ActionUrgency;
  reasonCode: string;
  actionReason: string;
  suppressionReason: string | null;
  policyVersion: string;
  cooldownUntil: string | null;
};

export type CaseStatus =
  | 'open'
  | 'analyzing'
  | 'action_proposed'
  | 'awaiting_approval'
  | 'approved'
  | 'sent'
  | 'monitoring'
  | 'resolved'
  | 'suppressed'
  | 'failed';

export type CaseResolution =
  | 'strictly_recovered'
  | 'protected'
  | 'product_recovered'
  | 'engaged'
  | 'churned'
  | 'no_action_required'
  | 'suppressed'
  | 'expired_unknown'
  | 'duplicate'
  | 'operator_closed';

export type RecoveryCase = {
  id: string;
  workspaceId: string;
  customerAccountId: string;
  caseKey: string;
  triggerProvider: string;
  triggerEventType: string;
  triggerEventId: string | null;
  scenarioId: string | null;
  status: CaseStatus;
  resolution: CaseResolution | null;
  severity: Severity;
  riskScore: number;
  scoreConfidence: number;
  revenuePriority: number;
  mrrBaselineCents: number;
  currency: string;
  scoreVersion: string;
  policyVersion: string;
  featureVersion: string;
  actionType: ActionType;
  actionReason: string;
  suppressionReason: string | null;
  rootCauseSummary: string | null;
  evidenceSnapshot: Array<{ id: string; domain: string; claim: string; timestamp: string }>;
  openedAt: string;
  lastSignalAt: string;
  awaitingApprovalAt: string | null;
  approvedAt: string | null;
  sentAt: string | null;
  monitoringStartedAt: string | null;
  resolvedAt: string | null;
  outcomeDeadlineAt: string | null;
  failedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ActorType = 'system' | 'provider' | 'agent' | 'founder' | 'worker';

export type RecoveryCaseEvent = {
  id: string;
  workspaceId: string;
  recoveryCaseId: string;
  eventType: string;
  fromStatus: CaseStatus | null;
  toStatus: CaseStatus | null;
  actorType: ActorType;
  actorId: string | null;
  sourceProvider: string | null;
  sourceEventId: string | null;
  workflowJobId: string | null;
  agentRunId: string | null;
  detail: Record<string, unknown>;
  createdAt: string;
};

export type CaseAnalysis = {
  caseId: string;
  primaryCause: 'billing' | 'usage' | 'compound' | 'cancellation_intent';
  summary: string;
  customerSafeReason: string;
  evidence: Array<{
    evidenceId: string;
    claim: string;
  }>;
  uncertainty: string[];
  recommendedTone: 'helpful' | 'concise' | 'empathetic' | 'urgent';
  recommendedNextStep: string;
  prohibitedClaims: string[];
};

export type RecoveryDraft = {
  caseId: string;
  actionType: string;
  recipientEmail: string;
  subject: string;
  bodyText: string;
  evidenceIdsUsed: string[];
  offerId: string | null;
  callToAction: string;
  safetyNotes: string[];
};

export type DraftVerification = {
  caseId: string;
  draftId: string;
  passed: boolean;
  deterministicChecks: Array<{
    ruleId: string;
    passed: boolean;
    detail: string;
  }>;
  critique: string[];
  contentHash: string;
  verifierVersion: string;
};

export type ContactPolicyType = 'allow' | 'do_not_contact' | 'transactional_only' | 'manual_review_only';

export type ContactPolicy = {
  id: string;
  workspaceId: string;
  customerAccountId: string | null;
  channel: string;
  address: string | null;
  policy: ContactPolicyType;
  reason: string;
  source: string;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type RecoveryMetrics = {
  testMode: boolean;
  currency: string;
  strictRecoveredCents: number;
  protectedCents: number;
  atRiskCents: number;
  engagedCases: number;
  productRecoveredCases: number;
  churnedCases: number;
  pendingCases: number;
  unknownCases: number;
  observationStart: string;
  observationEnd: string;
  policyVersion: string;
};
