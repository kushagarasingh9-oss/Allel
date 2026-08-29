import { ActionDecision, ActionType, ActionUrgency, ContactPolicy, RiskDecision } from './types';
import { RECOVERY_CONFIG } from './config';

export function evaluateActionPolicy(params: {
  riskDecision: RiskDecision;
  identityConfidence: number;
  contactPolicy?: ContactPolicy | null;
  lastActionTimestamp?: string | null;
  lastActionType?: ActionType | null;
  now?: Date;
}): ActionDecision {
  const { riskDecision, identityConfidence, contactPolicy } = params;
  const now = params.now || new Date();

  // 1. Contact policy check
  if (contactPolicy && contactPolicy.policy === 'do_not_contact') {
    return {
      actionType: 'no_action',
      allowed: false,
      requiresApproval: false,
      urgency: 'none',
      reasonCode: 'contact_policy_do_not_contact',
      actionReason: 'Contact policy suppresses automated communication',
      suppressionReason: `do_not_contact: ${contactPolicy.reason}`,
      policyVersion: RECOVERY_CONFIG.POLICY_VERSION,
      cooldownUntil: null,
    };
  }

  if (contactPolicy && contactPolicy.policy === 'transactional_only') {
    return {
      actionType: 'no_action',
      allowed: false,
      requiresApproval: false,
      urgency: 'none',
      reasonCode: 'contact_policy_transactional_only',
      actionReason: 'Recovery outreach is not permitted by this contact policy',
      suppressionReason: `transactional_only: ${contactPolicy.reason}`,
      policyVersion: RECOVERY_CONFIG.POLICY_VERSION,
      cooldownUntil: null,
    };
  }

  if (contactPolicy && contactPolicy.policy === 'manual_review_only') {
    return {
      actionType: 'founder_review',
      allowed: true,
      requiresApproval: true,
      urgency: 'today',
      reasonCode: 'contact_policy_manual_review_only',
      actionReason: `Contact policy requires founder review: ${contactPolicy.reason}`,
      suppressionReason: null,
      policyVersion: RECOVERY_CONFIG.POLICY_VERSION,
      cooldownUntil: null,
    };
  }

  // 2. Identity confidence gate (< 0.90 blocks automated email)
  if (identityConfidence < RECOVERY_CONFIG.AUTOMATIC_IDENTITY_CONFIDENCE_MIN) {
    return {
      actionType: 'founder_review',
      allowed: true,
      requiresApproval: true,
      urgency: 'today',
      reasonCode: 'low_identity_confidence_founder_review',
      actionReason: `Identity confidence (${identityConfidence}) is below 0.90 threshold for automatic outreach`,
      suppressionReason: null,
      policyVersion: RECOVERY_CONFIG.POLICY_VERSION,
      cooldownUntil: null,
    };
  }

  // 3. Healthy / low risk (< 45)
  if (riskDecision.score == null || riskDecision.score < RECOVERY_CONFIG.RISK_MEDIUM_MIN) {
    return {
      actionType: 'no_action',
      allowed: true,
      requiresApproval: false,
      urgency: 'none',
      reasonCode: 'account_healthy_no_action',
      actionReason: 'Account risk score is low; no intervention needed',
      suppressionReason: null,
      policyVersion: RECOVERY_CONFIG.POLICY_VERSION,
      cooldownUntil: null,
    };
  }

  // 4. Low score confidence (< 0.75)
  if (riskDecision.confidence < RECOVERY_CONFIG.ACTION_CONFIDENCE_MIN) {
    return {
      actionType: 'founder_review',
      allowed: true,
      requiresApproval: true,
      urgency: 'today',
      reasonCode: 'low_score_confidence_founder_review',
      actionReason: `Risk confidence (${riskDecision.confidence}) is below ${RECOVERY_CONFIG.ACTION_CONFIDENCE_MIN}; operator review required`,
      suppressionReason: null,
      policyVersion: RECOVERY_CONFIG.POLICY_VERSION,
      cooldownUntil: null,
    };
  }

  // 5. Hard events and risk actions
  let actionType: ActionType = 'founder_review';
  let urgency: ActionUrgency = 'this_week';
  let reasonCode = 'risk_review';
  let actionReason = 'Account flagged for risk review';

  const overrides = riskDecision.hardOverrides;

  if (overrides.includes('subscription_cancelled') || overrides.includes('cancel_at_period_end') || overrides.includes('cancel_intent')) {
    actionType = 'cancellation_rescue_email';
    urgency = 'immediate';
    reasonCode = 'cancellation_rescue';
    actionReason = 'Subscription cancellation or cancellation intent detected';
  } else if (overrides.includes('compound_billing_and_usage_risk')) {
    actionType = 'compound_recovery_email';
    urgency = 'immediate';
    reasonCode = 'compound_recovery';
    actionReason = 'Concurrent billing failure and severe usage decline detected';
  } else if (overrides.includes('repeated_payment_failure') || overrides.includes('single_payment_failure') || overrides.includes('past_due_billing')) {
    actionType = 'billing_recovery_email';
    urgency = overrides.includes('repeated_payment_failure') ? 'immediate' : 'today';
    reasonCode = 'billing_recovery';
    actionReason = 'Payment failure or overdue invoice requiring customer billing update';
  } else if (riskDecision.components.usage.value >= 65 || overrides.includes('key_feature_disappearance')) {
    actionType = 'usage_checkin_email';
    urgency = 'today';
    reasonCode = 'usage_checkin';
    actionReason = 'Severe product usage decline or key feature disappearance';
  } else if (riskDecision.severity === 'medium') {
    actionType = 'monitor_only';
    urgency = 'this_week';
    reasonCode = 'moderate_risk_monitoring';
    actionReason = 'Moderate risk score without hard failure event; monitor trajectory';
  }

  // 6. Cooldown enforcement
  let cooldownUntil: string | null = null;
  if (params.lastActionTimestamp && params.lastActionType === actionType) {
    const lastActionMs = new Date(params.lastActionTimestamp).getTime();
    let cooldownHours = 0;

    if (actionType === 'billing_recovery_email') {
      cooldownHours = RECOVERY_CONFIG.BILLING_EMAIL_COOLDOWN_HOURS; // 72h
    } else if (actionType === 'cancellation_rescue_email') {
      cooldownHours = RECOVERY_CONFIG.CANCELLATION_EMAIL_COOLDOWN_DAYS * 24; // 7d
    } else if (actionType === 'usage_checkin_email' || actionType === 'compound_recovery_email') {
      cooldownHours = RECOVERY_CONFIG.USAGE_EMAIL_COOLDOWN_DAYS * 24; // 7d
    }

    if (cooldownHours > 0) {
      const cooldownEndMs = lastActionMs + cooldownHours * 60 * 60 * 1000;
      if (now.getTime() < cooldownEndMs) {
        cooldownUntil = new Date(cooldownEndMs).toISOString();
        return {
          actionType: 'monitor_only',
          allowed: false,
          requiresApproval: false,
          urgency: 'none',
          reasonCode: 'action_cooldown_active',
          actionReason: `Action ${actionType} is inside cooldown until ${cooldownUntil}`,
          suppressionReason: `Cooldown active until ${cooldownUntil}`,
          policyVersion: RECOVERY_CONFIG.POLICY_VERSION,
          cooldownUntil,
        };
      }
    }
  }

  return {
    actionType,
    allowed: true,
    requiresApproval: true,
    urgency,
    reasonCode,
    actionReason,
    suppressionReason: null,
    policyVersion: RECOVERY_CONFIG.POLICY_VERSION,
    cooldownUntil,
  };
}
