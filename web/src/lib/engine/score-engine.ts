/**
 * Cofounder Churn Scoring Engine
 *
 * 6-factor weighted deterministic scoring.
 * Runs daily for every customer account in a workspace.
 *
 * Score = Σ (factor_weight × normalized_signal)
 * Range: 0–100 (higher = more at risk)
 */

export type RiskLevel = 'high' | 'medium' | 'low'

export type ChurnFactor = {
  name: string
  weight: number
  rawValue: number
  weightedValue: number
  evidence: string
}

export type ChurnScoreResult = {
  score: number
  riskLevel: RiskLevel
  factors: ChurnFactor[]
  summary: string
}

export type AccountSignals = {
  // Billing
  paymentStatus: 'current' | 'past_due' | 'failed' | 'cancelled'
  failedPaymentCount: number
  daysSinceLastPayment: number
  planChangeDirection: 'upgrade' | 'downgrade' | 'none'
  mrrCents: number

  // Usage
  usageDelta7d: number   // percentage change over 7 days
  usageDelta30d: number  // percentage change over 30 days
  activeSeats: number
  totalSeats: number
  keyFeatureUsageDropped: boolean

  // Engagement
  daysInactive: number
  featureBreadth: number  // 0–1, how many features they use
  teamAdoptionRate: number // 0–1, active/total seats

  // Support
  openTicketCount: number
  repeatedComplaints: boolean
  csatScore: number | null // 1–5 scale, null if no data

  // Communication
  daysSinceLastFounderTouch: number
  hasUnrepliedThread: boolean

  // Renewal
  daysUntilRenewal: number | null // null if no renewal date
}

const RISK_THRESHOLD_HIGH = 70
const RISK_THRESHOLD_MEDIUM = 40

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function scoreBillingHealth(signals: AccountSignals): ChurnFactor {
  const weight = 30
  let raw = 0
  const evidenceParts: string[] = []

  if (signals.paymentStatus === 'failed') {
    raw += 0.9
    evidenceParts.push('Payment failed')
  } else if (signals.paymentStatus === 'past_due') {
    raw += 0.6
    evidenceParts.push('Payment past due')
  } else if (signals.paymentStatus === 'cancelled') {
    raw += 1.0
    evidenceParts.push('Subscription cancelled')
  }

  if (signals.failedPaymentCount > 0) {
    raw += Math.min(signals.failedPaymentCount * 0.15, 0.3)
    evidenceParts.push(`${signals.failedPaymentCount} failed retry${signals.failedPaymentCount > 1 ? 's' : ''}`)
  }

  if (signals.planChangeDirection === 'downgrade') {
    raw += 0.3
    evidenceParts.push('Downgraded plan')
  }

  raw = clamp(raw, 0, 1)
  const weighted = Math.round(raw * weight)

  return {
    name: 'billing_health',
    weight,
    rawValue: Math.round(raw * 100),
    weightedValue: weighted,
    evidence: evidenceParts.length > 0 ? evidenceParts.join('; ') : 'Billing healthy',
  }
}

function scoreUsageTrajectory(signals: AccountSignals): ChurnFactor {
  const weight = 25
  let raw = 0
  const evidenceParts: string[] = []

  // 7-day usage drop
  if (signals.usageDelta7d < -30) {
    raw += 0.7
    evidenceParts.push(`Usage down ${Math.abs(signals.usageDelta7d)}% this week`)
  } else if (signals.usageDelta7d < -15) {
    raw += 0.4
    evidenceParts.push(`Usage declined ${Math.abs(signals.usageDelta7d)}% this week`)
  } else if (signals.usageDelta7d < -5) {
    raw += 0.15
    evidenceParts.push(`Slight usage dip ${Math.abs(signals.usageDelta7d)}%`)
  }

  // 30-day trend
  if (signals.usageDelta30d < -25) {
    raw += 0.3
    evidenceParts.push(`30-day usage trend down ${Math.abs(signals.usageDelta30d)}%`)
  }

  // Key feature dropped
  if (signals.keyFeatureUsageDropped) {
    raw += 0.4
    evidenceParts.push('Key feature usage vanished')
  }

  raw = clamp(raw, 0, 1)
  const weighted = Math.round(raw * weight)

  return {
    name: 'usage_trajectory',
    weight,
    rawValue: Math.round(raw * 100),
    weightedValue: weighted,
    evidence: evidenceParts.length > 0 ? evidenceParts.join('; ') : 'Usage stable',
  }
}

