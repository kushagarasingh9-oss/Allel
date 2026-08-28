/**
 * Score History & Velocity Tracking
 *
 * Records point-in-time snapshots of churn scores and computes
 * velocity (rate of change per day) from recent history.
 *
 * Flow:
 * 1. Scoring engine computes a ChurnScoreResult
 * 2. recordScoreSnapshot() persists the snapshot and updates velocity
 * 3. Velocity is available on customer_accounts for fast reads
 */

import { createServiceClient } from '@/foundation/database/service'
import type { ChurnScoreResult } from './score-engine'

// ─── Types ──────────────────────────────────────────────────────────

export type ScoreSnapshot = {
  id: string
  workspace_id: string
  customer_account_id: string
  score: number
  risk_level: string
  factors: unknown
  created_at: string
}

export type ScoreVelocityResult = {
  /** Points per day — positive means score is increasing (worsening risk) */
  velocity: number
  /** Number of data points used */
  dataPoints: number
  /** Time span in days covered by the data points */
  spanDays: number
}

// ─── Record a snapshot ──────────────────────────────────────────────

/**
 * Persist a score snapshot and update the velocity columns on customer_accounts.
 * Called after every score computation.
 */
export async function recordScoreSnapshot(
  workspaceId: string,
  accountId: string,
  scoreResult: ChurnScoreResult
): Promise<void> {
  const supabase = createServiceClient()

  // 1. Get the current score so we can store it as previous_score
  const { data: currentAccount } = await supabase
    .from('customer_accounts')
    .select('risk_score')
    .eq('id', accountId)
    .single()

  const previousScore = currentAccount?.risk_score ?? null

  // 2. Insert the snapshot
  const { error: insertError } = await supabase
    .from('score_snapshots')
    .insert({
      workspace_id: workspaceId,
      customer_account_id: accountId,
      score: scoreResult.score,
      risk_level: scoreResult.riskLevel,
      factors: scoreResult.factors,
    })

  if (insertError) {
    console.error('[score-history] Failed to insert snapshot:', insertError.message)
    return
  }

  // 3. Compute velocity from recent history
  const velocityResult = await calculateScoreVelocity(workspaceId, accountId)

  // 4. Update customer_accounts with velocity and previous score
  const { error: updateError } = await supabase
    .from('customer_accounts')
    .update({
      previous_score: previousScore,
      score_velocity: velocityResult.velocity,
    })
    .eq('id', accountId)

  if (updateError) {
    console.error('[score-history] Failed to update velocity:', updateError.message)
  }
}

// ─── Velocity calculation ───────────────────────────────────────────

/**
 * Compute score velocity from the last 7 snapshots using linear regression.
 *
 * Returns the slope (points per day). Positive = worsening, negative = improving.
 * With fewer than 2 data points, returns velocity 0.
 */
export async function calculateScoreVelocity(
  workspaceId: string,
  accountId: string
): Promise<ScoreVelocityResult> {
  const supabase = createServiceClient()

  const { data: snapshots, error } = await supabase
    .from('score_snapshots')
    .select('score, created_at')
    .eq('workspace_id', workspaceId)
    .eq('customer_account_id', accountId)
    .order('created_at', { ascending: true })
    .limit(7)

  if (error || !snapshots || snapshots.length < 2) {
    return { velocity: 0, dataPoints: snapshots?.length ?? 0, spanDays: 0 }
  }

  // Convert timestamps to days relative to the first snapshot
  const t0 = new Date(snapshots[0].created_at).getTime()
  const MS_PER_DAY = 86_400_000

  const points = snapshots.map((s) => ({
    t: (new Date(s.created_at).getTime() - t0) / MS_PER_DAY,
    score: s.score,
  }))

  const spanDays = points[points.length - 1].t

  // Edge case: all snapshots have the same timestamp
  if (spanDays === 0) {
    return { velocity: 0, dataPoints: snapshots.length, spanDays: 0 }
  }

  // Simple linear regression: slope = Σ((t-t̄)(s-s̄)) / Σ((t-t̄)²)
  const n = points.length
  const meanT = points.reduce((sum, p) => sum + p.t, 0) / n
  const meanS = points.reduce((sum, p) => sum + p.score, 0) / n

  let numerator = 0
  let denominator = 0
  for (const p of points) {
    const dt = p.t - meanT
    numerator += dt * (p.score - meanS)
    denominator += dt * dt
  }

  const slope = denominator === 0 ? 0 : numerator / denominator
  const velocity = Math.round(slope)

  return { velocity, dataPoints: n, spanDays }
}

// ─── History retrieval ──────────────────────────────────────────────

/**
 * Retrieve recent score snapshots for an account.
 *
 * @param days - Number of days of history to retrieve (default: 30)
 * @returns Snapshots ordered newest-first
 */
export async function getScoreHistory(
  workspaceId: string,
  accountId: string,
  days: number = 30
): Promise<ScoreSnapshot[]> {
  const supabase = createServiceClient()

  const since = new Date()
  since.setDate(since.getDate() - days)

  const { data, error } = await supabase
    .from('score_snapshots')
    .select('id, workspace_id, customer_account_id, score, risk_level, factors, created_at')
    .eq('workspace_id', workspaceId)
    .eq('customer_account_id', accountId)
    .gte('created_at', since.toISOString())
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[score-history] Failed to fetch history:', error.message)
    return []
  }

  return data ?? []
}
