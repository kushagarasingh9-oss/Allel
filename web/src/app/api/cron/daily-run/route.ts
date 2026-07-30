/**
 * Daily Agent Run (Cron)
 *
 * GET /api/cron/daily-run
 * Triggers the Cofounder agent to review all accounts, analyze risk,
 * generate drafts for at-risk accounts, and assemble the daily brief.
 *
 * Schedule: Daily at 4:00 AM via Vercel Cron or external scheduler.
 */

import { randomUUID } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { isAgentConfigured } from '@/lib/agent/agent'
import {
  enqueueRecentlyTouchedAccountMemories,
  processQueuedAccountMemoryRefreshes,
} from '@/lib/agent/account-memory'
import {
  buildDailyReviewJobs,
  logIntegrationSyncOutcome,
  logWorkflowStage,
  runWorkflowAgentJobs,
} from '@/lib/agent/workflows'
import { generateWorkspaceBrief } from '@/lib/briefs/generate-workspace-brief'
import { deliverBriefEmail } from '@/lib/briefs/deliver-brief-email'
import { measurePendingOutcomes } from '@/lib/drafts/outcome-tracker'
import {
  markIntegrationSyncFailed,
  markIntegrationSyncSucceeded,
} from '@/lib/integrations/connection-state'
import { syncGmailWorkspace } from '@/lib/integrations/gmail-sync'
import { syncHubSpotWorkspace } from '@/lib/integrations/hubspot-sync'
import { syncIntercomWorkspace } from '@/lib/integrations/intercom-sync'
import { syncLinearWorkspace } from '@/lib/integrations/linear-sync'
import { syncPostHogWorkspace } from '@/lib/integrations/posthog-sync'
import { syncSentryWorkspace } from '@/lib/integrations/sentry-sync'
import { syncSlackWorkspace } from '@/lib/integrations/slack-sync'
import { syncStripeWorkspace } from '@/lib/integrations/stripe-sync'
import { checkRateLimit, rateLimitResponse } from '@/lib/security/rate-limiter'

type SyncSummary = {
  stripe?: string
  posthog?: string
  gmail?: string
  intercom?: string
  hubspot?: string
  sentry?: string
  linear?: string
  brief?: string
  slack?: string
}

type DailyRunResult = {
  workspace: string
  synced?: SyncSummary
  result: {
    text: string
    steps: number
    durationMs: number
    tokensUsed: number
  } | null
  error: string | null
}

type IntegrationRow = {
  provider: string
  status: string
}

type SyncDefinition = {
  provider: keyof SyncSummary
  label: string
  sync: (workspaceId: string) => Promise<unknown>
  summarize: (result: unknown) => string
}

const PROVIDER_SYNC_DEFINITIONS: SyncDefinition[] = [
  {
    provider: 'stripe',
    label: 'Stripe',
    sync: syncStripeWorkspace,
    summarize: (result) =>
      `${(result as { syncedAccounts: number }).syncedAccounts} accounts`,
  },
  {
    provider: 'posthog',
    label: 'PostHog',
    sync: syncPostHogWorkspace,
    summarize: (result) =>
      `${(result as { trackedUsers: number }).trackedUsers} users`,
  },
  {
    provider: 'gmail',
    label: 'Gmail',
    sync: syncGmailWorkspace,
    summarize: (result) =>
      `${(result as { syncedThreads: number }).syncedThreads} threads`,
  },
  {
    provider: 'intercom',
    label: 'Intercom',
    sync: syncIntercomWorkspace,
    summarize: (result) =>
      `${(result as { openConversations: number }).openConversations} open conversations`,
  },
  {
    provider: 'hubspot',
    label: 'HubSpot',
    sync: syncHubSpotWorkspace,
    summarize: (result) =>
      `${(result as { syncedAccounts: number }).syncedAccounts} companies`,
  },
  {
    provider: 'sentry',
    label: 'Sentry',
    sync: syncSentryWorkspace,
    summarize: (result) =>
      `${(result as { openIssues: number }).openIssues} open issues`,
  },
  {
    provider: 'linear',
    label: 'Linear',
    sync: syncLinearWorkspace,
    summarize: (result) =>
      `${(result as { openIssues: number }).openIssues} open issues`,
  },
]

function hasConnectedIntegration(
  integrations: IntegrationRow[] | null | undefined,
  provider: string
) {
  return integrations?.some(
    (integration) =>
      integration.provider === provider && integration.status === 'connected'
  )
}

