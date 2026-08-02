"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { motion, AnimatePresence } from "motion/react"
import { ChevronRight, Loader2, Check, Clock } from "lucide-react"
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

export interface TimelineNodeProps {
  title: string
  icon?: React.ReactNode
  isCompleted?: boolean
  isLoading?: boolean
  isCollapsible?: boolean
  children?: React.ReactNode
  className?: string
}

export function AgentReasoningBatch({
  children,
  stepsCount = 1,
  isExecuting = false,
}: {
  children: React.ReactNode
  stepsCount?: number
  isExecuting?: boolean
}) {
  // Start open if it's currently executing, closed if it's a past message
  const [isOpen, setIsOpen] = React.useState(isExecuting)

  React.useEffect(() => {
    if (isExecuting) setIsOpen(true)
  }, [isExecuting])

  return (
    <div className="mb-4 mt-2 ml-0">
      {/* Sleek single line header with arrow — NO heavy gray box border */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 text-[13px] font-medium text-neutral-400 hover:text-neutral-200 transition-colors group select-none py-1"
      >
        <span>
          {isExecuting
            ? "Identifying user needs and intent"
            : `Identifying user needs and intent (${stepsCount} step${stepsCount === 1 ? '' : 's'})`}
        </span>
        <ChevronRight
          className={cn(
            "w-3.5 h-3.5 text-neutral-500 group-hover:text-neutral-300 transition-transform duration-200",
            isOpen && "rotate-90"
          )}
        />
      </button>

      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            {/* Thin vertical timeline thread as shown in Screenshot 2 */}
            <div className="mt-2 ml-2 pl-4 border-l border-neutral-800/80 flex flex-col gap-3 py-1">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export function TimelineNode({
  title,
  icon,
  isCompleted,
  isLoading,
  children,
  className
}: TimelineNodeProps) {
  const [isOpen, setIsOpen] = React.useState(!isCompleted)
  const hasAutoCollapsedRef = React.useRef(false)

  React.useEffect(() => {
    if (isCompleted && !hasAutoCollapsedRef.current) {
      hasAutoCollapsedRef.current = true
      const timer = setTimeout(() => setIsOpen(false), 1400)
      return () => clearTimeout(timer)
    }
  }, [isCompleted])

  return (
    <div className={cn("relative flex flex-col group", className)}>
      {/* Step Header with Collapsible Toggle */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 relative z-10 py-0.5 text-left group/btn cursor-pointer select-none"
      >
        {isLoading ? (
          <div className="relative flex items-center justify-center w-4 h-4 shrink-0">
            <Loader2 className="w-3.5 h-3.5 text-neutral-400 animate-spin" />
          </div>
        ) : icon ? (
          <div className="relative flex items-center justify-center w-4 h-4 shrink-0 text-neutral-300">
            {icon}
          </div>
        ) : null}

        <span className="text-[13px] font-medium text-neutral-300 group-hover/btn:text-white transition-colors flex items-center gap-1.5">
          {title}
        </span>

        {children && (
          <ChevronRight
            className={cn(
              "w-3.5 h-3.5 text-neutral-500 group-hover/btn:text-neutral-300 transition-transform duration-200 ml-0.5",
              isOpen && "rotate-90"
            )}
          />
        )}
      </button>

      {/* Child Content (Result summaries, alerts, approval cards) */}
      <AnimatePresence initial={false}>
        {isOpen && children && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden"
          >
            <div className={cn("pt-1", icon || isLoading ? "pl-6" : "pl-0")}>
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export function MonologueBlock({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2.5 text-[13px] text-neutral-400 font-normal leading-relaxed py-0.5">
      <Clock className="w-3.5 h-3.5 mt-0.5 shrink-0 text-neutral-500" />
      <span>{text}</span>
    </div>
  )
}

export function InlineQueryBlock({ query: _query }: { query?: string }) {
  // Raw function names (getMyInbox()) are hidden per user directive
  return null
}

const PROVIDER_LOGOS: Record<string, string> = {
  gmail: '/logos/gmail.svg',
  slack: '/logos/slack.svg',
  stripe: '/logos/stripe.svg',
  posthog: '/logos/posthog.svg',
  linear: '/logos/linear.svg',
  sentry: '/logos/sentry-light.svg',
  hubspot: '/logos/hubspot.svg',
  notion: '/logos/notion.svg',
  google_calendar: '/logos/google-calendar.svg',
  airtable: '/logos/airtable.svg',
}

export function AgentSpeechBlock({ text }: { text: string }) {
  const detectMissingIntegrations = React.useMemo(() => {
    const low = text.toLowerCase()
    if (!low.includes('connect') && !low.includes('access') && !low.includes('integration') && !low.includes("isn't") && !low.includes("aren't")) {
      return []
    }

    const found: Array<{ name: string; slug: string; logoUrl?: string }> = []
    if ((low.includes('gmail') || low.includes('email')) && !found.some(f => f.slug === 'gmail')) {
      found.push({ name: 'Gmail', slug: 'gmail', logoUrl: PROVIDER_LOGOS.gmail })
    }
    if (low.includes('slack') && !found.some(f => f.slug === 'slack')) {
      found.push({ name: 'Slack', slug: 'slack', logoUrl: PROVIDER_LOGOS.slack })
    }
    if (low.includes('stripe') && !found.some(f => f.slug === 'stripe')) {
      found.push({ name: 'Stripe', slug: 'stripe', logoUrl: PROVIDER_LOGOS.stripe })
    }
    if (low.includes('posthog') && !found.some(f => f.slug === 'posthog')) {
      found.push({ name: 'PostHog', slug: 'posthog', logoUrl: PROVIDER_LOGOS.posthog })
    }
    if (low.includes('linear') && !found.some(f => f.slug === 'linear')) {
      found.push({ name: 'Linear', slug: 'linear', logoUrl: PROVIDER_LOGOS.linear })
    }
    if (low.includes('sentry') && !found.some(f => f.slug === 'sentry')) {
      found.push({ name: 'Sentry', slug: 'sentry', logoUrl: PROVIDER_LOGOS.sentry })
    }
    if (low.includes('hubspot') && !found.some(f => f.slug === 'hubspot')) {
      found.push({ name: 'HubSpot', slug: 'hubspot', logoUrl: PROVIDER_LOGOS.hubspot })
    }
    if (low.includes('notion') && !found.some(f => f.slug === 'notion')) {
      found.push({ name: 'Notion', slug: 'notion', logoUrl: PROVIDER_LOGOS.notion })
    }
    return found
  }, [text])

  return (
    <motion.div
      initial={{ opacity: 0, y: 3 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className="w-full text-[13.5px] text-neutral-300 font-normal leading-relaxed mt-1 mb-4 pr-4 max-w-prose"
    >
      <div className="prose prose-invert prose-sm prose-p:text-neutral-300 prose-p:leading-relaxed prose-p:mb-3.5 prose-pre:bg-[#14141A] prose-pre:border prose-pre:border-white/10 prose-ul:mb-3.5 prose-ul:space-y-2 prose-ul:list-disc prose-ul:pl-5 prose-ol:mb-3.5 prose-ol:space-y-2.5 prose-ol:list-decimal prose-ol:pl-5 prose-li:text-neutral-200 prose-li:leading-relaxed prose-h3:text-[14px] prose-h3:font-medium prose-h3:text-neutral-200 prose-h3:mt-4 prose-h3:mb-2 prose-strong:font-semibold prose-strong:text-white">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            img: ({ src, alt }) => (
              <img
                src={src}
                alt={alt ?? ''}
                className="inline-block w-4 h-4 object-contain align-text-bottom mx-1 shrink-0"
              />
            ),
          }}
        >
          {text}
        </ReactMarkdown>
      </div>

      {detectMissingIntegrations.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 mt-2 pt-1">
          {detectMissingIntegrations.map((item) => (
            <a
              key={item.slug}
              href="/dashboard/settings"
              className="inline-flex items-center gap-1.5 px-3 py-1 text-[11.5px] font-medium text-neutral-200 hover:text-white bg-neutral-900 hover:bg-neutral-800 border border-neutral-700/80 hover:border-neutral-500 rounded-full transition-all duration-150 shadow-sm"
            >
              {item.logoUrl && (
                <img src={item.logoUrl} alt={item.name} className="w-3.5 h-3.5 object-contain shrink-0" />
              )}
              <span>Connect</span>
              <ChevronRight className="w-3 h-3 text-neutral-400" />
            </a>
          ))}
        </div>
      )}
    </motion.div>
  )
}

export function AgentApprovalBlock({ title }: { title: string, description?: string }) {
  const [status, setStatus] = React.useState<'idle' | 'approving' | 'approved'>('idle')

  const handleApprove = () => {
    setStatus('approving')
    setTimeout(() => {
      setStatus('approved')
    }, 800)
  }

  if (status === 'approved') {
    return (
      <div className="mt-2 mb-2 flex items-center justify-between gap-4 py-2 px-3 bg-[#111111] border border-[#262626] rounded-sm max-w-2xl">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-[18px] h-[18px] rounded-sm bg-[#1a1a1a] border border-[#262626] shrink-0">
            <Check className="w-3 h-3 text-neutral-400" strokeWidth={3} />
          </div>
          <span className="text-[13px] font-medium text-neutral-300">Execution approved</span>
        </div>
        <div className="text-[12px] text-neutral-500 font-mono">Proceeding...</div>
      </div>
    )
  }

  return (
    <div className="mt-2 mb-2 flex items-center justify-between gap-4 py-2 px-3 bg-[#111111] border border-[#262626] rounded-sm max-w-2xl">
      <div className="flex items-center gap-3">
        <span className="text-[14px]">🧑‍💻</span>
        <span className="text-[13px] font-medium text-neutral-200">{title}</span>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button type="button" className="px-3 py-1 text-[12px] font-medium text-neutral-400 hover:text-white hover:bg-[#262626] rounded-sm transition-colors">
          Reject
        </button>
        <button 
          type="button"
          onClick={handleApprove}
          disabled={status === 'approving'}
          className="px-3 py-1 min-w-[80px] justify-center text-[12px] font-medium bg-[#0055FF] text-white hover:bg-[#0048D9] rounded-sm transition-colors flex items-center gap-1.5"
        >
          {status === 'approving' ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <>
              Approve
              <Check className="w-3 h-3" strokeWidth={3} />
            </>
          )}
        </button>
      </div>
    </div>
  )
}

export interface ExecutionTask {
  id: string
  text: string
  status: 'pending' | 'completed' | 'skipped'
}

export function ExecutionPlanList({ tasks }: { tasks: ExecutionTask[] }) {
  return (
    <div className="flex flex-col gap-2.5 mt-2 mb-3 pl-1">
      {tasks.map((task) => (
        <div key={task.id} className="flex items-start gap-3 group">
          <div className="mt-[3px] shrink-0">
            {task.status === 'completed' ? (
              <div className="w-[14px] h-[14px] rounded-full bg-neutral-800/50 border border-neutral-600 flex items-center justify-center">
                <Check className="w-[8px] h-[8px] text-neutral-400" strokeWidth={3.5} />
              </div>
            ) : task.status === 'skipped' ? (
              <div className="w-[14px] h-[14px] rounded-full flex items-center justify-center border border-neutral-600">
                <div className="w-1.5 h-px bg-neutral-500" />
              </div>
            ) : (
              <div className="w-[14px] h-[14px] rounded-full border border-neutral-600/70 shadow-inner" />
            )}
          </div>
          <span className={cn(
            "text-[13.5px] leading-relaxed font-mono",
            task.status === 'completed' ? "text-neutral-500 line-through decoration-neutral-600/50" : "text-neutral-300"
          )}>
            {task.text}
          </span>
        </div>
      ))}
    </div>
  )
}

export function MiniResultCard({
  icon,
  title,
  subtitle,
  index = 0,
}: {
  icon?: React.ReactNode
  title: React.ReactNode
  subtitle?: React.ReactNode
  index?: number
}) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -8, y: 3 }}
      animate={{ opacity: 1, x: 0, y: 0 }}
      transition={{
        duration: 0.22,
        delay: index * 0.05, // Fast 50ms stagger per item — Railway agentic process speed
        ease: [0.16, 1, 0.3, 1],
      }}
      className="flex items-center gap-2.5 py-1 px-1.5 rounded-sm hover:bg-white/[0.04] transition-colors max-w-xl my-0.5"
    >
      {icon && <div className="shrink-0 text-neutral-400 mt-0.5">{icon}</div>}
      <div className="flex flex-col min-w-0">
        <div className="text-[13px] font-medium text-neutral-200 truncate leading-snug">{title}</div>
        {subtitle && <div className="text-[11.5px] text-neutral-400 truncate leading-tight">{subtitle}</div>}
      </div>
    </motion.div>
  )
}
