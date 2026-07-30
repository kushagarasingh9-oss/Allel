'use client'

import { useEffect, useState } from 'react'
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Loader2,
  MessageSquare,
  RefreshCw,
  Webhook,
  Zap,
  Search,
  Database,
  Mail,
  CreditCard,
  Calendar,
} from 'lucide-react'

type WorkflowRunStage = {
  id: string
  createdAt: string
  runType: string
  stage: string
  status: string
  customerAccountId: string | null
  inputSummary: string | null
  outputSummary: string | null
  error: string | null
  durationMs: number | null
  modelUsed: string | null
  tokensUsed: number | null
  costCents: number | null
  personaId: string | null
  provider: string | null
  jobIndex: number | null
  parentRunId: string | null
  retryCount: number | null
  errorCount: number | null
  metadata: Record<string, unknown>
}

type WorkflowRunInspection = {
  workflowId: string
  runType: string
  status: 'completed' | 'failed' | 'running'
  startedAt: string
  finishedAt: string
  customerAccountIds: string[]
  stages: WorkflowRunStage[]
  stageNames: string[]
  providers: string[]
  personas: string[]
  summary: string
  hasFailures: boolean
}

// ─── Helpers ──────────────────────────────────────────────────

function formatDateTime(value: string) {
  return new Date(value).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function formatRelativeTime(value: string) {
  const diff = Date.now() - new Date(value).getTime()
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'yesterday'
  return `${days}d ago`
}

function formatDuration(durationMs: number | null) {
  if (!durationMs || durationMs < 1000) return durationMs ? `${durationMs}ms` : '—'
  return `${(durationMs / 1000).toFixed(1)}s`
}

const RUN_TYPE_LABELS: Record<string, string> = {
  chat_message: 'Chat',
  daily_review: 'Daily Review',
  webhook_followup: 'Webhook Follow-up',
  integration_synced: 'Integration Sync',
  brief_refresh: 'Brief Refresh',
  draft_action: 'Draft Action',
  manual_sync: 'Manual Sync',
}

const STAGE_LABELS: Record<string, string> = {
  detect: 'Detect',
  analyze: 'Analyze',
  draft: 'Draft',
  verify: 'Verify',
  ingest: 'Ingest',
  sync: 'Sync',
  brief_refresh: 'Brief',
  follow_up: 'Follow-up',
}

function humanizeRunType(runType: string) {
  return RUN_TYPE_LABELS[runType] ?? runType.replace(/_/g, ' ')
}

function humanizeStage(stage: string) {
  return STAGE_LABELS[stage] ?? stage.replace(/_/g, ' ')
}

function getRunTypeIcon(runType: string) {
  switch (runType) {
    case 'chat_message':
      return MessageSquare
    case 'webhook_followup':
      return Webhook
    case 'integration_synced':
    case 'manual_sync':
      return RefreshCw
    default:
      return Zap
  }
}

function getStatusIcon(status: string) {
  switch (status) {
    case 'failed':
      return <AlertCircle className="w-3.5 h-3.5 text-red-400" />
    case 'running':
      return <Loader2 className="w-3.5 h-3.5 text-amber-400 animate-spin" />
    default:
      return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
  }
}

function statusClasses(status: string) {
  if (status === 'failed') return 'border-red-500/30 bg-red-500/10 text-red-200'
  if (status === 'running') return 'border-amber-500/30 bg-amber-500/10 text-amber-200'
  return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
}

function statusDotColor(status: string) {
  if (status === 'failed') return 'bg-red-400'
  if (status === 'running') return 'bg-amber-400'
  return 'bg-emerald-400'
}

// ─── Stage Detail Expandable & Timeline Helpers ────────────────

type StepDetail = {
  stepNumber: number
  finishReason: string
  toolNames: string[]
  textPreview?: string
}

function humanizeToolName(name: string) {
  const labels: Record<string, string> = {
    getAccountDetails: "Looking up account details",
    getAllAccounts: "Fetching all accounts",
    getRecentSignals: "Checking recent signals",
    getExistingDrafts: "Checking existing drafts",
    getStripeAccountState: "Querying Stripe billing state",
    getPostHogAccountUsage: "Querying PostHog usage data",
    getGmailThreadsForAccount: "Searching Gmail threads",
    getMyInbox: "Reading your inbox",
    generateFollowUpDraft: "Generating email draft",
    createSignal: "Recording signal",
    updateAccountRisk: "Updating risk assessment",
    addTimelineEvent: "Logging timeline event",
    createBriefItem: "Adding brief item",
    updateBriefSummary: "Updating brief summary",
    resolveAccountByContact: "Resolving account from contact",
    syncStripeWorkspaceTool: "Syncing Stripe data",
    syncPostHogWorkspaceTool: "Syncing PostHog data",
    syncGmailWorkspaceTool: "Syncing Gmail data",
    syncIntercomWorkspaceTool: "Syncing Intercom data",
    syncHubSpotWorkspaceTool: "Syncing HubSpot data",
    syncSentryWorkspaceTool: "Syncing Sentry data",
    syncLinearWorkspaceTool: "Syncing Linear data",
    deliverSlackBriefTool: "Delivering brief to Slack",
    buildDailyBriefFromLiveState: "Building daily brief",
    createRescueDiscountTool: "Creating rescue discount",
  }
  return labels[name] ?? name.replace(/([A-Z])/g, ' $1').trim()
}

function getToolIconComponent(name: string) {
  switch (name) {
    case 'getAccountDetails':
    case 'getAllAccounts':
      return <Database className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
    case 'getRecentSignals':
    case 'createSignal':
    case 'updateAccountRisk':
      return <Zap className="w-3.5 h-3.5 text-amber-400 shrink-0" />
    case 'getExistingDrafts':
    case 'getGmailThreadsForAccount':
    case 'getMyInbox':
      return <Mail className="w-3.5 h-3.5 text-[#EA4335] shrink-0" />
    case 'generateFollowUpDraft':
      return <Mail className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
    case 'getStripeAccountState':
    case 'syncStripeWorkspaceTool':
    case 'createRescueDiscountTool':
      return <CreditCard className="w-3.5 h-3.5 text-[#635BFF] shrink-0" />
    case 'buildDailyBriefFromLiveState':
      return <Calendar className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
    default:
      return <Search className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
  }
}

function SummaryBlock({ title, value }: { title: string; value: string | null }) {
  if (!value) {
    return (
      <div className="rounded-lg bg-black/30 px-3 py-2.5">
        <p className="text-[10px] uppercase tracking-wide text-neutral-500 mb-1">{title}</p>
        <p className="text-xs text-neutral-500 italic">No {title.toLowerCase()} recorded</p>
      </div>
    )
  }

  const trimmed = value.trim()
  const isJson = (trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))
  let prettyValue = value

  if (isJson) {
    try {
      const parsed = JSON.parse(trimmed)
      prettyValue = JSON.stringify(parsed, null, 2)
    } catch {
      // Fallback
    }
  }

  return (
    <div className="rounded-lg bg-black/30 px-3.5 py-3 border border-white/5 hover:border-white/10 transition duration-300 flex flex-col h-full min-w-0">
      <p className="text-[10px] uppercase tracking-wider text-neutral-400 font-semibold mb-2">{title}</p>
      {isJson ? (
        <pre className="text-[11px] text-neutral-300 font-mono overflow-x-auto p-2.5 rounded bg-black/40 border border-white/5 whitespace-pre-wrap leading-relaxed max-h-60 flex-1 scrollbar-thin scrollbar-thumb-white/10">
          {prettyValue}
        </pre>
      ) : (
        <p className="text-xs text-neutral-300 whitespace-pre-wrap leading-relaxed flex-1">
          {prettyValue}
        </p>
      )}
    </div>
  )
}

