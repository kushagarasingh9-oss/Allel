/**
 * Draft Outcome Tracker
 *
 * Measures what happened after a follow-up email was sent:
 * 1. Record initial outcome when a draft is sent
 * 2. Measure outcomes during daily cron (check for responses, recovery, churn)
 * 3. Calculate Revenue Saved metric
 *
 * Measurement windows:
 * - 7 days: Check for customer response
 * - 14 days: Check for usage recovery
 * - 30 days: Final outcome — still active or churned?
 */

import { createServiceClient } from '@/foundation/database/service'

// ─── Types ──────────────────────────────────────────────────────────

type DraftOutcomeRow = {
  id: string
  draft_id: string
  customer_account_id: string
  workspace_id: string
  outcome: string
  mrr_cents_at_send: number
  risk_score_at_send: number | null
  measured_at: string | null
  measurement_window_days: number | null
  account_still_active: boolean | null
  customer_responded: boolean
  usage_recovered: boolean
}

type SentDraftRow = {
  id: string
  workspace_id: string
  customer_account_id: string
  sent_at: string
  customer_accounts: {
    mrr_cents: number
    risk_score: number
    account_status: string
    usage_delta_percent: number
  }
}

type TimelineRow = {
  event_type: string
  event_at: string
}

export type RevenueSavedSummary = {
  totalSavedCents: number
  totalDraftsSent: number
  recoveredCount: number
  respondedCount: number
  churnedCount: number
  pendingCount: number
}

export type OutcomeMeasurementResult = {
  measured: number
  updated: number
  errors: number
}

// ─── Record outcome when draft is sent ──────────────────────────────

/**
 * Called from send-draft.ts after a draft email is actually sent.
 * Creates a `pending` outcome row with the account's current MRR and risk score.
 */
export async function recordDraftSent(input: {
  workspaceId: string
  draftId: string
  customerAccountId: string
}): Promise<void> {
  const supabase = createServiceClient()

  // Get current account state for the snapshot
  const { data: account } = await supabase
    .from('customer_accounts')
    .select('mrr_cents, risk_score')
    .eq('id', input.customerAccountId)
    .single()

  // Update draft's sent_at timestamp
  await supabase
    .from('follow_up_drafts')
    .update({ sent_at: new Date().toISOString() })
    .eq('id', input.draftId)

  // Check if outcome already exists (idempotency)
  const { data: existing } = await supabase
    .from('draft_outcomes')
    .select('id')
    .eq('draft_id', input.draftId)
    .maybeSingle()

  if (existing) return // Already tracked

  await supabase.from('draft_outcomes').insert({
    workspace_id: input.workspaceId,
    draft_id: input.draftId,
    customer_account_id: input.customerAccountId,
    outcome: 'pending',
    mrr_cents_at_send: account?.mrr_cents ?? 0,
    risk_score_at_send: account?.risk_score ?? null,
  })
}

// ─── Measure outcomes during daily cron ─────────────────────────────

/**
 * Called during the daily cron. Checks all `pending` outcomes and updates
 * them based on what happened since the draft was sent.
 */
