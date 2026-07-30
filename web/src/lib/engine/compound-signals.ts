/**
 * Compound Signal Detection
 *
 * Analyses score history to detect temporal patterns that a single
 * point-in-time score cannot capture. These patterns drive higher-urgency
 * actions in the agent pipeline.
 *
 * Detected patterns:
 * - accelerating_decline: score rising >5 pts/day for 3+ consecutive days
 * - sudden_spike: score jumped >20 points in a single day
 * - chronic_medium_risk: score stuck in 40–70 range for 14+ days
 * - recovery_in_progress: score declining for 3+ consecutive days
 */

import type { ScoreSnapshot } from './score-history'

// ─── Types ──────────────────────────────────────────────────────────

export type CompoundSignalPattern =
  | 'accelerating_decline'
  | 'sudden_spike'
  | 'chronic_medium_risk'
  | 'recovery_in_progress'

export type CompoundSignalSeverity = 'critical' | 'high' | 'medium' | 'low'

export type CompoundSignal = {
  pattern: CompoundSignalPattern
  severity: CompoundSignalSeverity
  description: string
}

// ─── Helpers ────────────────────────────────────────────────────────

const MS_PER_DAY = 86_400_000

/** Sort snapshots oldest-first by created_at. Returns a new array. */
function chronological(snapshots: ScoreSnapshot[]): ScoreSnapshot[] {
  return [...snapshots].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  )
}

/**
 * Build daily deltas from chronologically-sorted snapshots.
 * Each delta represents the score change and elapsed days between consecutive snapshots.
 */
function buildDeltas(sorted: ScoreSnapshot[]): Array<{ delta: number; days: number }> {
  const deltas: Array<{ delta: number; days: number }> = []
  for (let i = 1; i < sorted.length; i++) {
    const days =
      (new Date(sorted[i].created_at).getTime() - new Date(sorted[i - 1].created_at).getTime()) /
      MS_PER_DAY
    deltas.push({
      delta: sorted[i].score - sorted[i - 1].score,
      days: Math.max(days, 0.01), // avoid division by zero
    })
  }
  return deltas
}

// ─── Individual detectors ───────────────────────────────────────────

/**
 * Accelerating decline: score increasing by >5 points/day for 3+ consecutive intervals.
 * (Higher score = worse, so this means the customer is rapidly getting more at-risk.)
 */
function detectAcceleratingDecline(sorted: ScoreSnapshot[]): CompoundSignal | null {
  const deltas = buildDeltas(sorted)

  let consecutiveCount = 0
  let maxRate = 0

  for (const d of deltas) {
    const rate = d.delta / d.days
    if (rate > 5) {
      consecutiveCount++
      maxRate = Math.max(maxRate, rate)
    } else {
      consecutiveCount = 0
      maxRate = 0
    }

    if (consecutiveCount >= 3) {
      return {
        pattern: 'accelerating_decline',
        severity: maxRate > 10 ? 'critical' : 'high',
        description: `Score has been increasing at >${Math.round(maxRate)} pts/day for ${consecutiveCount} consecutive intervals — accelerating churn risk.`,
      }
    }
  }

  return null
}

/**
 * Sudden spike: score jumped more than 20 points in a single day.
 */
function detectSuddenSpike(sorted: ScoreSnapshot[]): CompoundSignal | null {
  const deltas = buildDeltas(sorted)

  for (let i = deltas.length - 1; i >= 0; i--) {
    const d = deltas[i]
    if (d.days <= 1.5 && d.delta > 20) {
      return {
        pattern: 'sudden_spike',
        severity: d.delta > 35 ? 'critical' : 'high',
        description: `Score jumped ${d.delta} points in ${d.days < 1 ? 'less than a day' : '~1 day'} — sudden risk spike detected.`,
      }
    }
  }

  return null
}

/**
 * Chronic medium risk: score has remained in the 40–70 range for 14+ days.
 * These accounts are easy to overlook but represent significant churn risk.
 */
function detectChronicMediumRisk(sorted: ScoreSnapshot[]): CompoundSignal | null {
  if (sorted.length < 2) return null

  // Walk backwards from the most recent snapshot
  const latest = sorted[sorted.length - 1]
  if (latest.score < 40 || latest.score > 70) return null

  // Find how far back the score has been in the medium range
  let earliestInRange = latest
  for (let i = sorted.length - 2; i >= 0; i--) {
    if (sorted[i].score >= 40 && sorted[i].score <= 70) {
      earliestInRange = sorted[i]
    } else {
      break
    }
  }

  const spanDays =
    (new Date(latest.created_at).getTime() - new Date(earliestInRange.created_at).getTime()) /
    MS_PER_DAY

  if (spanDays >= 14) {
    return {
      pattern: 'chronic_medium_risk',
      severity: spanDays >= 21 ? 'high' : 'medium',
      description: `Score has been in the medium-risk zone (40–70) for ${Math.round(spanDays)} days — chronic risk that needs proactive attention.`,
    }
  }

  return null
}

/**
 * Recovery in progress: score has been declining for 3+ consecutive intervals.
 * (Lower score = better, so this is a positive signal worth surfacing.)
 */
function detectRecoveryInProgress(sorted: ScoreSnapshot[]): CompoundSignal | null {
  const deltas = buildDeltas(sorted)

  let consecutiveDecline = 0
  let totalRecovery = 0

  // Check from the most recent deltas backwards
  for (let i = deltas.length - 1; i >= 0; i--) {
    if (deltas[i].delta < 0) {
      consecutiveDecline++
      totalRecovery += Math.abs(deltas[i].delta)
    } else {
      break
    }
  }

  if (consecutiveDecline >= 3) {
    return {
      pattern: 'recovery_in_progress',
      severity: 'low',
      description: `Score has declined ${totalRecovery} points over ${consecutiveDecline} consecutive intervals — recovery in progress.`,
    }
  }

  return null
}

// ─── Public API ─────────────────────────────────────────────────────

/**
 * Detect compound signals from an account's score history.
 *
 * @param _accountId - The customer account ID (for context, not used in logic)
 * @param _currentScore - The latest churn score (for context)
 * @param history - Recent ScoreSnapshot records (any order is fine)
 * @returns Array of detected compound signals, ordered by severity
 */
export function detectCompoundSignals(
  _accountId: string,
  _currentScore: number,
  history: ScoreSnapshot[]
): CompoundSignal[] {
  if (history.length < 2) return []

  const sorted = chronological(history)
  const signals: CompoundSignal[] = []

  // Run all detectors
  const accelerating = detectAcceleratingDecline(sorted)
  if (accelerating) signals.push(accelerating)

  const spike = detectSuddenSpike(sorted)
  if (spike) signals.push(spike)

  const chronic = detectChronicMediumRisk(sorted)
  if (chronic) signals.push(chronic)

  const recovery = detectRecoveryInProgress(sorted)
  if (recovery) signals.push(recovery)

  // Sort by severity: critical > high > medium > low
  const severityOrder: Record<CompoundSignalSeverity, number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
  }

  signals.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity])

  return signals
}
