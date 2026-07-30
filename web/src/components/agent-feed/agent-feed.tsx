"use client"

/**
 * AgentFeed — Renders real agent messages using the existing
 * timeline nodes and generative card components.
 *
 * Maps AI SDK v6 message parts → UI components:
 *   - TextUIPart       → AgentSpeechBlock
 *   - ReasoningUIPart  → MonologueBlock
 *   - ToolUIPart/DynamicToolUIPart (input-streaming/input-available) → TimelineNode loading
 *   - ToolUIPart/DynamicToolUIPart (output-available) → TimelineNode completed + result card
 *   - StepStartUIPart  → ignored (batching boundary)
 */

import * as React from "react"
import { useChatContext } from "./chat-provider"
import type { UIMessage } from "ai"
import {
  TimelineNode,
  AgentSpeechBlock,
  MonologueBlock,
  InlineQueryBlock,
  MiniResultCard,
  AgentReasoningBatch,
} from "./timeline-nodes"
import { Search, Loader2, Zap, Database, Mail, CreditCard, MessageSquare, Calendar } from "lucide-react"
import {
  SiIntercom,
  SiLinear,
  SiPosthog,
  SiStripe,
  SiSentry,
  SiHubspot,
  SiGmail
} from '@icons-pack/react-simple-icons'

// ─── Tool → Icon mapping ────────────────────────────────────────────
const TOOL_ICONS: Record<string, React.ReactNode> = {
  getAccountDetails: <Database className="w-3.5 h-3.5" />,
  getAllAccounts: <Database className="w-3.5 h-3.5" />,
  getRecentSignals: <Zap className="w-3.5 h-3.5" />,
  getExistingDrafts: <SiGmail className="w-3.5 h-3.5 text-[#EA4335]" />,
  getStripeAccountState: <SiStripe className="w-3.5 h-3.5 text-[#635BFF]" />,
  getPostHogAccountUsage: <SiPosthog className="w-3.5 h-3.5" />,
  getGmailThreadsForAccount: <SiGmail className="w-3.5 h-3.5 text-[#EA4335]" />,
  getMyInbox: <SiGmail className="w-3.5 h-3.5 text-[#EA4335]" />,
  generateFollowUpDraft: <SiGmail className="w-3.5 h-3.5 text-[#EA4335]" />,
  createSignal: <Zap className="w-3.5 h-3.5" />,
  updateAccountRisk: <Zap className="w-3.5 h-3.5" />,
  syncStripeWorkspaceTool: <SiStripe className="w-3.5 h-3.5 text-[#635BFF]" />,
  syncPostHogWorkspaceTool: <SiPosthog className="w-3.5 h-3.5" />,
  syncGmailWorkspaceTool: <SiGmail className="w-3.5 h-3.5 text-[#EA4335]" />,
  syncIntercomWorkspaceTool: <SiIntercom className="w-3.5 h-3.5 text-[#286EFA]" />,
  syncSentryWorkspaceTool: <SiSentry className="w-3.5 h-3.5 text-[#362D59]" />,
  syncLinearWorkspaceTool: <SiLinear className="w-3.5 h-3.5 text-[#5E6AD2]" />,
  syncHubSpotWorkspaceTool: <SiHubspot className="w-3.5 h-3.5 text-[#FF7A59]" />,
  deliverSlackBriefTool: <MessageSquare className="w-3.5 h-3.5" />,
  buildDailyBriefFromLiveState: <Calendar className="w-3.5 h-3.5" />,
  createRescueDiscountTool: <CreditCard className="w-3.5 h-3.5" />,
}