function scoreEngagementDepth(signals: AccountSignals): ChurnFactor {
  const weight = 15
  let raw = 0
  const evidenceParts: string[] = []

  // Team adoption
  if (signals.teamAdoptionRate < 0.3) {
    raw += 0.5
    evidenceParts.push(`Only ${Math.round(signals.teamAdoptionRate * 100)}% of seats active`)
  } else if (signals.teamAdoptionRate < 0.5) {
    raw += 0.25
    evidenceParts.push(`${Math.round(signals.teamAdoptionRate * 100)}% seat adoption`)
  }

  // Feature breadth
  if (signals.featureBreadth < 0.2) {
    raw += 0.4
    evidenceParts.push('Using very few features')
  } else if (signals.featureBreadth < 0.4) {
    raw += 0.2
    evidenceParts.push('Narrow feature usage')
  }

  // Inactivity
  if (signals.daysInactive > 7) {
    raw += 0.5
    evidenceParts.push(`${signals.daysInactive} days inactive`)
  } else if (signals.daysInactive > 3) {
    raw += 0.2
    evidenceParts.push(`${signals.daysInactive} days since last activity`)
  }

  raw = clamp(raw, 0, 1)
  const weighted = Math.round(raw * weight)

  return {
    name: 'engagement_depth',
    weight,
    rawValue: Math.round(raw * 100),
    weightedValue: weighted,
    evidence: evidenceParts.length > 0 ? evidenceParts.join('; ') : 'Engagement healthy',
  }
}

function scoreSupportFriction(signals: AccountSignals): ChurnFactor {
  const weight = 15
  let raw = 0
  const evidenceParts: string[] = []

  if (signals.openTicketCount > 2) {
    raw += 0.5
    evidenceParts.push(`${signals.openTicketCount} open tickets`)
  } else if (signals.openTicketCount > 0) {
    raw += 0.2
    evidenceParts.push(`${signals.openTicketCount} open ticket${signals.openTicketCount > 1 ? 's' : ''}`)
  }

  if (signals.repeatedComplaints) {
    raw += 0.4
    evidenceParts.push('Repeated complaints detected')
  }

  if (signals.csatScore !== null && signals.csatScore < 3) {
    raw += 0.5
    evidenceParts.push(`CSAT dropped to ${signals.csatScore}`)
  } else if (signals.csatScore !== null && signals.csatScore < 4) {
    raw += 0.2
    evidenceParts.push(`CSAT at ${signals.csatScore}`)
  }

  raw = clamp(raw, 0, 1)
  const weighted = Math.round(raw * weight)

  return {
    name: 'support_friction',
    weight,
    rawValue: Math.round(raw * 100),
    weightedValue: weighted,
    evidence: evidenceParts.length > 0 ? evidenceParts.join('; ') : 'No support friction',
  }
}

function scoreCommunicationGap(signals: AccountSignals): ChurnFactor {
  const weight = 10
  let raw = 0
  const evidenceParts: string[] = []

  if (signals.daysSinceLastFounderTouch > 14) {
    raw += 0.7
    evidenceParts.push(`No founder touch for ${signals.daysSinceLastFounderTouch} days`)
  } else if (signals.daysSinceLastFounderTouch > 7) {
    raw += 0.4
    evidenceParts.push(`Last founder touch ${signals.daysSinceLastFounderTouch} days ago`)
  } else if (signals.daysSinceLastFounderTouch > 3) {
    raw += 0.15
    evidenceParts.push(`${signals.daysSinceLastFounderTouch} days since last touch`)
  }

  if (signals.hasUnrepliedThread) {
    raw += 0.3
    evidenceParts.push('Unreplied email thread')
  }

  raw = clamp(raw, 0, 1)
  const weighted = Math.round(raw * weight)

  return {
    name: 'communication_gap',
    weight,
    rawValue: Math.round(raw * 100),
    weightedValue: weighted,
    evidence: evidenceParts.length > 0 ? evidenceParts.join('; ') : 'Communication current',
  }
}

function scoreRenewalProximity(signals: AccountSignals): ChurnFactor {
  const weight = 5
  let raw = 0
  const evidenceParts: string[] = []

  if (signals.daysUntilRenewal === null) {
    return {
      name: 'renewal_proximity',
      weight,
      rawValue: 0,
      weightedValue: 0,
      evidence: 'No renewal date set',
    }
  }

  if (signals.daysUntilRenewal <= 7) {
    raw += 0.9
    evidenceParts.push(`Renewal in ${signals.daysUntilRenewal} day${signals.daysUntilRenewal !== 1 ? 's' : ''}`)
  } else if (signals.daysUntilRenewal <= 14) {
    raw += 0.5
    evidenceParts.push(`Renewal in ${signals.daysUntilRenewal} days`)
  } else if (signals.daysUntilRenewal <= 30) {
    raw += 0.2
    evidenceParts.push(`Renewal in ${signals.daysUntilRenewal} days`)
  }

  raw = clamp(raw, 0, 1)
  const weighted = Math.round(raw * weight)

  return {
    name: 'renewal_proximity',
    weight,
    rawValue: Math.round(raw * 100),
    weightedValue: weighted,
    evidence: evidenceParts.length > 0 ? evidenceParts.join('; ') : 'Renewal not imminent',
  }
}

