import { SupabaseClient } from '@supabase/supabase-js';
import { generateObject } from 'ai';
import { getLanguageModel } from '../../ai/ai';
import { JobExecutionContext, JobExecutionResult } from '../types';
import { CaseAnalysisSchema } from '../../recovery/schemas';
import { CaseAnalysis } from '../../recovery/types';
import { transitionRecoveryCase } from '../../recovery/transitions';

export async function handleRunCaseAnalysis(
  supabase: SupabaseClient,
  context: JobExecutionContext
): Promise<JobExecutionResult> {
  const payload = context.job.payload;
  const workspaceId = context.workspaceId || payload.workspaceId;
  const recoveryCaseId = payload.recoveryCaseId || context.job.recoveryCaseId;

  if (!workspaceId || !recoveryCaseId) {
    throw new Error('run_case_analysis requires workspaceId and recoveryCaseId');
  }

  // 1. Fetch case details and account contact
  const { data: caseRow, error: caseError } = await supabase
    .from('recovery_cases')
    .select('*, customer_accounts(*)')
    .eq('id', recoveryCaseId)
    .single();

  if (caseError || !caseRow) {
    throw new Error(`Case ${recoveryCaseId} not found`);
  }

  // Transition case to 'analyzing'
  if (caseRow.status === 'open') {
    await transitionRecoveryCase(supabase, {
      workspaceId,
      caseId: recoveryCaseId,
      targetStatus: 'analyzing',
      actorType: 'worker',
      actorId: context.workerId,
      eventType: 'analysis_started',
      workflowJobId: context.job.id,
    });
  }

  const evidence = caseRow.evidence_snapshot || [];
  const primaryCause =
    caseRow.action_type === 'billing_recovery_email'
      ? 'billing'
      : caseRow.action_type === 'cancellation_rescue_email'
      ? 'cancellation_intent'
      : caseRow.action_type === 'compound_recovery_email'
      ? 'compound'
      : 'usage';

  let analysis: CaseAnalysis;

  try {
    const prompt = `Analyze this revenue retention risk case for account "${caseRow.customer_accounts?.name || 'Customer'}":
Case Severity: ${caseRow.severity}
Action Type: ${caseRow.action_type}
MRR Baseline: $${(caseRow.mrr_baseline_cents / 100).toFixed(2)}
Primary Cause: ${primaryCause}
Evidence Facts:
${evidence.map((e: any) => `- ID [${e.id}]: ${e.claim}`).join('\n')}

Provide a structured, customer-safe analysis following the schema. Cite ONLY the evidence IDs provided above.`;

    const result = await generateObject({
      model: getLanguageModel(),
      schema: CaseAnalysisSchema,
      prompt,
    });

    analysis = result.object;
  } catch (_err) {
    // Deterministic fallback if model call is unavailable
    analysis = {
      caseId: recoveryCaseId,
      primaryCause,
      summary: `Automated analysis for ${caseRow.action_type}: ${caseRow.action_reason}`,
      customerSafeReason: caseRow.action_reason,
      evidence: evidence.map((e: any) => ({ evidenceId: e.id, claim: e.claim })),
      uncertainty: [],
      recommendedTone: caseRow.severity === 'critical' ? 'urgent' : 'helpful',
      recommendedNextStep: 'Offer assistance and verify account status',
      prohibitedClaims: ['Do not mention internal risk scores or automated surveillance'],
    };
  }

  // 2. Update case root cause summary
  await supabase
    .from('recovery_cases')
    .update({
      root_cause_summary: analysis.summary,
      updated_at: new Date().toISOString(),
    })
    .eq('id', recoveryCaseId);

  // Transition case to 'action_proposed'
  await transitionRecoveryCase(supabase, {
    workspaceId,
    caseId: recoveryCaseId,
    targetStatus: 'action_proposed',
    actorType: 'agent',
    actorId: 'allel_analyzer',
    eventType: 'analysis_completed',
    workflowJobId: context.job.id,
    detail: { analysis },
  });

  // 3. Enqueue draft generation
  const draftIdempotencyKey = `ws:${workspaceId}:case:${recoveryCaseId}:draft:v1`;

  return {
    success: true,
    nextJob: {
      jobType: 'generate_case_draft',
      idempotencyKey: draftIdempotencyKey,
      workspaceId,
      recoveryCaseId,
      payload: {
        workspaceId,
        recoveryCaseId,
        customerAccountId: caseRow.customer_account_id,
        analysis,
        actionType: caseRow.action_type,
        recipientEmail: caseRow.customer_accounts?.contact_email,
      },
    },
  };
}