// ─── Human-readable names for tools ──────────────────────────────────
const TOOL_LABELS: Record<string, string> = {
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

// ─── Render a tool-call result as a summary card ─────────────────────
function ToolResultSummary({ toolName, result }: { toolName: string; result: unknown }) {
  if (!result || typeof result !== 'object') return null
  const data = result as Record<string, unknown>

  // Error state
  if (data.error) {
    return (
      <div className="text-[12px] text-red-400/80 bg-red-500/5 border border-red-500/10 rounded-sm px-3 py-2 mb-2 max-w-[480px]">
        ⚠ {String(data.error)}
      </div>
    )
  }

  // Account details
  if (toolName === 'getAccountDetails' && data.name) {
    return (
      <MiniResultCard
        icon={<Database className="w-4 h-4 text-neutral-400" />}
        title={<span className="text-white">{String(data.name)}</span>}
        subtitle={`${data.mrr ?? ''} · Risk: ${data.riskLevel ?? 'unknown'} · Usage: ${data.usageDelta ?? '?'}`}
      />
    )
  }

  // All accounts
  if (toolName === 'getAllAccounts' && Array.isArray(data.accounts)) {
    const accounts = data.accounts as Array<Record<string, unknown>>
    return (
      <div className="flex flex-col gap-1">
        {accounts.slice(0, 5).map((acc, i) => (
          <MiniResultCard
            key={i}
            icon={<Database className="w-4 h-4 text-neutral-400" />}
            title={<span className="text-white">{String(acc.name)}</span>}
            subtitle={`${acc.mrr ?? ''} · ${String(acc.riskLevel ?? 'unknown')} risk`}
          />
        ))}
        {accounts.length > 5 && (
          <div className="text-[12px] text-neutral-500 pl-7">+ {accounts.length - 5} more accounts</div>
        )}
      </div>
    )
  }

  // Gmail threads (both account-level and founder's own inbox)
  if ((toolName === 'getGmailThreadsForAccount' || toolName === 'getMyInbox') && Array.isArray(data.threads)) {
    const threads = data.threads as Array<Record<string, unknown>>
    if (threads.length === 0) {
      return (
        <div className="text-[12px] text-neutral-500 flex items-center gap-1.5 mb-2">
          <SiGmail className="w-3.5 h-3.5 text-[#EA4335]/60" /> No threads found
        </div>
      )
    }
    return (
      <div className="flex flex-col gap-1">
        {threads.slice(0, 5).map((thread, i) => (
          <MiniResultCard
            key={i}
            icon={<SiGmail className="w-4 h-4 text-[#EA4335]" />}
            title={<span className="text-white">{String(thread.subject ?? 'No subject')}</span>}
            subtitle={`From: ${String(thread.from ?? 'unknown')}${thread.needsReply ? ' · ⚡ Needs reply' : ''}`}
          />
        ))}
        {threads.length > 5 && (
          <div className="text-[12px] text-neutral-500 pl-7">+ {threads.length - 5} more threads</div>
        )}
      </div>
    )
  }

  // Stripe account state
  if (toolName === 'getStripeAccountState' && Array.isArray(data.subscriptions)) {
    const subs = data.subscriptions as Array<Record<string, unknown>>
    return (
      <div className="flex flex-col gap-1">
        {subs.map((sub, i) => (
          <MiniResultCard
            key={i}
            icon={<CreditCard className="w-4 h-4 text-neutral-400" />}
            title={<span className="text-white">{String(sub.plan ?? 'Subscription')}</span>}
            subtitle={`Status: ${String(sub.status)} ${sub.cancelAtPeriodEnd ? '· Cancelling' : ''}`}
          />
        ))}
      </div>
    )
  }

  // Draft generated
  if (toolName === 'generateFollowUpDraft' && data.success) {
    return (
      <MiniResultCard
        icon={<Mail className="w-4 h-4 text-emerald-400" />}
        title={<span className="text-white">Draft created: {String(data.subject ?? '')}</span>}
        subtitle={`For ${String(data.accountName ?? 'account')} · ${String(data.draftType ?? '')}`}
      />
    )
  }

  // Risk updated
  if (toolName === 'updateAccountRisk' && data.success) {
    return (
      <MiniResultCard
        icon={<Zap className="w-4 h-4 text-amber-400" />}
        title={<span className="text-white">{String(data.accountName ?? 'Account')} risk updated</span>}
        subtitle={`${String(data.previousRisk ?? '?')} → ${String(data.newRisk ?? '?')}`}
      />
    )
  }

  // Sync results
  if (data.success && (data.syncedAccounts !== undefined || data.delivered !== undefined)) {
    const parts: string[] = []
    if (data.syncedAccounts !== undefined) parts.push(`${data.syncedAccounts} accounts synced`)
    if (data.syncedThreads !== undefined) parts.push(`${data.syncedThreads} threads`)
    if (data.openIssues !== undefined) parts.push(`${data.openIssues} issues`)
    if (data.delivered) parts.push('Brief delivered')
    return (
      <MiniResultCard
        icon={TOOL_ICONS[toolName] ?? <Zap className="w-4 h-4 text-neutral-400" />}
        title={<span className="text-white">Sync complete</span>}
        subtitle={parts.join(' · ') || 'Done'}
      />
    )
  }

  // Generic success
  if (data.success) {
    return (
      <div className="text-[12px] text-emerald-400/70 mb-2 flex items-center gap-1.5">
        <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
        Completed successfully
      </div>
    )
  }

  return null
}

// ─── Extract tool name from part ─────────────────────────────────────
function extractToolName(part: Record<string, unknown>): string {
  // DynamicToolUIPart has toolName directly
  if (typeof part.toolName === 'string') return part.toolName
  // ToolUIPart has type: `tool-${NAME}` — extract from type string
  const partType = String(part.type ?? '')
  if (partType.startsWith('tool-')) return partType.slice(5)
  return 'unknown'
}

// ─── Single Message Renderer ─────────────────────────────────────────

function AgentMessageBubble({ message }: { message: UIMessage }) {
  if (message.role === "user") {
    // User prompt bubble (right-aligned like the mock)
    const textContent = message.parts
      ?.filter((p): p is { type: "text"; text: string } => p.type === "text")
      .map((p) => p.text)
      .join("") ?? ""

    if (!textContent) return null

    return (
      <div className="w-full flex justify-end relative z-10 mb-6">
        <div className="bg-[#151515] border border-[#262626] rounded-2xl rounded-tr-sm px-4 py-3 text-[13.5px] text-neutral-200 shadow-sm max-w-[85%] leading-relaxed">
          {textContent}
        </div>
      </div>
    )
  }

  // Assistant message — render parts sequentially
  const parts = message.parts ?? []

  // Group sequential tool calls into reasoning batches
  const rendered: React.ReactNode[] = []
  let toolBatch: React.ReactNode[] = []
  let toolBatchCount = 0

  const flushToolBatch = () => {
    if (toolBatch.length > 0) {
      // Check if any tool in this batch is still executing (input-streaming or input-available)
      const isExecuting = toolBatch.some(node =>
        React.isValidElement(node) && (node.props as { isLoading?: boolean }).isLoading
      )

      rendered.push(
        <AgentReasoningBatch key={`batch-${rendered.length}`} stepsCount={toolBatchCount} isExecuting={isExecuting}>
          {toolBatch}
        </AgentReasoningBatch>
      )
      toolBatch = []
      toolBatchCount = 0
    }
  }

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]

    if (part.type === "text" && part.text.trim()) {
      flushToolBatch()
      rendered.push(<AgentSpeechBlock key={`text-${i}`} text={part.text} />)
    }

    if (part.type === "reasoning") {
      toolBatch.push(
        <MonologueBlock key={`reasoning-${i}`} text={part.text} />
      )
    }

    // Tool parts: in AI SDK v6, tool types are `tool-${NAME}` or `dynamic-tool`
    // They have state, input, output properties directly on the part
    const rawPart = part as Record<string, unknown>
    const partType = String(rawPart.type ?? '')
    const isTool = partType.startsWith('tool-') || partType === 'dynamic-tool'

    if (isTool) {
      const toolName = extractToolName(rawPart)
      const label = TOOL_LABELS[toolName] ?? toolName
      const icon = TOOL_ICONS[toolName] ?? <Search className="w-3.5 h-3.5 text-neutral-500" />
      const state = String(rawPart.state ?? '')

      if (state === "input-streaming" || state === "input-available") {
        // Tool input is being prepared or ready — show loading node
        toolBatch.push(
          <TimelineNode
            key={`tool-${i}`}
            title={label}
            icon={icon}
            isLoading={true}
          >
            <InlineQueryBlock query={`${toolName}(${JSON.stringify(rawPart.input ?? {}).slice(0, 80)}...)`} />
          </TimelineNode>
        )
        toolBatchCount++
      } else if (state === "output-available") {
        // Tool finished — show completed node with result
        toolBatch.push(
          <TimelineNode
            key={`tool-${i}`}
            title={label}
            icon={icon}
            isCompleted={true}
            isCollapsible={true}
          >
            <InlineQueryBlock query={`${toolName}()`} />
            <ToolResultSummary toolName={toolName} result={rawPart.output} />
          </TimelineNode>
        )
        toolBatchCount++
      } else if (state === "output-error") {
        // Tool failed
        toolBatch.push(
          <TimelineNode
            key={`tool-${i}`}
            title={`${label} (failed)`}
            icon={icon}
            isCompleted={true}
            isCollapsible={true}
          >
            <div className="text-[12px] text-red-400/80 mb-2">
              ⚠ {String(rawPart.errorText ?? 'Tool execution failed')}
            </div>
          </TimelineNode>
        )
        toolBatchCount++
      }
    }
  }

  flushToolBatch()

  if (rendered.length === 0) return null

  return (
    <div className="w-full relative z-10 pt-2 mb-6">
      <div className="w-full flex flex-col gap-2">
        {rendered}
      </div>
    </div>
  )
}