function determineRiskLevel(score: number): RiskLevel {
  if (score >= RISK_THRESHOLD_HIGH) return 'high'
  if (score >= RISK_THRESHOLD_MEDIUM) return 'medium'
  return 'low'
}

function buildSummary(factors: ChurnFactor[], riskLevel: RiskLevel): string {
  const topFactors = factors
    .filter((f) => f.weightedValue > 0)
    .sort((a, b) => b.weightedValue - a.weightedValue)
    .slice(0, 3)

  if (topFactors.length === 0) {
    return 'Account is healthy with no significant risk signals.'
  }

  const riskLabel = riskLevel === 'high' ? 'High risk' : riskLevel === 'medium' ? 'Medium risk' : 'Low risk'
  const reasons = topFactors.map((f) => f.evidence).join('. ')
  return `${riskLabel}: ${reasons}.`
}

export function scoreAccount(signals: AccountSignals): ChurnScoreResult {
  const factors: ChurnFactor[] = [
    scoreBillingHealth(signals),
    scoreUsageTrajectory(signals),
    scoreEngagementDepth(signals),
    scoreSupportFriction(signals),
    scoreCommunicationGap(signals),
    scoreRenewalProximity(signals),
  ]

  const score = clamp(
    factors.reduce((sum, f) => sum + f.weightedValue, 0),
    0,
    100
  )

  const riskLevel = determineRiskLevel(score)
  const summary = buildSummary(factors, riskLevel)

  return { score, riskLevel, factors, summary }
}

/**
 * Build AccountSignals from raw database fields.
 * This bridges the gap between DB columns and the scoring engine input.
 *
 * Enrichment data is optional — when integrations are connected,
 * they provide richer signals (seats, feature usage, tickets, CSAT).
 * Without enrichment, the engine uses conservative defaults that
 * don't inflate or deflate scores artificially.
 */
export function buildSignalsFromAccount(account: {
  mrr_cents: number
  usage_delta_percent: number
  risk_level: string
  open_issue: string | null
  last_touch_at: string | null
  renewal_at: string | null
  account_status: string
}, enrichment?: {
  failed_payment_count?: number
  plan_change_direction?: 'upgrade' | 'downgrade' | 'none'
  open_ticket_count?: number
  repeated_complaints?: boolean
  csat_score?: number | null
  usage_delta_7d?: number
  usage_delta_30d?: number
  active_seats?: number
  total_seats?: number
  feature_breadth?: number  // 0-1
  days_inactive?: number
  has_unreplied_thread?: boolean
}): AccountSignals {
  const now = Date.now()
  const daysSinceTouch = account.last_touch_at
    ? Math.floor((now - new Date(account.last_touch_at).getTime()) / (1000 * 60 * 60 * 24))
    : 30

  const daysUntilRenewal = account.renewal_at
    ? Math.floor((new Date(account.renewal_at).getTime() - now) / (1000 * 60 * 60 * 24))
    : null

  const totalSeats = enrichment?.total_seats ?? 1
  const activeSeats = enrichment?.active_seats ?? totalSeats

  return {
    // Billing
    paymentStatus: account.account_status === 'past_due'
      ? 'past_due'
      : account.account_status === 'cancelled'
        ? 'cancelled'
        : 'current',
    failedPaymentCount: enrichment?.failed_payment_count
      ?? (account.account_status === 'past_due' ? 1 : 0),
    daysSinceLastPayment: 0,
    planChangeDirection: enrichment?.plan_change_direction ?? 'none',
    mrrCents: account.mrr_cents,

    // Usage — prefer granular data from enrichment
    usageDelta7d: enrichment?.usage_delta_7d ?? account.usage_delta_percent,
    usageDelta30d: enrichment?.usage_delta_30d ?? account.usage_delta_percent,
    activeSeats,
    totalSeats,
    keyFeatureUsageDropped: account.usage_delta_percent < -30,

    // Engagement — use real data when available, neutral defaults otherwise
    daysInactive: enrichment?.days_inactive
      ?? (account.usage_delta_percent < -50 ? 7 : 0),
    featureBreadth: enrichment?.feature_breadth ?? 0.5,
    teamAdoptionRate: totalSeats > 0 ? activeSeats / totalSeats : 1.0,

    // Support
    openTicketCount: enrichment?.open_ticket_count
      ?? (account.open_issue && account.open_issue !== 'None' ? 1 : 0),
    repeatedComplaints: enrichment?.repeated_complaints ?? false,
    csatScore: enrichment?.csat_score ?? null,

    // Communication
    daysSinceLastFounderTouch: daysSinceTouch,
    hasUnrepliedThread: enrichment?.has_unreplied_thread ?? (daysSinceTouch > 5),

    // Renewal
    daysUntilRenewal,
  }
}

