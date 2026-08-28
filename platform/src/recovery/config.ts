import { z } from 'zod';

export const RecoveryConfigSchema = z.object({
  // Ingress
  WEBHOOK_MAX_BODY_BYTES: z.number().int().positive().default(1_048_576), // 1MB
  WEBHOOK_ACK_TARGET_MS: z.number().int().positive().default(500),
  WEBHOOK_ACK_HARD_MS: z.number().int().positive().default(2000),
  STRIPE_SIGNATURE_TOLERANCE_SECONDS: z.number().int().positive().default(300),
  EVENT_FUTURE_SKEW_SECONDS: z.number().int().positive().default(300),
  RAW_EVENT_RETENTION_DAYS: z.number().int().positive().default(30),
  REDACTED_EVENT_RETENTION_DAYS: z.number().int().positive().default(180),

  // Queue & Worker
  WORKER_BATCH_SIZE: z.number().int().positive().default(10),
  WORKER_CONCURRENCY: z.number().int().positive().default(3),
  JOB_LEASE_SECONDS: z.number().int().positive().default(60),
  MODEL_JOB_LEASE_SECONDS: z.number().int().positive().default(120),
  JOB_MAX_ATTEMPTS: z.number().int().positive().default(8),
  JOB_BACKOFF_BASE_MS: z.number().int().positive().default(2000),
  JOB_BACKOFF_MULTIPLIER: z.number().positive().default(2),
  JOB_BACKOFF_MAX_MS: z.number().int().positive().default(900_000), // 15 mins
  JOB_HEARTBEAT_FRACTION: z.number().positive().default(0.33),
  WORKER_ROUTE_TIMEOUT_MS: z.number().int().positive().default(50_000),

  // Identity
  AUTOMATIC_IDENTITY_CONFIDENCE_MIN: z.number().min(0).max(1).default(0.90),
  INFERRED_EMAIL_CONFIDENCE: z.number().min(0).max(1).default(0.75),
  VERIFIED_EMAIL_CONFIDENCE: z.number().min(0).max(1).default(0.90),
  PROVIDER_ID_CONFIDENCE: z.number().min(0).max(1).default(1.00),
  MAX_EXTERNAL_ID_LENGTH: z.number().int().positive().default(512),
  UNMAPPED_RETRY_HOURS: z.number().int().positive().default(6),

  // Freshness
  BILLING_FRESH_HOURS: z.number().int().positive().default(24),
  USAGE_FRESH_HOURS: z.number().int().positive().default(24),
  COMMUNICATION_FRESH_HOURS: z.number().int().positive().default(24),
  SOURCE_STALE_ZERO_HOURS: z.number().int().positive().default(72),
  RECONCILIATION_INTERVAL_HOURS: z.number().int().positive().default(24),
  GMAIL_POLL_SECONDS: z.number().int().positive().default(60),

  // Usage
  USAGE_CURRENT_WINDOW_DAYS: z.number().int().positive().default(7),
  USAGE_PREVIOUS_WINDOW_DAYS: z.number().int().positive().default(7),
  USAGE_MIN_BASELINE_EVENTS: z.number().int().positive().default(10),
  USAGE_MODERATE_DECLINE_PERCENT: z.number().default(-20),
  USAGE_HIGH_DECLINE_PERCENT: z.number().default(-40),
  USAGE_SEVERE_DECLINE_PERCENT: z.number().default(-60),
  KEY_FEATURE_MIN_BASELINE_EVENTS: z.number().int().positive().default(3),
  USAGE_RECOVERY_BASELINE_RATIO: z.number().min(0).max(1).default(0.80),
  POSTHOG_LATE_EVENT_OVERLAP_HOURS: z.number().int().positive().default(24),

  // Scoring
  BILLING_WEIGHT: z.number().min(0).max(1).default(0.50),
  USAGE_WEIGHT: z.number().min(0).max(1).default(0.35),
  COMMUNICATION_WEIGHT: z.number().min(0).max(1).default(0.15),
  RISK_MEDIUM_MIN: z.number().int().min(0).max(100).default(45),
  RISK_HIGH_MIN: z.number().int().min(0).max(100).default(70),
  RISK_CRITICAL_MIN: z.number().int().min(0).max(100).default(85),
  COMPOUND_WINDOW_HOURS: z.number().int().positive().default(72),
  COMPOUND_SCORE_FLOOR: z.number().int().min(0).max(100).default(95),
  ACTION_CONFIDENCE_MIN: z.number().min(0).max(1).default(0.75),

  // Communication & Drafts
  UNREPLIED_LOW_DAYS: z.number().int().positive().default(3),
  UNREPLIED_MEDIUM_DAYS: z.number().int().positive().default(7),
  UNREPLIED_HIGH_DAYS: z.number().int().positive().default(14),
  AUTO_REPLY_HEADER_CHECK: z.boolean().default(true),
  MAX_DRAFT_BODY_WORDS: z.number().int().positive().default(180),
  MAX_DRAFT_SUBJECT_CHARS: z.number().int().positive().default(78),

  // Action & Safety
  APPROVAL_TTL_HOURS: z.number().int().positive().default(24),
  CRITICAL_APPROVAL_TTL_HOURS: z.number().int().positive().default(2),
  BILLING_EMAIL_COOLDOWN_HOURS: z.number().int().positive().default(72),
  CANCELLATION_EMAIL_COOLDOWN_DAYS: z.number().int().positive().default(7),
  USAGE_EMAIL_COOLDOWN_DAYS: z.number().int().positive().default(7),
  FOUNDER_ALERT_DEDUPE_MINUTES: z.number().int().positive().default(60),
  INTEGRATION_ALERT_DEDUPE_HOURS: z.number().int().positive().default(6),
  MAX_ACTIVE_DRAFTS_PER_CASE: z.number().int().positive().default(1),

  // Outcomes & Windows
  INVOICE_RECOVERY_WINDOW_DAYS: z.number().int().positive().default(30),
  CANCELLATION_RECOVERY_WINDOW_DAYS: z.number().int().positive().default(45),
  CANCEL_INTENT_PROTECTION_WINDOW_DAYS: z.number().int().positive().default(30),
  USAGE_RECOVERY_WINDOW_DAYS: z.number().int().positive().default(21),
  GMAIL_ENGAGEMENT_WINDOW_DAYS: z.number().int().positive().default(14),
  TERMINAL_UNPAID_DAYS: z.number().int().positive().default(30),

  // Model parameters
  ANALYZE_MAX_OUTPUT_TOKENS: z.number().int().positive().default(900),
  DRAFT_MAX_OUTPUT_TOKENS: z.number().int().positive().default(700),
  CRITIQUE_MAX_OUTPUT_TOKENS: z.number().int().positive().default(500),
  MODEL_TIMEOUT_MS: z.number().int().positive().default(30_000),
  MODEL_REPAIR_ATTEMPTS: z.number().int().min(0).default(1),
  MAX_MODEL_CALLS_PER_ACTION_VERSION: z.number().int().positive().default(4),

  // Versions
  FEATURE_VERSION: z.string().default('features-v1-2026-08'),
  SCORE_VERSION: z.string().default('risk-v2-three-source-2026-08'),
  POLICY_VERSION: z.string().default('action-policy-v2-founder-approved'),
  ATTRIBUTION_VERSION: z.string().default('attribution-v1-2026-08'),
  VERIFIER_VERSION: z.string().default('verifier-v1-2026-08'),

  // Environment & Execution
  TEST_MODE: z.boolean().default(process.env.RECOVERY_TEST_MODE === 'true' || process.env.NODE_ENV !== 'production'),
  SCENARIO_PREFIX: z.string().default('allel-2026'),
}).refine(
  (c) => Math.abs((c.BILLING_WEIGHT + c.USAGE_WEIGHT + c.COMMUNICATION_WEIGHT) - 1.0) < 0.001,
  { message: 'Domain weights (Billing + Usage + Communication) must sum to 1.00' }
).refine(
  (c) => c.RISK_MEDIUM_MIN < c.RISK_HIGH_MIN && c.RISK_HIGH_MIN < c.RISK_CRITICAL_MIN,
  { message: 'Risk thresholds must be strictly ordered: RISK_MEDIUM_MIN < RISK_HIGH_MIN < RISK_CRITICAL_MIN' }
);

export type RecoveryConfig = z.infer<typeof RecoveryConfigSchema>;

export const RECOVERY_CONFIG: RecoveryConfig = RecoveryConfigSchema.parse({});
