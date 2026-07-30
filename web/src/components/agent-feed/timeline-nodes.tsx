"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { motion, AnimatePresence } from "motion/react"
import { ChevronRight, Loader2, Check } from "lucide-react"
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

export function AgentReasoningBatch({ children, stepsCount = 3, isExecuting = false }: { children: React.ReactNode, stepsCount?: number, isExecuting?: boolean }) {
  // Start open if it's currently executing, closed if it's a past message
  const [isOpen, setIsOpen] = React.useState(isExecuting)

  // Auto-open if execution starts later
  React.useEffect(() => {
    if (isExecuting) setIsOpen(true)
  }, [isExecuting])

  return (
    <div className="mb-6 mt-2 ml-1 bg-[#111111]/40 border border-[#262626] rounded-sm overflow-hidden shadow-sm">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-[#181818] transition-colors"
      >
        <div className="flex items-center gap-2">
           <span className="text-[13px] font-medium text-neutral-300">
             {isOpen && isExecuting ? "Agent is working..." : isOpen ? "Hide agent work" : "View agent work"}
           </span>
        </div>
        <div className="flex items-center gap-3">
           {!isOpen && (
             <div className="text-[12px] text-neutral-500 flex items-center gap-1.5">
               <Check className="w-[14px] h-[14px] text-neutral-400"/> {stepsCount} steps completed
             </div>
           )}
           {isExecuting && !isOpen && (
             <Loader2 className="w-3.5 h-3.5 text-neutral-400 animate-spin" />
           )}
           <ChevronRight className={cn("w-4 h-4 text-neutral-600 transition-transform duration-200", isOpen && "rotate-90")} />
        </div>
      </button>
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="border-t border-[#262626]/50"
          >
            <div className="p-4 flex flex-col pl-4">
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
  isCollapsible, 
  children,
  className 
}: TimelineNodeProps) {
  const [isOpen, setIsOpen] = React.useState(true)

  return (
    <div className={cn("relative flex flex-col group", className)}>
      {/* Decorative vertical line stem (connects to next items) */}
      <div className="absolute left-[11px] top-7 bottom-[-16px] w-[2px] bg-[#262626] group-last:hidden" />

      {/* Node Header Row */}
      <div 
        className={cn(
          "flex items-center gap-3 relative z-10 py-2",
          isCollapsible && "cursor-pointer select-none"
        )}
        onClick={() => isCollapsible && setIsOpen(!isOpen)}
      >
        {/* State Indicator */}
        <div className="relative flex items-center justify-center w-6 h-6 shrink-0 bg-[#0a0a0a]">
          {isLoading ? (
            <Loader2 className="w-[14px] h-[14px] text-neutral-400 animate-spin" />
          ) : isCompleted ? (
            <div className="flex items-center justify-center w-[16px] h-[16px] rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-500">
              <Check className="w-[10px] h-[10px]" strokeWidth={3} />
            </div>
          ) : icon ? (
            <div className="flex items-center justify-center w-[14px] h-[14px] text-neutral-400">
              {icon}
            </div>
          ) : (
            <div className="w-1.5 h-1.5 rounded-full bg-[#262626]" />
          )}
        </div>

        {/* Title & Chevron */}
        <div className="flex items-center gap-2 flex-1">
          <span className={cn(
            "text-[13px] font-medium leading-none",
            isCompleted ? "text-white" : "text-neutral-400"
          )}>
            {title}
          </span>
          {isCollapsible && (
            <ChevronRight 
              className={cn(
                "w-3.5 h-3.5 text-neutral-600 transition-transform duration-200",
                isOpen && "rotate-90"
              )} 
            />
          )}
        </div>
      </div>

      {/* Collapsible Content */}
      <AnimatePresence initial={false}>
        {isOpen && children && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className="overflow-hidden pl-9 pr-4 pb-2"
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export function MonologueBlock({ text }: { text: string }) {
  return (
    <div className="text-[13.5px] italic text-[#8a8a8a] leading-[1.6] mb-4">
      {text}
    </div>
  )
}

export function InlineQueryBlock({ query }: { query: string }) {
   return (
      <div className="mb-4">
         <div className="inline-block text-[13px] text-neutral-300 font-mono tracking-tight bg-[#1e1e1e] border border-[#2e2e2e] rounded-sm px-2 py-0.5">
            {query}
         </div>
      </div>
   )
}

export interface MiniCardProps {
   icon: React.ReactNode
   title: React.ReactNode
   subtitle: string
}

export function MiniResultCard({ icon, title, subtitle }: MiniCardProps) {
   return (
      <div className="flex flex-col gap-1 bg-[#111111] border border-[#262626] rounded-sm px-3 py-2 mb-2 w-full max-w-[480px]">
         <div className="flex items-center gap-2">
            <div className="shrink-0">
               {icon}
            </div>
            <div className="text-[12.5px] text-neutral-200 truncate font-medium">
               {title}
            </div>
         </div>
         <div className="text-[12px] text-neutral-500 truncate pl-[26px]">
            {subtitle}
         </div>
      </div>
   )
}

export function AgentSpeechBlock({ text }: { text: React.ReactNode }) {
   if (typeof text !== 'string') {
      return (
         <div className="w-full text-[14px] text-neutral-200 leading-[1.65] mt-1 mb-3 pr-8">
            {text}
         </div>
      )
   }

   return (
      <div className="w-full text-[14.5px] text-neutral-200 leading-[1.7] mt-1 mb-4 pr-8 max-w-prose prose prose-invert prose-sm prose-p:leading-relaxed prose-pre:bg-[#111111] prose-pre:border prose-pre:border-[#262626] prose-p:mb-3 prose-ul:mb-3 prose-ol:mb-3 prose-li:mb-1 prose-h3:text-[15px] prose-h3:font-medium prose-h3:mt-5 prose-h3:mb-2 prose-strong:font-medium prose-strong:text-white">
         <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {text}
         </ReactMarkdown>
      </div>
   )
}

export function AgentApprovalBlock({ title, description }: { title: string, description?: string }) {
   const [status, setStatus] = React.useState<'idle' | 'approving' | 'approved'>('idle')

   const handleApprove = () => {
      setStatus('approving')
      setTimeout(() => {
         setStatus('approved')
      }, 800)
   }

   if (status === 'approved') {
      return (
         <div className="mt-4 mb-2 flex items-center justify-between gap-4 py-2 px-3 bg-[#111111] border border-[#262626] rounded-sm max-w-2xl">
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
      <div className="mt-4 mb-2 flex items-center justify-between gap-4 py-2 px-3 bg-[#111111] border border-[#262626] rounded-sm max-w-2xl">
         <div className="flex items-center gap-3">
            <div className="w-1.5 h-1.5 rounded-full bg-[#0055FF] animate-pulse shrink-0" />
            <span className="text-[13px] font-medium text-neutral-200">{title}</span>
         </div>
         <div className="flex items-center gap-2 shrink-0">
            <button className="px-3 py-1 text-[12px] font-medium text-neutral-400 hover:text-white hover:bg-[#262626] rounded-sm transition-colors">
               Reject
            </button>
            <button 
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