function AgentTraceTimeline({ steps }: { steps: StepDetail[] }) {
  return (
    <div className="mt-4 space-y-3">
      <p className="text-[11px] uppercase tracking-wider text-neutral-400 font-semibold mb-2.5 flex items-center gap-1.5 pl-0.5">
        <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
        Agent Execution Steps ({steps.length})
      </p>
      <div className="relative pl-6 border-l border-white/5 space-y-5 ml-2.5">
        {steps.map((step) => {
          const hasTools = step.toolNames && step.toolNames.length > 0
          return (
            <div key={step.stepNumber} className="relative group/step">
              {/* Timeline node dot */}
              <span className="absolute -left-[32px] top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-[#121212] border border-white/10 text-[9px] font-mono text-neutral-500 group-hover/step:border-indigo-500/50 group-hover/step:text-indigo-400 transition duration-300 shadow-sm">
                {step.stepNumber}
              </span>
              
              <div className="space-y-1.5">
                {/* Step Header */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-semibold text-neutral-200 group-hover/step:text-white transition duration-300">
                    {hasTools ? 'Called Agent Tools' : 'Generated Direct Response'}
                  </span>
                  {step.finishReason && (
                    <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-neutral-800 border border-neutral-700 text-neutral-400">
                      {step.finishReason}
                    </span>
                  )}
                </div>

                {/* Monologue / Text Preview */}
                {step.textPreview && (
                  <div className="text-xs text-neutral-400 bg-white/[0.01] border-l-2 border-indigo-500/30 pl-3 py-1 font-sans italic leading-relaxed group-hover/step:border-indigo-500/50 group-hover/step:text-neutral-300 transition duration-300">
                    &ldquo;{step.textPreview.trim()}{step.textPreview.length >= 240 ? '...' : ''}&rdquo;
                  </div>
                )}

                {/* Tools details */}
                {hasTools && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {step.toolNames.map((tool) => (
                      <div
                        key={tool}
                        className="flex items-center gap-1.5 text-[11px] font-mono px-2 py-1 rounded bg-[#0d0d0d] border border-white/5 text-neutral-300 hover:border-indigo-500/20 hover:text-white transition duration-300"
                      >
                        {getToolIconComponent(tool)}
                        <span>{humanizeToolName(tool)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Stage Detail Expandable ──────────────────────────────────

function StageCard({ stage }: { stage: WorkflowRunStage }) {
  const [isExpanded, setIsExpanded] = useState(stage.status === 'failed')

  const hasError = stage.status === 'failed' && stage.error
  const hasMetadata = stage.metadata && Object.keys(stage.metadata).length > 0
  const steps = (stage.metadata?.steps as StepDetail[] | undefined) ?? []
  const toolNames = (stage.metadata?.toolNames as string[] | undefined) ?? []

  return (
    <article className="rounded-xl border border-white/10 bg-white/[0.02] overflow-hidden hover:border-white/15 transition-all duration-300">
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/[0.03] transition-all duration-300 group"
      >
        {isExpanded ? (
          <ChevronDown className="w-3.5 h-3.5 text-neutral-500 shrink-0 group-hover:text-neutral-300 transition-colors" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-neutral-500 shrink-0 group-hover:text-neutral-300 transition-colors" />
        )}

        <div className="flex-1 flex items-center gap-3 min-w-0">
          {getStatusIcon(stage.status)}
          <span className="text-sm font-medium text-white group-hover:text-neutral-200 transition-colors">
            {humanizeStage(stage.stage)}
          </span>
          {stage.personaId && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-400 uppercase tracking-wide font-medium">
              {stage.personaId}
            </span>
          )}
          {stage.provider && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-400 uppercase tracking-wide font-medium">
              {stage.provider}
            </span>
          )}
        </div>

        <div className="flex items-center gap-4 text-xs text-neutral-500 shrink-0">
          {stage.durationMs != null && (
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3 text-neutral-600" />
              {formatDuration(stage.durationMs)}
            </span>
          )}
          {stage.tokensUsed != null && stage.tokensUsed > 0 && (
            <span className="text-neutral-600 font-medium">{stage.tokensUsed.toLocaleString()} tokens</span>
          )}
        </div>
      </button>

      {isExpanded && (
        <div className="px-4 pb-4 space-y-4 border-t border-white/5 animate-fade-in">
          {/* Error banner */}
          {hasError && (
            <div className="mt-3 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2.5">
              <p className="text-[11px] uppercase tracking-wide text-red-400 mb-1 font-semibold">Error</p>
              <p className="text-sm text-red-200 font-mono whitespace-pre-wrap">{stage.error}</p>
            </div>
          )}

          {/* Input/Output Row */}
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <SummaryBlock title="Input" value={stage.inputSummary} />
            <SummaryBlock title="Output" value={stage.outputSummary} />
          </div>

          {/* Visual Step-by-Step Decision Trace */}
          {steps.length > 0 && (
            <AgentTraceTimeline steps={steps} />
          )}

          {/* Legacy tool list if timeline steps aren't present */}
          {steps.length === 0 && toolNames.length > 0 && (
            <div className="pt-2">
              <p className="text-[10px] uppercase tracking-wide text-neutral-500 mb-1.5 font-semibold">Tools used</p>
              <div className="flex flex-wrap gap-1.5">
                {toolNames.map((name: string) => (
                  <span
                    key={name}
                    className="text-[11px] px-2 py-1 rounded-md bg-neutral-900 border border-neutral-800 text-neutral-300 font-mono flex items-center gap-1.5 hover:border-indigo-500/20 transition duration-300"
                  >
                    {getToolIconComponent(name)}
                    {name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Raw Metadata details */}
          {hasMetadata && (
            <details className="text-xs text-neutral-500 group/meta">
              <summary className="cursor-pointer hover:text-neutral-300 transition text-[10px] uppercase tracking-wide font-semibold outline-none select-none">
                Raw metadata
              </summary>
              <pre className="mt-2 text-[11px] text-neutral-500 font-mono overflow-x-auto p-2.5 rounded bg-black/30 border border-white/5 max-h-60 scrollbar-thin scrollbar-thumb-white/10">
                {JSON.stringify(stage.metadata, null, 2)}
              </pre>
            </details>
          )}

          {/* Footer stats row */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-neutral-500 pt-3 border-t border-white/5 mt-4">
            {stage.modelUsed && (
              <span className="flex items-center gap-1 bg-neutral-900 border border-white/5 px-2 py-0.5 rounded text-neutral-400">
                <span className="font-sans font-semibold text-neutral-500">Model:</span>
                <span className="font-mono text-[10px]">{stage.modelUsed}</span>
              </span>
            )}
            {stage.costCents != null && (
              <span className="flex items-center gap-1 bg-neutral-900 border border-white/5 px-2 py-0.5 rounded text-neutral-400">
                <span className="font-sans font-semibold text-neutral-500">Cost:</span>
                <span className="font-semibold text-emerald-400">{(stage.costCents).toFixed(3)}¢</span>
              </span>
            )}
            {stage.errorCount != null && stage.errorCount > 0 && (
              <span className="flex items-center gap-1 bg-red-950/20 border border-red-500/10 px-2 py-0.5 rounded text-red-400 font-medium">
                <span className="font-sans font-semibold text-red-500/80">Errors:</span>
                <span className="font-bold">{stage.errorCount}</span>
              </span>
            )}
            {stage.retryCount != null && stage.retryCount > 0 && (
              <span className="flex items-center gap-1 bg-amber-950/20 border border-amber-500/10 px-2 py-0.5 rounded text-amber-400 font-medium">
                <span className="font-sans font-semibold text-amber-500/80">Retries:</span>
                <span className="font-bold">{stage.retryCount}</span>
              </span>
            )}
            <span className="ml-auto text-neutral-600 font-mono text-[10px]">ID: {stage.id.slice(0, 8)}</span>
          </div>
        </div>
      )}
    </article>
  )
}

// ─── Stage Pipeline Visualization ─────────────────────────────

function StagePipeline({ stages }: { stages: WorkflowRunStage[] }) {
  if (stages.length === 0) return null

  return (
    <div className="flex items-center gap-1 overflow-x-auto pb-1">
      {stages.map((stage, index) => (
        <div key={stage.id} className="flex items-center">
          <div
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-medium ${statusClasses(stage.status)}`}
          >
            <div className={`w-1.5 h-1.5 rounded-full ${statusDotColor(stage.status)}`} />
            {humanizeStage(stage.stage)}
          </div>
          {index < stages.length - 1 && (
            <div className="w-4 h-px bg-neutral-700 mx-0.5" />
          )}
        </div>
      ))}
    </div>
  )
}

// ─── Workflow List Card ───────────────────────────────────────

function WorkflowCard({
  workflow,
  isSelected,
  onSelect,
}: {
  workflow: WorkflowRunInspection
  isSelected: boolean
  onSelect: () => void
}) {
  const Icon = getRunTypeIcon(workflow.runType)

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full rounded-xl border px-4 py-3.5 text-left transition ${
        isSelected
          ? 'border-white/25 bg-white/[0.08]'
          : 'border-white/8 bg-white/[0.02] hover:bg-white/[0.05] hover:border-white/15'
      }`}
    >
      <div className="flex items-center gap-3 mb-2">
        <div className={`p-1.5 rounded-lg ${
          workflow.status === 'failed' ? 'bg-red-500/15' :
          workflow.status === 'running' ? 'bg-amber-500/15' :
          'bg-emerald-500/15'
        }`}>
          <Icon className={`w-3.5 h-3.5 ${
            workflow.status === 'failed' ? 'text-red-400' :
            workflow.status === 'running' ? 'text-amber-400' :
            'text-emerald-400'
          }`} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-medium text-white truncate">
            {humanizeRunType(workflow.runType)}
          </p>
        </div>
        <span className="text-[11px] text-neutral-500 shrink-0">
          {formatRelativeTime(workflow.startedAt)}
        </span>
      </div>

      <p className="text-[12px] text-neutral-400 line-clamp-2 mb-2.5">
        {workflow.summary || 'No summary available'}
      </p>

      <div className="flex items-center gap-2 text-[10px] text-neutral-600">
        <span>{workflow.stages.length} stage{workflow.stages.length !== 1 ? 's' : ''}</span>
        <span>·</span>
        <span>{workflow.stageNames.map(humanizeStage).join(' → ')}</span>
        {workflow.hasFailures && (
          <>
            <span>·</span>
            <span className="text-red-400">has failures</span>
          </>
        )}
      </div>
    </button>
  )
}

// ─── Main Component ───────────────────────────────────────────

export function FlowsPage() {
  const [workflows, setWorkflows] = useState<WorkflowRunInspection[]>([])
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(null)
  const [selectedWorkflow, setSelectedWorkflow] = useState<WorkflowRunInspection | null>(null)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingDetail, setIsLoadingDetail] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function loadInitial() {
      setIsLoading(true)
      setError(null)

      try {
        const response = await fetch('/api/agent/runs?limit=12', { cache: 'no-store' })
        if (!response.ok) throw new Error('Failed to load run history')

        const payload = (await response.json()) as {
          workflows: WorkflowRunInspection[]
          nextCursor: string | null
        }

        setWorkflows(payload.workflows)
        setNextCursor(payload.nextCursor)
        setSelectedWorkflowId(payload.workflows[0]?.workflowId ?? null)
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Failed to load run history')
      } finally {
        setIsLoading(false)
      }
    }

    void loadInitial()
  }, [])

  useEffect(() => {
    if (!selectedWorkflowId) {
      setSelectedWorkflow(null)
      return
    }

    async function loadDetail() {
      setIsLoadingDetail(true)

      try {
        const response = await fetch(`/api/agent/runs/${selectedWorkflowId}`, {
          cache: 'no-store',
        })
        if (!response.ok) throw new Error('Failed to load workflow details')

        const payload = (await response.json()) as { workflow: WorkflowRunInspection }
        setSelectedWorkflow(payload.workflow)
      } catch (detailError) {
        setError(
          detailError instanceof Error
            ? detailError.message
            : 'Failed to load workflow details'
        )
      } finally {
        setIsLoadingDetail(false)
      }
    }

    void loadDetail()
  }, [selectedWorkflowId])

  async function loadMore() {
    if (!nextCursor) return

    const response = await fetch(`/api/agent/runs?limit=12&cursor=${encodeURIComponent(nextCursor)}`, {
      cache: 'no-store',
    })
    if (!response.ok) {
      setError('Failed to load more workflows')
      return
    }

    const payload = (await response.json()) as {
      workflows: WorkflowRunInspection[]
      nextCursor: string | null
    }
    setWorkflows((current) => [...current, ...payload.workflows])
    setNextCursor(payload.nextCursor)
  }

  // Aggregate stats for the header
  const completedCount = workflows.filter(w => w.status === 'completed').length
  const failedCount = workflows.filter(w => w.status === 'failed').length
  const totalStages = workflows.reduce((sum, w) => sum + w.stages.length, 0)

  return (
    <div className="min-h-screen bg-[#0a0a0a] px-6 py-8 text-white">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-2">
            <p className="text-xs uppercase tracking-[0.24em] text-neutral-500">Workflow History</p>
            <h1 className="text-3xl font-semibold text-white">Flows</h1>
            <p className="max-w-2xl text-sm text-neutral-400">
              Inspect ingestion, analysis, drafting, and verification runs. Click any stage to see inputs, outputs, tools, and errors.
            </p>
          </div>

          {!isLoading && workflows.length > 0 && (
            <div className="flex items-center gap-4 mt-6">
              <div className="flex items-center gap-1.5 text-xs text-emerald-400">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>{completedCount} completed</span>
              </div>
              {failedCount > 0 && (
                <div className="flex items-center gap-1.5 text-xs text-red-400">
                  <AlertCircle className="w-3.5 h-3.5" />
                  <span>{failedCount} failed</span>
                </div>
              )}
              <span className="text-xs text-neutral-600">{totalStages} total stages</span>
            </div>
          )}
        </div>

        {error && (
          <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-100 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
            {error}
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
          {/* Left: Workflow list */}
          <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-medium text-neutral-200">Recent workflows</h2>
              <span className="text-[11px] text-neutral-600">{workflows.length} loaded</span>
            </div>

            <div className="space-y-2">
              {isLoading ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="w-4 h-4 text-neutral-500 animate-spin" />
                  <span className="ml-2 text-sm text-neutral-500">Loading workflows…</span>
                </div>
              ) : workflows.length === 0 ? (
                <div className="rounded-xl border border-dashed border-white/10 px-4 py-8 text-center">
                  <Zap className="w-5 h-5 text-neutral-600 mx-auto mb-2" />
                  <p className="text-sm text-neutral-400">No workflows recorded yet.</p>
                  <p className="text-xs text-neutral-600 mt-1">
                    Workflows appear after chat messages, syncs, or daily reviews.
                  </p>
                </div>
              ) : (
                workflows.map((workflow) => (
                  <WorkflowCard
                    key={workflow.workflowId}
                    workflow={workflow}
                    isSelected={selectedWorkflowId === workflow.workflowId}
                    onSelect={() => setSelectedWorkflowId(workflow.workflowId)}
                  />
                ))
              )}
            </div>

            {nextCursor && (
              <button
                type="button"
                onClick={() => void loadMore()}
                className="mt-4 w-full rounded-xl border border-white/10 px-4 py-2.5 text-[13px] text-neutral-300 transition hover:bg-white/[0.05]"
              >
                Load more workflows
              </button>
            )}
          </section>

          {/* Right: Workflow detail */}
          <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
            {!selectedWorkflowId ? (
              <div className="flex flex-col items-center justify-center py-16">
                <Zap className="w-6 h-6 text-neutral-700 mb-3" />
                <p className="text-sm text-neutral-500">Select a workflow to inspect</p>
              </div>
            ) : isLoadingDetail || !selectedWorkflow ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-4 h-4 text-neutral-500 animate-spin" />
                <span className="ml-2 text-sm text-neutral-500">Loading details…</span>
              </div>
            ) : (
              <div className="space-y-5">
                {/* Workflow header */}
                <div className="rounded-xl border border-white/10 bg-black/30 p-4 space-y-3">
                  <div className="flex items-center gap-3">
                    {getStatusIcon(selectedWorkflow.status)}
                    <span className="text-[15px] font-medium text-white">
                      {humanizeRunType(selectedWorkflow.runType)}
                    </span>
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${statusClasses(selectedWorkflow.status)}`}
                    >
                      {selectedWorkflow.status}
                    </span>
                  </div>

                  <p className="text-sm text-neutral-300">{selectedWorkflow.summary}</p>

                  {/* Stage pipeline visualization */}
                  <StagePipeline stages={selectedWorkflow.stages} />

                  <div className="flex flex-wrap gap-4 text-[11px] text-neutral-600 pt-1">
                    <span>Started: {formatDateTime(selectedWorkflow.startedAt)}</span>
                    <span>Finished: {formatDateTime(selectedWorkflow.finishedAt)}</span>
                    {selectedWorkflow.personas.length > 0 && (
                      <span>Personas: {selectedWorkflow.personas.join(', ')}</span>
                    )}
                    {selectedWorkflow.providers.length > 0 && (
                      <span>Providers: {selectedWorkflow.providers.join(', ')}</span>
                    )}
                    <span className="font-mono">ID: {selectedWorkflow.workflowId.slice(0, 12)}</span>
                  </div>
                </div>

                {/* Expandable stage cards */}
                <div className="space-y-2">
                  <h3 className="text-[11px] uppercase tracking-wide text-neutral-500 mb-2">
                    Stages ({selectedWorkflow.stages.length})
                  </h3>
                  {selectedWorkflow.stages.map((stage) => (
                    <StageCard key={stage.id} stage={stage} />
                  ))}
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}