async function runProviderSync(input: {
  supabase: ReturnType<typeof createServiceClient>
  workspaceId: string
  workflowId: string
  syncSummary: SyncSummary
  definition: SyncDefinition
}) {
  const { supabase, workspaceId, workflowId, syncSummary, definition } = input
  const startedAt = Date.now()

  try {
    const result = await definition.sync(workspaceId)
    const summary = definition.summarize(result)

    syncSummary[definition.provider] = summary
    await markIntegrationSyncSucceeded({
      supabase,
      workspaceId,
      provider: definition.provider,
      trigger: 'daily_cron',
    })

    await logIntegrationSyncOutcome({
      workspaceId,
      workflowId,
      workflowRunType: 'daily_review',
      provider: definition.provider,
      status: 'completed',
      inputSummary: `Daily provider sync for ${definition.label}`,
      outputSummary: `${definition.label} sync completed: ${summary}`,
      durationMs: Date.now() - startedAt,
      metadata: {
        providerLabel: definition.label,
        summary,
      },
    })
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown sync error'

    syncSummary[definition.provider] = `error: ${errorMessage}`
    await markIntegrationSyncFailed({
      supabase,
      workspaceId,
      provider: definition.provider,
      trigger: 'daily_cron',
      errorMessage,
    })

    await logIntegrationSyncOutcome({
      workspaceId,
      workflowId,
      workflowRunType: 'daily_review',
      provider: definition.provider,
      status: 'failed',
      inputSummary: `Daily provider sync for ${definition.label}`,
      outputSummary: `${definition.label} sync failed: ${errorMessage}`,
      error: errorMessage,
      durationMs: Date.now() - startedAt,
      metadata: {
        providerLabel: definition.label,
      },
    })
  }
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Rate limit: 2 requests per minute globally
  const rateLimit = checkRateLimit('cron:daily-run:global', {
    maxRequests: 2,
    windowMs: 60_000,
  })
  if (!rateLimit.allowed) {
    return rateLimitResponse(rateLimit.retryAfterMs)
  }

  const supabase = createServiceClient()
  const results: DailyRunResult[] = []

  try {
    const { data: workspaces, error } = await supabase
      .from('workspaces')
      .select('id, name')

    if (error) throw error
    if (!workspaces || workspaces.length === 0) {
      return NextResponse.json({
        message: 'No workspaces found',
        results: [],
      })
    }

    for (const workspace of workspaces) {
      const workflowId = randomUUID()

      try {
        const { data: integrations, error: integrationsError } = await supabase
          .from('integration_connections')
          .select('provider, status')
          .eq('workspace_id', workspace.id)

        if (integrationsError) throw integrationsError

        const syncSummary: SyncSummary = {}
        const syncWindowStartedAt = new Date().toISOString()

        for (const definition of PROVIDER_SYNC_DEFINITIONS) {
          if (!hasConnectedIntegration(integrations, definition.provider)) {
            continue
          }

          await runProviderSync({
            supabase,
            workspaceId: workspace.id,
            workflowId,
            syncSummary,
            definition,
          })
        }

        const { count: accountCount, error: accountCountError } = await supabase
          .from('customer_accounts')
          .select('id', { count: 'exact', head: true })
          .eq('workspace_id', workspace.id)

        if (accountCountError) throw accountCountError

        const normalizedAccountCount = accountCount ?? 0

        const memoryRefreshStartedAt = Date.now()
        const enqueueResult = await enqueueRecentlyTouchedAccountMemories(
          workspace.id,
          syncWindowStartedAt
        )
        const memoryRefreshResult = await processQueuedAccountMemoryRefreshes({
          workspaceId: workspace.id,
        })
        await logWorkflowStage({
          workspaceId: workspace.id,
          workflowId,
          runType: 'daily_review',
          stage: 'memory_refresh',
          inputSummary: `Refresh account memory for accounts touched since ${syncWindowStartedAt}`,
          outputSummary: `Processed ${memoryRefreshResult.processed} queued account memory refreshes${memoryRefreshResult.failed > 0 ? ` with ${memoryRefreshResult.failed} failures` : ''}`,
          durationMs: Date.now() - memoryRefreshStartedAt,
          metadata: {
            accountCount: normalizedAccountCount,
            enqueuedAccountCount: enqueueResult.enqueued,
            processedCount: memoryRefreshResult.processed,
            failedCount: memoryRefreshResult.failed,
            queueAvailable: memoryRefreshResult.queueAvailable,
          },
        })

        const result = isAgentConfigured()
          ? await runWorkflowAgentJobs({
              workspaceId: workspace.id,
              workflowId,
              runType: 'daily_review',
              defaultPersonaId: 'sarah',
              jobs: buildDailyReviewJobs({
                accountCount: normalizedAccountCount,
                syncSummary,
              }),
              sharedMetadata: {
                accountCount: normalizedAccountCount,
                syncSummary,
              },
            })
          : null

        if (!result) {
          await logWorkflowStage({
            workspaceId: workspace.id,
            workflowId,
            runType: 'daily_review',
            stage: 'agent_analysis',
            outputSummary: 'Skipped automated review because AI is not configured',
            metadata: {
              accountCount: normalizedAccountCount,
              skipped: true,
              syncSummary,
            },
          })
        }

        const summarizedResult =
          result && result.length > 0
            ? {
                text: result.map((job) => `[${job.stage}] ${job.text}`).join('\n\n'),
                steps: result.reduce((total, job) => total + job.steps, 0),
                durationMs: result.reduce((total, job) => total + job.durationMs, 0),
                tokensUsed: result.reduce((total, job) => total + job.tokensUsed, 0),
              }
            : null

        const briefStartedAt = Date.now()
        const briefResult = await generateWorkspaceBrief(workspace.id)
        syncSummary.brief = `${briefResult.itemCount} items`

        await logWorkflowStage({
          workspaceId: workspace.id,
          workflowId,
          runType: 'daily_review',
          stage: 'brief_refresh',
          inputSummary: 'Rebuild founder brief from live workspace state',
          outputSummary: `Generated founder brief with ${briefResult.itemCount} items`,
          durationMs: Date.now() - briefStartedAt,
          metadata: {
            briefId: briefResult.briefId,
            headline: briefResult.headline,
            itemCount: briefResult.itemCount,
          },
        })

        // --- Email delivery of the brief ---
        const emailStartedAt = Date.now()
        try {
          const emailResult = await deliverBriefEmail({
            workspaceId: workspace.id,
            briefId: briefResult.briefId,
            headline: briefResult.headline,
            summary: briefResult.summary,
            itemCount: briefResult.itemCount,
          })

          await logWorkflowStage({
            workspaceId: workspace.id,
            workflowId,
            runType: 'daily_review',
            stage: 'brief_email_delivery',
            status: emailResult.delivered ? 'completed' : 'completed',
            outputSummary: emailResult.delivered
              ? `Brief emailed to ${emailResult.recipientEmail}`
              : `Email delivery skipped: ${emailResult.error}`,
            durationMs: Date.now() - emailStartedAt,
            metadata: {
              method: emailResult.method,
              recipientEmail: emailResult.recipientEmail,
              delivered: emailResult.delivered,
            },
          })
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : 'Unknown email delivery error'

          await logWorkflowStage({
            workspaceId: workspace.id,
            workflowId,
            runType: 'daily_review',
            stage: 'brief_email_delivery',
            status: 'failed',
            outputSummary: `Brief email delivery failed: ${errorMessage}`,
            error: errorMessage,
            durationMs: Date.now() - emailStartedAt,
          })
        }

        if (hasConnectedIntegration(integrations, 'slack')) {
          const slackStartedAt = Date.now()

          try {
            const slackResult = await syncSlackWorkspace(workspace.id)
            syncSummary.slack = `${slackResult.itemCount} brief items delivered`

            await logWorkflowStage({
              workspaceId: workspace.id,
              workflowId,
              runType: 'daily_review',
              stage: 'brief_delivery',
              outputSummary: `Delivered ${slackResult.itemCount} brief items to Slack`,
              durationMs: Date.now() - slackStartedAt,
              metadata: {
                provider: 'slack',
                itemCount: slackResult.itemCount,
              },
            })
          } catch (error) {
            const errorMessage =
              error instanceof Error ? error.message : 'Unknown Slack delivery error'

            syncSummary.slack = `error: ${errorMessage}`

            await logWorkflowStage({
              workspaceId: workspace.id,
              workflowId,
              runType: 'daily_review',
              stage: 'brief_delivery',
              status: 'failed',
              outputSummary: `Slack brief delivery failed: ${errorMessage}`,
              error: errorMessage,
              durationMs: Date.now() - slackStartedAt,
              metadata: {
                provider: 'slack',
              },
            })
          }
        }

        // --- Measure draft outcomes (feedback loop) ---
        const outcomeStartedAt = Date.now()
        try {
          const outcomeResult = await measurePendingOutcomes(workspace.id)

          if (outcomeResult.measured > 0) {
            await logWorkflowStage({
              workspaceId: workspace.id,
              workflowId,
              runType: 'daily_review',
              stage: 'outcome_measurement',
              outputSummary: `Measured ${outcomeResult.measured} draft outcomes: ${outcomeResult.updated} updated, ${outcomeResult.errors} errors`,
              durationMs: Date.now() - outcomeStartedAt,
              metadata: {
                measured: outcomeResult.measured,
                updated: outcomeResult.updated,
                errors: outcomeResult.errors,
              },
            })
          }
        } catch (error) {
          console.error('[daily-run] Outcome measurement failed:', error)
        }

        results.push({
          workspace: workspace.name,
          synced: syncSummary,
          result: summarizedResult,
          error: null,
        })
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error'

        console.error(`[daily-run] Error for workspace ${workspace.name}:`, error)

        await logWorkflowStage({
          workspaceId: workspace.id,
          workflowId,
          runType: 'daily_review',
          stage: 'workflow_failed',
          status: 'failed',
          outputSummary: `Daily review workflow failed for ${workspace.name}`,
          error: errorMessage,
          metadata: {
            workspaceName: workspace.name,
          },
        })

        results.push({
          workspace: workspace.name,
          result: null,
          error: errorMessage,
        })
      }
    }

    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json({
        message: `Daily agent run complete for ${workspaces.length} workspace(s)`,
        workspaceCount: workspaces.length,
        errorCount: results.filter((result) => result.error).length,
      })
    }

    return NextResponse.json({
      message: `Daily agent run complete for ${workspaces.length} workspace(s)`,
      results,
    })
  } catch (error) {
    console.error('[daily-run] Fatal error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal error' },
      { status: 500 }
    )
  }
}