// ─── Loading Indicator ───────────────────────────────────────────────
function AgentThinking() {
  return (
    <div className="w-full flex items-center gap-3 py-4 mb-6">
      <Loader2 className="w-4 h-4 text-neutral-500 animate-spin" />
      <span className="text-[13px] text-neutral-500">Agent is thinking...</span>
    </div>
  )
}

// ─── Main Feed Component ─────────────────────────────────────────────

export function AgentFeed() {
  const { messages, isLoading, status, hydrationStatus, error } = useChatContext()
  const feedRef = React.useRef<HTMLDivElement>(null)

  // Auto-scroll on new messages
  React.useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight
    }
  }, [messages, status])

  // Show loading state during server hydration
  if (hydrationStatus === "loading") {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex items-center gap-3">
          <Loader2 className="w-4 h-4 text-neutral-500 animate-spin" />
          <span className="text-[13px] text-neutral-500">Restoring conversation...</span>
        </div>
      </div>
    )
  }

  if (messages.length === 0 && !isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center max-w-md">
          <p className="text-[15px] text-neutral-300 mb-2">What can I do for you?</p>
          <p className="text-[13px] text-neutral-500 leading-relaxed">
            Ask me to check your email, review account health, draft follow-ups, or prepare for meetings. I&apos;ll show you my work step-by-step.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div ref={feedRef} className="flex-1 overflow-y-auto px-8 py-8 flex flex-col">
      <div className="w-full max-w-[900px] mx-auto flex flex-col">
        {hydrationStatus === "restored" && (
          <div className="flex items-center justify-center mb-8 mt-2">
            <div className="flex items-center gap-2.5 px-4 py-2 rounded-full bg-white/[0.02] border border-white/10 backdrop-blur-md shadow-[0_0_15px_rgba(16,185,129,0.05)] hover:border-emerald-500/30 transition-all duration-300 group">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span className="text-xs text-neutral-400 font-medium tracking-wide group-hover:text-neutral-300 transition-colors">
                Restored prior context from server session
              </span>
            </div>
          </div>
        )}
        {messages.map((message) => (
          <AgentMessageBubble key={message.id} message={message} />
        ))}

        {isLoading && messages[messages.length - 1]?.role === "user" && !error && (
          <AgentThinking />
        )}

        {error && (
          <div className="w-full flex justify-center mt-2 mb-6">
            <div className="w-full max-w-2xl bg-red-500/5 border border-red-500/20 rounded-xl p-4 flex gap-3 shadow-sm">
              <div className="w-6 h-6 rounded-full bg-red-500/10 flex items-center justify-center shrink-0 mt-0.5">
                <span className="text-red-400 text-sm">⚠</span>
              </div>
              <div className="flex flex-col min-w-0">
                <h4 className="text-[13px] font-medium text-red-400 mb-1">Connection Interrupted</h4>
                <p className="text-[13px] text-red-200/80 leading-relaxed font-mono whitespace-pre-wrap">
                  {error.message || "The agent encountered an unexpected error and could not complete the response."}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
