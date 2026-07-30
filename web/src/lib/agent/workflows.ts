import { runAgent, type AgentToolName } from './agent'
import { logAgentRun, type AgentRunLogRecord } from './run-logger'
import type { PersonaId } from './personas'

export type WorkflowRunType =
  | 'daily_review'
  | 'stripe_webhook'
  | 'posthog_webhook'
type WorkflowStatus = NonNullable<AgentRunLogRecord['status']>

export type WorkflowAgentJob = {
  stage: string
  prompt: string
  personaId?: PersonaId
  customerAccountId?: string | null
  metadata?: Record<string, unknown>
}

export type WorkflowAgentJobResult = {
  stage: string
  text: string
  steps: number
  durationMs: number
  tokensUsed: number
}

function uniqueToolNames(...groups: readonly (readonly AgentToolName[])[]) {
  return [...new Set(groups.flat())]
}

export const READ_ONLY_WORKFLOW_TOOLS = [
  'getAccountDetails',
  'getAccountMemory',
  'getAllAccounts',
  'getRecentSignals',
  'getExistingDrafts',
  'resolveAccountByContact',
  'getMyInbox',
  'getChurnScoreHistory',
  'getAccountTimeline',
  'searchSlack',
  'getSlackHistory',
  'searchPostHogPersons',
  'getPostHogEvents',
  'listPostHogInsights',
  'listPostHogCohorts',
  'getPostHogEventDefinitions',
  'listPostHogFeatureFlags',
  'getPostHogAccountUsage',
  'listIntercomConvos',
  'getIntercomConvo',
  'searchIntercomConvosTool',
  'searchIntercomContactsTool',
  'searchStripeCustomersTool',
  'getStripeCustomerDetail',
  'listStripeInvoicesTool',
  'getUpcomingStripeInvoice',
  'getStripeSubscriptionDetail',
  'getStripeBalanceTool',
  'listStripeDisputesTool',
  'getStripeAccountState',
  'listCalendarEventsTool',
  'getCalendarEventTool',
  'checkCalendarFreeBusy',
  'listCalendarsTool',
  'searchCalendarEventsTool',
  'searchNotionTool',
  'getNotionPageTool',
  'queryNotionDatabaseTool',
  'listNotionUsersTool',
  'searchHubSpotContactsTool',
  'getHubSpotContactTool',
  'searchHubSpotCompaniesTool',
  'getHubSpotCompanyTool',
  'searchHubSpotDealsTool',
  'listHubSpotOwnersTool',
  'listHubSpotPipelinesTool',
  'searchLinearIssuesTool',
  'getLinearIssueTool',
  'listLinearTeamsTool',
  'listLinearWorkflowStatesTool',
  'listLinearLabelsTool',
  'listLinearProjectsTool',
  'listLinearUsersTool',
  'listSentryIssuesTool',
  'getSentryIssueTool',
  'getSentryLatestEventTool',
  'listSentryProjectsTool',
  'listSentryReleasesTool',
  'listSentryIssueTagsTool',
  'listAirtableBasesTool',
  'listAirtableTablesTool',
  'listAirtableRecordsTool',
  'getAirtableRecordTool',
  'getGmailThreadsForAccount',
  'webSearchTool',
  'webExtractTool',
  'webCrawlTool',
  'webMapTool',
] as const satisfies readonly AgentToolName[]

export const ANALYZE_WRITE_WORKFLOW_TOOLS = [
  'updateAccountRisk',
  'createSignal',
  'resolveSignal',
  'addTimelineEvent',
  'updateAccountInfo',
  'addAccountNote',
  'addAccountContact',
  'updateAccountContact',
] as const satisfies readonly AgentToolName[]

export const DRAFT_WRITE_WORKFLOW_TOOLS = [
  'generateFollowUpDraft',
  'rejectDraft',
  'updateDraftContent',
] as const satisfies readonly AgentToolName[]

export const WORKFLOW_STAGE_TOOL_ALLOWLISTS = {
  detect: READ_ONLY_WORKFLOW_TOOLS,
  analyze: uniqueToolNames(READ_ONLY_WORKFLOW_TOOLS, ANALYZE_WRITE_WORKFLOW_TOOLS),
  draft: uniqueToolNames(READ_ONLY_WORKFLOW_TOOLS, DRAFT_WRITE_WORKFLOW_TOOLS),
  verify: READ_ONLY_WORKFLOW_TOOLS,
} as const satisfies Record<string, readonly AgentToolName[]>

export function getWorkflowStageAllowedTools(stage: string) {
  return WORKFLOW_STAGE_TOOL_ALLOWLISTS[
    stage as keyof typeof WORKFLOW_STAGE_TOOL_ALLOWLISTS
  ]
}

