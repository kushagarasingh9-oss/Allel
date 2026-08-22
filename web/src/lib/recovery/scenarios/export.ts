import { evaluateScenarioManifest, EvaluationReport } from './evaluate';

export function exportScenarioEvaluationReport(): {
  markdownTable: string;
  report: EvaluationReport;
} {
  const report = evaluateScenarioManifest();

  const lines: string[] = [
    '# Allel Revenue Recovery: Scenario Evaluation Report',
    '',
    `> Date: ${new Date().toISOString()}`,
    `> Total Scenarios: ${report.totalScenarios}`,
    `> Precision: ${(report.precision * 100).toFixed(1)}%`,
    `> Recall: ${(report.recall * 100).toFixed(1)}%`,
    `> Healthy Suppression Rate: ${(report.healthySuppressionRate * 100).toFixed(1)}%`,
    '',
    '| Scenario ID | Account Name | Expected Severity | Computed Severity | Expected Action | Computed Action | Result |',
    '|---|---|---|---|---|---|---|',
  ];

  for (const s of report.scenarioResults) {
    lines.push(
      `| ${s.scenarioId} | ${s.accountName} | ${s.expectedSeverity} | ${s.computedSeverity} | ${s.expectedAction} | ${s.actionType} | ${s.passed ? 'PASS' : 'FAIL'} |`
    );
  }

  return {
    markdownTable: lines.join('\n'),
    report,
  };
}
