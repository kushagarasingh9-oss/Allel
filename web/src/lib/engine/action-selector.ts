/**
 * Action Selector
 *
 * Maps churn signals to the best automated action.
 * Uses the action selection matrix from the agent spec.
 */

import type { ChurnScoreResult, AccountSignals } from './score-engine'

export type AgentActionType =
  | 'draft_save_email'
  | 'draft_checkin_email'
  | 'draft_renewal_rescue'
  | 'draft_billing_recovery'
  | 'draft_activation_nudge'
  | 'draft_issue_followup'
  | 'offer_rescue_discount'
  | 'create_internal_ticket'
  | 'schedule_checkin_call'
  | 'send_usage_report'
  | 'celebrate_milestone'
  | 'no_action'

export type SelectedAction = {
  primary: AgentActionType
  secondary: AgentActionType
  reason: string
  draftType: string | null
  urgency: 'immediate' | 'today' | 'this_week' | 'none'
}

export function selectAction(
  score: ChurnScoreResult,
  signals: AccountSignals
): SelectedAction {
  // Cancelled → exit save
  if (signals.paymentStatus === 'cancelled') {
    return {
      primary: 'draft_save_email',
      secondary: 'offer_rescue_discount',
      reason: 'Subscription cancelled — send save email with rescue offer',
      draftType: 'Save email',
      urgency: 'immediate',
    }
  }

  // Failed payment
  if (signals.paymentStatus === 'failed' || signals.failedPaymentCount > 0) {
    return {
      primary: 'draft_billing_recovery',
      secondary: 'offer_rescue_discount',
      reason: 'Payment failed — send billing recovery and offer discount',
      draftType: 'Billing recovery',
      urgency: 'immediate',
    }
  }

  // High risk + renewal near
  if (
    score.riskLevel === 'high' &&
    signals.daysUntilRenewal !== null &&
    signals.daysUntilRenewal <= 14
  ) {
    return {
      primary: 'draft_renewal_rescue',
      secondary: 'offer_rescue_discount',
      reason: `Renewal in ${signals.daysUntilRenewal} days with high churn risk`,
      draftType: 'Renewal rescue',
      urgency: 'immediate',
    }
  }

  // Major usage drop
  if (signals.usageDelta7d < -30 || signals.keyFeatureUsageDropped) {
    return {
      primary: 'draft_checkin_email',
      secondary: 'send_usage_report',
      reason: 'Sharp usage decline detected',
      draftType: 'Check-in email',
      urgency: 'today',
    }
  }

  // Support frustration
  if (signals.repeatedComplaints || signals.openTicketCount > 2) {
    return {
      primary: 'create_internal_ticket',
      secondary: 'draft_issue_followup',
      reason: 'Support friction rising — escalate internally and follow up',
      draftType: 'Issue follow-up',
      urgency: 'today',
    }
  }

  // Support issue open
  if (signals.openTicketCount > 0 && (signals.csatScore !== null && signals.csatScore < 4)) {
    return {
      primary: 'draft_issue_followup',
      secondary: 'create_internal_ticket',
      reason: 'Open support issue with declining satisfaction',
      draftType: 'Issue follow-up',
      urgency: 'today',
    }
  }

  // No reply to previous outreach
  if (signals.hasUnrepliedThread && signals.daysSinceLastFounderTouch > 7) {
    return {
      primary: 'schedule_checkin_call',
      secondary: 'create_internal_ticket',
      reason: 'No reply to follow-up — try scheduling a call',
      draftType: null,
      urgency: 'this_week',
    }
  }

  // Low team adoption (trial/onboarding)
  if (signals.teamAdoptionRate < 0.3 && signals.activeSeats < signals.totalSeats) {
    return {
      primary: 'draft_activation_nudge',
      secondary: 'send_usage_report',
      reason: 'Team activation stalled',
      draftType: 'Activation nudge',
      urgency: 'this_week',
    }
  }

  // Communication gap with medium risk
  if (score.riskLevel === 'medium' && signals.daysSinceLastFounderTouch > 7) {
    return {
      primary: 'draft_checkin_email',
      secondary: 'no_action',
      reason: 'Medium risk with communication gap',
      draftType: 'Check-in email',
      urgency: 'this_week',
    }
  }

  // High risk but no specific trigger matched = general save
  if (score.riskLevel === 'high') {
    return {
      primary: 'draft_save_email',
      secondary: 'create_internal_ticket',
      reason: 'High overall churn risk — proactive founder outreach',
      draftType: 'Save email',
      urgency: 'today',
    }
  }

  // Medium risk = check in
  if (score.riskLevel === 'medium') {
    return {
      primary: 'draft_checkin_email',
      secondary: 'no_action',
      reason: 'Moderate churn risk — light check-in',
      draftType: 'Check-in email',
      urgency: 'this_week',
    }
  }

  return {
    primary: 'no_action',
    secondary: 'no_action',
    reason: 'Account is healthy',
    draftType: null,
    urgency: 'none',
  }
}