export async function logWorkflowStage(input: {
  workspaceId: string
  workflowId: string
  runType: WorkflowRunType
  stage: string
  status?: WorkflowStatus
  customerAccountId?: string | null
  inputSummary?: string | null
  outputSummary?: string | null
  error?: string | null
  durationMs?: number | null
  personaId?: string | null
  provider?: string | null
  jobIndex?: number | null
  metadata?: Record<string, unknown>
}) {
  await logAgentRun({
    workspaceId: input.workspaceId,
    runType: input.runType,
    status: input.status ?? 'completed',
    customerAccountId: input.customerAccountId ?? null,
    inputSummary: input.inputSummary ?? null,
    outputSummary: input.outputSummary ?? null,
    error: input.error ?? null,
    durationMs: input.durationMs ?? null,
    workflowId: input.workflowId,
    stage: input.stage,
    personaId: input.personaId ?? null,
    provider: input.provider ?? null,
    jobIndex: input.jobIndex ?? null,
    metadata: input.metadata ?? {},
  })
}

export async function logIntegrationSyncOutcome(input: {
  workspaceId: string
  workflowId: string
  workflowRunType: WorkflowRunType
  provider: string
  status: 'completed' | 'failed'
  inputSummary?: string | null
  outputSummary?: string | null
  error?: string | null
  durationMs?: number | null
  metadata?: Record<string, unknown>
}) {
  await logAgentRun({
    workspaceId: input.workspaceId,
    runType: input.status === 'completed' ? 'integration_synced' : 'sync_failed',
    status: input.status,
    inputSummary: input.inputSummary ?? null,
    outputSummary: input.outputSummary ?? null,
    error: input.error ?? null,
    durationMs: input.durationMs ?? null,
    workflowId: input.workflowId,
    stage: 'provider_sync',
    provider: input.provider,
    metadata: {
      workflowRunType: input.workflowRunType,
      ...(input.metadata ?? {}),
    },
  })
}

function formatSyncSummary(syncSummary?: Record<string, string>) {
  if (!syncSummary || Object.keys(syncSummary).length === 0) {
    return 'No provider sync summary was attached.'
  }

  return Object.entries(syncSummary)
    .map(([provider, summary]) => `- ${provider}: ${summary}`)
    .join('\n')
}

export async function runWorkflowAgentJobs(input: {
  workspaceId: string
  workflowId: string
  runType: WorkflowRunType
  jobs: WorkflowAgentJob[]
  defaultPersonaId?: PersonaId
  customerAccountId?: string | null
  sharedMetadata?: Record<string, unknown>
}) {
  const results: WorkflowAgentJobResult[] = []

  for (const [index, job] of input.jobs.entries()) {
    const allowedToolNames = getWorkflowStageAllowedTools(job.stage)
    const jobStartedAt = Date.now()

    try {
      const result = await runAgent(input.workspaceId, job.prompt, {
        personaId: job.personaId ?? input.defaultPersonaId ?? 'alex',
        runType: input.runType,
        customerAccountId: job.customerAccountId ?? input.customerAccountId ?? null,
        allowedToolNames,
        metadata: {
          workflowId: input.workflowId,
          stage: job.stage,
          jobIndex: index + 1,
          jobCount: input.jobs.length,
          ...(input.sharedMetadata ?? {}),
          ...(job.metadata ?? {}),
        },
      })

      results.push({
        stage: job.stage,
        ...result,
      })
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown workflow job error'

      console.error(
        `[workflow] Stage "${job.stage}" failed for workflow ${input.workflowId}:`,
        errorMessage
      )

      await logWorkflowStage({
        workspaceId: input.workspaceId,
        workflowId: input.workflowId,
        runType: input.runType,
        stage: job.stage,
        status: 'failed',
        inputSummary: job.prompt.slice(0, 500),
        error: errorMessage,
        durationMs: Date.now() - jobStartedAt,
        personaId: job.personaId ?? input.defaultPersonaId ?? null,
        jobIndex: index + 1,
        metadata: {
          jobCount: input.jobs.length,
          ...(input.sharedMetadata ?? {}),
          ...(job.metadata ?? {}),
        },
      }).catch((logError) => {
        console.error('[workflow] Failed to log stage failure:', logError)
      })

      results.push({
        stage: job.stage,
        text: `[ERROR] ${errorMessage}`,
        steps: 0,
        durationMs: Date.now() - jobStartedAt,
        tokensUsed: 0,
      })
    }
  }

  return results
}

