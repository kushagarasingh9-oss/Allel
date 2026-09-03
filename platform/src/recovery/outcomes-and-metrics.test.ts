import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolveOutcomeWindowDays } from './cases';
import { projectPostHogEvent } from './provider-projection';
import { calculateRecoveryMetrics } from './metrics';
import { evaluateScenarioManifest } from './scenarios/evaluate';
import { SCENARIO_MANIFEST_V1 } from './scenarios/manifest.v1';

describe('Phase 7: Outcomes, Attribution, and Financial Metrics', () => {
  describe('Finding 6: Distinct Case Attribution Windows', () => {
    it('resolves 45 days for cancellation reactivation cases', () => {
      assert.equal(resolveOutcomeWindowDays('cancellation_rescue_email', 'billing_cancelled'), 45);
      assert.equal(resolveOutcomeWindowDays('reactivation_offer', 'subscription_cancelled'), 45);
    });

    it('resolves 30 days for cancel intent cases', () => {
      assert.equal(resolveOutcomeWindowDays('cancellation_rescue_email', 'cancel_intent'), 30);
    });

    it('resolves 21 days for usage decline cases', () => {
      assert.equal(resolveOutcomeWindowDays('usage_checkin_email', 'usage_drop'), 21);
      assert.equal(resolveOutcomeWindowDays('feature_onboarding_email', 'key_feature_missing'), 21);
    });

    it('resolves 14 days for communication / gmail engagement cases', () => {
      assert.equal(resolveOutcomeWindowDays('founder_review', 'gmail_unreplied'), 14);
    });

    it('resolves 30 days default for involuntary billing cases', () => {
      assert.equal(resolveOutcomeWindowDays('billing_recovery_email', 'billing_failure'), 30);
      assert.equal(resolveOutcomeWindowDays('compound_recovery_email', 'billing_failure'), 30);
    });
  });

  describe('Finding 7: Three-Signal Product Recovery Detection', () => {
    it('detects signal 1: explicit allel_recovery_action event', () => {
      const proj = projectPostHogEvent('wh_1', 'ev_1', { event: 'allel_recovery_action' }, new Date().toISOString());
      assert.deepEqual(proj.outcomeCandidate, { kind: 'usage_rebound' });
    });

    it('detects signal 2: usage rebound to >= 80% of prior baseline', () => {
      const proj = projectPostHogEvent(
        'wh_2',
        'ev_2',
        {
          event: '$pageview',
          properties: {
            usage_current_7d: 85,
            usage_previous_7d: 100,
          },
        },
        new Date().toISOString()
      );
      assert.deepEqual(proj.outcomeCandidate, { kind: 'usage_rebound' });
    });

    it('rejects usage below 80% of prior baseline', () => {
      const proj = projectPostHogEvent(
        'wh_3',
        'ev_3',
        {
          event: '$pageview',
          properties: {
            usage_current_7d: 70,
            usage_previous_7d: 100,
          },
        },
        new Date().toISOString()
      );
      assert.equal(proj.outcomeCandidate, null);
    });

    it('detects signal 3: key feature restoration', () => {
      const proj = projectPostHogEvent(
        'wh_4',
        'ev_4',
        {
          event: 'key_feature_used',
          properties: {
            key_feature_current_7d: 5,
            key_feature_missing: false,
          },
        },
        new Date().toISOString()
      );
      assert.deepEqual(proj.outcomeCandidate, { kind: 'usage_rebound' });
    });
  });

  describe('Finding 4: Scenario Manifest & Blueprint Alignment', () => {
    it('ALLEL-012 specifies exact $4,000 baseline and strictly_recovered expectations', () => {
      const sc12 = SCENARIO_MANIFEST_V1.find((s) => s.scenarioId === 'ALLEL-012');
      assert.ok(sc12, 'ALLEL-012 must exist');
      assert.equal(sc12.initialMrrCents, 400000, 'Baseline MRR must be $4,000 (400,000 cents)');
      assert.equal(sc12.expectedResolution, 'strictly_recovered');
      assert.equal(sc12.expectedStrictRecoveredCents, 400000);
    });

    it('ALLEL-015 specifies exact $1,300 baseline, engaged resolution, and 0 strict recovery', () => {
      const sc15 = SCENARIO_MANIFEST_V1.find((s) => s.scenarioId === 'ALLEL-015');
      assert.ok(sc15, 'ALLEL-015 must exist');
      assert.equal(sc15.initialMrrCents, 130000, 'Baseline MRR must be $1,300 (130,000 cents)');
      assert.equal(sc15.expectedResolution, 'engaged');
      assert.equal(sc15.expectedStrictRecoveredCents, 0);
    });

    it('evaluateScenarioManifest reports 100% precision and healthy suppression', () => {
      const report = evaluateScenarioManifest();
      assert.equal(report.precision, 1.0);
      assert.equal(report.recall, 1.0);
      assert.equal(report.healthySuppressionRate, 1.0);
      const sc12Result = report.scenarioResults.find((r) => r.scenarioId === 'ALLEL-012');
      assert.equal(sc12Result?.expectedStrictRecoveredCents, 400000);
      const sc15Result = report.scenarioResults.find((r) => r.scenarioId === 'ALLEL-015');
      assert.equal(sc15Result?.expectedStrictRecoveredCents, 0);
    });
  });

  describe('Finding 3: Metric Aggregation & Financial Partitioning', () => {
    it('correctly aggregates engagedCases and productRecoveredCases across outcomes and cases', async () => {
      const mockSupabase: any = {
        from: (table: string) => {
          if (table === 'recovery_cases') {
            return {
              select: () => ({
                eq: () => ({
                  eq: () => ({
                    gte: () => ({
                      lte: async () => ({
                        data: [
                          { id: 'case-1', status: 'monitoring', mrr_baseline_cents: 100000 },
                          { id: 'case-2', status: 'resolved', resolution: 'churned', mrr_baseline_cents: 50000 },
                          { id: 'case-3', status: 'resolved', resolution: 'product_recovered', mrr_baseline_cents: 80000 },
                        ],
                        error: null,
                      }),
                    }),
                  }),
                }),
              }),
            };
          }
          if (table === 'draft_outcomes') {
            return {
              select: () => ({
                eq: () => ({
                  eq: () => ({
                    gte: () => ({
                      lte: async () => ({
                        data: [
                          // Case 1 is in monitoring, but customer replied (engaged)
                          {
                            id: 'out-1',
                            recovery_case_id: 'case-1',
                            outcome_type: 'engaged',
                            strict_recovered_cents: 0,
                            protected_cents: 0,
                          },
                          // Retried duplicate row for out-1 must be deduplicated
                          {
                            id: 'out-1',
                            recovery_case_id: 'case-1',
                            outcome_type: 'engaged',
                            strict_recovered_cents: 0,
                            protected_cents: 0,
                          },
                          // Recovery for case-4
                          {
                            id: 'out-2',
                            recovery_case_id: 'case-4',
                            outcome_type: 'strictly_recovered',
                            strict_recovered_cents: 400000,
                            protected_cents: 0,
                          },
                        ],
                        error: null,
                      }),
                    }),
                  }),
                }),
              }),
            };
          }
          return {};
        },
      };

      const metrics = await calculateRecoveryMetrics(mockSupabase, 'ws-test', { testMode: false });
      assert.equal(metrics.strictRecoveredCents, 400000);
      assert.equal(metrics.protectedCents, 0);
      assert.equal(metrics.atRiskCents, 100000);
      assert.equal(metrics.engagedCases, 1, 'Case 1 in monitoring must be counted as engaged from draft_outcomes');
      assert.equal(metrics.productRecoveredCases, 1, 'Case 3 resolved as product_recovered must be counted');
      assert.equal(metrics.churnedCases, 1);
      assert.equal(metrics.pendingCases, 1);
    });
  });
});