export async function measurePendingOutcomes(
  workspaceId: string
): Promise<OutcomeMeasurementResult> {
  const supabase = createServiceClient()
  const result: OutcomeMeasurementResult = { measured: 0, updated: 0, errors: 0 }

  // Get all pending outcomes for this workspace
  const { data: pendingOutcomes, error } = await supabase
    .from('draft_outcomes')
    .select(
      'id, draft_id, customer_account_id, workspace_id, outcome, mrr_cents_at_send, risk_score_at_send, measured_at, measurement_window_days, account_still_active, customer_responded, usage_recovered'
    )
    .eq('workspace_id', workspaceId)
    .eq('outcome', 'pending')

  if (error || !pendingOutcomes) return result

  // Get the sent_at for each draft
  const draftIds = pendingOutcomes.map((o) => o.draft_id)
  if (draftIds.length === 0) return result

  const { data: drafts } = await supabase
    .from('follow_up_drafts')
    .select('id, sent_at')
    .in('id', draftIds)

  const draftSentMap = new Map(
    (drafts ?? [])
      .filter((d): d is { id: string; sent_at: string } => d.sent_at != null)
      .map((d) => [d.id, new Date(d.sent_at)])
  )

  for (const outcome of pendingOutcomes as DraftOutcomeRow[]) {
    try {
      const sentAt = draftSentMap.get(outcome.draft_id)
      if (!sentAt) continue

      const daysSinceSend = Math.floor(
        (Date.now() - sentAt.getTime()) / (1000 * 60 * 60 * 24)
      )

      // Too early to measure
      if (daysSinceSend < 7) continue

      result.measured++

      // Get current account state
      const { data: account } = await supabase
        .from('customer_accounts')
        .select('account_status, usage_delta_percent, mrr_cents')
        .eq('id', outcome.customer_account_id)
        .single()

      if (!account) continue

      // Check if customer responded (look for email_received timeline events after sent_at)
      const { data: responses } = await supabase
        .from('account_timeline')
        .select('event_type, event_at')
        .eq('customer_account_id', outcome.customer_account_id)
        .eq('event_type', 'email_received')
        .gt('event_at', sentAt.toISOString())
        .limit(1)

      const customerResponded = (responses ?? []).length > 0
      const accountStillActive = account.account_status === 'active'
      const usageRecovered = account.usage_delta_percent >= 0

      // Determine outcome
      let finalOutcome: string = 'pending'

      if (daysSinceSend >= 30) {
        // Final measurement window
        if (!accountStillActive) {
          finalOutcome = 'churned'
        } else if (customerResponded || usageRecovered) {
          finalOutcome = 'recovered'
        } else {
          finalOutcome = 'unknown'
        }
      } else if (daysSinceSend >= 7) {
        // Intermediate check — look for strong signals
        if (!accountStillActive) {
          finalOutcome = 'churned'
        } else if (customerResponded) {
          finalOutcome = 'responded'
        }
        // Otherwise stay pending until 30 days
      }

      if (finalOutcome === 'pending' && !customerResponded) continue

      const updateData: Record<string, unknown> = {
        customer_responded: customerResponded,
        usage_recovered: usageRecovered,
        account_still_active: accountStillActive,
        measured_at: new Date().toISOString(),
        measurement_window_days: daysSinceSend,
      }

      if (finalOutcome !== 'pending') {
        updateData.outcome = finalOutcome
      }

      const { error: updateError } = await supabase
        .from('draft_outcomes')
        .update(updateData)
        .eq('id', outcome.id)

      if (updateError) {
        result.errors++
        console.error(`[outcome-tracker] Failed to update outcome ${outcome.id}:`, updateError)
      } else {
        result.updated++
      }
    } catch (err) {
      result.errors++
      console.error(`[outcome-tracker] Error measuring outcome ${outcome.id}:`, err)
    }
  }

  return result
}

// ─── Revenue Saved Calculator ───────────────────────────────────────

/**
 * Calculate the total revenue saved by follow-up emails.
 * "Saved" = account was at-risk when the draft was sent + account is still active (recovered/responded).
 */
export async function calculateRevenueSaved(
  workspaceId: string
): Promise<RevenueSavedSummary> {
  const supabase = createServiceClient()

  const { data: outcomes, error } = await supabase
    .from('draft_outcomes')
    .select('outcome, mrr_cents_at_send')
    .eq('workspace_id', workspaceId)

  if (error || !outcomes) {
    return {
      totalSavedCents: 0,
      totalDraftsSent: 0,
      recoveredCount: 0,
      respondedCount: 0,
      churnedCount: 0,
      pendingCount: 0,
    }
  }

  let totalSavedCents = 0
  let recoveredCount = 0
  let respondedCount = 0
  let churnedCount = 0
  let pendingCount = 0

  for (const o of outcomes) {
    switch (o.outcome) {
      case 'recovered':
        recoveredCount++
        totalSavedCents += o.mrr_cents_at_send
        break
      case 'responded':
        respondedCount++
        // Count responded as half-saved (customer engaged but outcome not final)
        totalSavedCents += Math.round(o.mrr_cents_at_send * 0.5)
        break
      case 'churned':
        churnedCount++
        break
      case 'pending':
      case 'unknown':
      default:
        pendingCount++
        break
    }
  }

  return {
    totalSavedCents,
    totalDraftsSent: outcomes.length,
    recoveredCount,
    respondedCount,
    churnedCount,
    pendingCount,
  }
}