export function buildDailyReviewJobs(options: {
  accountCount: number
  syncSummary?: Record<string, string>
}) {
  const syncContext = formatSyncSummary(options.syncSummary)

  return [
    {
      stage: 'detect',
      prompt: `
Daily review detect phase for this workspace.

Your job in this phase:
1. Survey the full book of business using read tools first.
2. Identify the accounts that most need attention today.
3. Gather evidence for risk shifts, support friction, billing issues, usage drops, or communication gaps.
4. Do NOT write to the database in this phase unless a missing factual context item makes later analysis impossible.

There are ${options.accountCount} accounts in this workspace.
Provider sync summary:
${syncContext}
      `.trim(),
    },
    {
      stage: 'analyze',
      prompt: `
Daily review analyze phase for this workspace.

Your job in this phase:
1. Re-check the highest-priority accounts from the detect phase.
2. Update account risk, create durable signals, and add timeline context only when the evidence is concrete.
3. Do NOT create drafts yet.
4. Do NOT create or update founder brief entries directly.
      `.trim(),
    },
    {
      stage: 'draft',
      prompt: `
Daily review draft phase for this workspace.

Your job in this phase:
1. Check existing drafts so you do not create duplicates.
2. For accounts that now warrant founder outreach, generate a follow-up draft.
3. Keep draft creation tightly scoped to the accounts that clearly need action.
4. Do NOT update the founder brief directly.
      `.trim(),
    },
    {
      stage: 'verify',
      prompt: `
Daily review verify phase for this workspace.

Your job in this phase:
1. Review the final state after analysis and draft generation.
2. Summarize what changed, which accounts moved, and whether any follow-up drafts were created.
3. Prefer read tools in this phase. Only write if you discover a concrete correction that must be fixed immediately.
4. Do NOT update the founder brief directly.
      `.trim(),
    },
  ] satisfies WorkflowAgentJob[]
}

export function buildStripeWebhookFollowUpPrompt(
  eventType: string,
  email: string | null
) {
  return `A Stripe webhook just fired: "${eventType}".${email ? ` Customer email: ${email}.` : ''}

Analyze this event:
1. Look up the affected account${email ? ' from the customer email if needed' : ''}.
2. Assess how this changes the account's risk level.
3. If the account is now at high risk and has no pending draft, generate a follow-up email.
4. Create durable account context only if it materially improves future action.
5. Do NOT update the founder brief directly.`
}

export function buildPostHogWebhookFollowUpPrompt(eventDescription: string) {
  return `A PostHog event was detected: "${eventDescription}".

Analyze this event:
1. Identify the affected account.
2. Assess whether this changes churn or renewal risk.
3. Create or update durable account context only if it materially improves future action.
4. Do NOT update the founder brief directly.`
}

export function buildStripeWebhookJobs(eventType: string, email: string | null) {
  return [
    {
      stage: 'detect',
      prompt: `
Stripe webhook detect phase.

Event: "${eventType}".${email ? ` Customer email: ${email}.` : ''}

Your job in this phase:
1. Identify the affected account.
2. Inspect billing, timeline, and current risk context.
3. Prefer read tools in this phase.
      `.trim(),
    },
    {
      stage: 'analyze',
      prompt: `
${buildStripeWebhookFollowUpPrompt(eventType, email)}

This is the analyze phase. Update risk and durable account context if needed, but do NOT generate a draft yet.
      `.trim(),
    },
    {
      stage: 'draft',
      prompt: `
Stripe webhook draft phase for "${eventType}".

If the account now needs direct founder outreach:
1. Check existing drafts first.
2. Generate exactly one follow-up draft if justified.
3. Skip draft generation if a pending draft already covers the situation.
      `.trim(),
    },
    {
      stage: 'verify',
      prompt: `
Stripe webhook verify phase for "${eventType}".

Review the final state, confirm whether risk changed, and summarize any draft action taken. Prefer read tools only.
      `.trim(),
    },
  ] satisfies WorkflowAgentJob[]
}

export function buildPostHogWebhookJobs(eventDescription: string) {
  return [
    {
      stage: 'detect',
      prompt: `
PostHog webhook detect phase.

Event description: "${eventDescription}".

Your job in this phase:
1. Identify the affected account.
2. Inspect recent usage, churn, and communication context.
3. Prefer read tools in this phase.
      `.trim(),
    },
    {
      stage: 'analyze',
      prompt: `
${buildPostHogWebhookFollowUpPrompt(eventDescription)}

This is the analyze phase. Update risk and durable account context if needed, but do NOT generate a draft yet.
      `.trim(),
    },
    {
      stage: 'draft',
      prompt: `
PostHog webhook draft phase for "${eventDescription}".

If the event materially raises churn risk:
1. Check existing drafts first.
2. Generate a follow-up draft only if no pending draft already covers the situation.
      `.trim(),
    },
    {
      stage: 'verify',
      prompt: `
PostHog webhook verify phase for "${eventDescription}".

Review the final state, confirm any risk changes, and summarize whether follow-up action is now queued. Prefer read tools only.
      `.trim(),
    },
  ] satisfies WorkflowAgentJob[]
}
