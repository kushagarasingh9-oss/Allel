import { SCENARIO_MANIFEST_V1 } from './manifest.v1';
import { computeRiskDecision } from '../scoring';
import { evaluateActionPolicy } from '../policy';
import { AccountFeatures } from '../types';
import { RECOVERY_CONFIG } from '../config';

export type EvaluationReport = {
  totalScenarios: number;
  correctlyFlagged: number;
  falsePositives: number;
  falseNegatives: number;
  precision: number;
  recall: number;
  healthySuppressionRate: number;
  scenarioResults: Array<{
    scenarioId: string;
    accountName: string;
    expectedRisk: boolean;
    computedScore: number | null;
    computedSeverity: string;
    expectedSeverity: string;
    actionType: string;
    expectedAction: string;
    passed: boolean;
    reason: string;
  }>;
};

export function evaluateScenarioManifest(): EvaluationReport {
  const results = [];
  let truePositives = 0;
  let falsePositives = 0;
  let trueNegatives = 0;
  let falseNegatives = 0;
  let healthyControlCount = 0;
  let healthySuppressedCount = 0;

  for (const def of SCENARIO_MANIFEST_V1) {
    const features: AccountFeatures = {
      workspaceId: 'test_ws',
      customerAccountId: `acc_${def.scenarioId}`,
      billingAvailable: def.featuresPatch.billingAvailable ?? false,
      billingStatus: def.featuresPatch.billingStatus ?? null,
      stripeCustomerId: def.stripeCustomerId,
      stripeSubscriptionId: null,
      currentMrrCents: def.featuresPatch.currentMrrCents ?? def.initialMrrCents,
      preCancelMrrCents: def.featuresPatch.preCancelMrrCents ?? null,
      lastInvoiceId: def.featuresPatch.lastInvoiceId ?? null,
      lastInvoiceStatus: def.featuresPatch.lastInvoiceStatus ?? null,
      failedPaymentCount7d: def.featuresPatch.failedPaymentCount7d ?? 0,
      failedPaymentCount30d: def.featuresPatch.failedPaymentCount30d ?? 0,
      lastPaymentFailedAt: def.featuresPatch.lastPaymentFailedAt ?? null,
      lastPaymentSucceededAt: null,
      cancelAtPeriodEnd: def.featuresPatch.cancelAtPeriodEnd ?? null,
      cancelledAt: def.featuresPatch.cancelledAt ?? null,
      usageAvailable: def.featuresPatch.usageAvailable ?? false,
      usageCurrent7d: def.featuresPatch.usageCurrent7d ?? null,
      usagePrevious7d: def.featuresPatch.usagePrevious7d ?? null,
      usageDeltaPercent: def.featuresPatch.usageDeltaPercent ?? null,
      keyFeatureCurrent7d: def.featuresPatch.keyFeatureCurrent7d ?? null,
      keyFeaturePrevious7d: def.featuresPatch.keyFeaturePrevious7d ?? null,
      keyFeatureMissing: def.featuresPatch.keyFeatureMissing ?? null,
      cancelIntentAt: def.featuresPatch.cancelIntentAt ?? null,
      lastProductActivityAt: null,
      communicationAvailable: def.featuresPatch.communicationAvailable ?? false,
      lastOutboundAt: def.featuresPatch.lastOutboundAt ?? null,
      lastInboundAt: def.featuresPatch.lastInboundAt ?? null,
      unrepliedOutboundCount: def.featuresPatch.unrepliedOutboundCount ?? 0,
      gmailThreadId: null,
      billingFreshAt: new Date().toISOString(),
      usageFreshAt: new Date().toISOString(),
      communicationFreshAt: def.featuresPatch.communicationAvailable ? new Date().toISOString() : null,
      sourceWatermarks: {},
      featureVersion: 'features-v1-2026-08',
      computedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const identityConfidence = def.scenarioId === 'ALLEL-014' ? 0.70 : 1.0;
    const contactPolicy = def.contactPolicy
      ? {
          id: 'pol_1',
          workspaceId: 'test_ws',
          customerAccountId: features.customerAccountId,
          channel: 'email',
          address: def.contactEmail,
          policy: def.contactPolicy,
          reason: 'Configured',
          source: 'seed',
          expiresAt: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }
      : null;

    const riskDecision = computeRiskDecision(features, identityConfidence, def.initialMrrCents);
    const actionDecision = evaluateActionPolicy({
      riskDecision,
      identityConfidence,
      contactPolicy,
    });

    const isRisk = (riskDecision.score ?? 0) >= RECOVERY_CONFIG.RISK_MEDIUM_MIN;
    const severityMatch = riskDecision.severity === def.expectedSeverity;
    const actionMatch =
      actionDecision.actionType === def.expectedAction ||
      (def.expectedAction === 'no_action' && (!actionDecision.allowed || actionDecision.actionType === 'no_action'));

    const passed = severityMatch && actionMatch;

    if (!def.expectedRisk) {
      healthyControlCount++;
      if (!isRisk || actionDecision.actionType === 'no_action') {
        healthySuppressedCount++;
        trueNegatives++;
      } else {
        falsePositives++;
      }
    } else {
      if (isRisk) {
        truePositives++;
      } else {
        falseNegatives++;
      }
    }

    results.push({
      scenarioId: def.scenarioId,
      accountName: def.accountName,
      expectedRisk: def.expectedRisk,
      computedScore: riskDecision.score,
      computedSeverity: riskDecision.severity,
      expectedSeverity: def.expectedSeverity,
      actionType: actionDecision.actionType,
      expectedAction: def.expectedAction,
      passed,
      reason: actionDecision.actionReason,
    });
  }

  const precision = truePositives + falsePositives > 0 ? truePositives / (truePositives + falsePositives) : 1.0;
  const recall = truePositives + falseNegatives > 0 ? truePositives / (truePositives + falseNegatives) : 1.0;
  const healthySuppressionRate = healthyControlCount > 0 ? healthySuppressedCount / healthyControlCount : 1.0;

  return {
    totalScenarios: SCENARIO_MANIFEST_V1.length,
    correctlyFlagged: truePositives,
    falsePositives,
    falseNegatives,
    precision: Math.round(precision * 100) / 100,
    recall: Math.round(recall * 100) / 100,
    healthySuppressionRate: Math.round(healthySuppressionRate * 100) / 100,
    scenarioResults: results,
  };
}
