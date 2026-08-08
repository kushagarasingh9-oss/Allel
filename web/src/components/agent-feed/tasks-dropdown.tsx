"use client"

import * as React from "react"
import { ChevronDown, Circle, Check, ArrowRight } from "lucide-react"
import { cn } from "@/lib/utils"

export type TaskItem = {
  id: string
  headline: string
  status: string
  kind: string
  requiresApproval: boolean
}

interface TasksDropdownProps {
  tasks: TaskItem[]
}

export function TasksDropdown({ tasks }: TasksDropdownProps) {
  const [isOpen, setIsOpen] = React.useState(tasks.length > 0)
  const [completedIds, setCompletedIds] = React.useState<Set<string>>(new Set())

  const toggleComplete = (id: string) => {
    setCompletedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  if (tasks.length === 0) {
    return (
      <div className="flex flex-col mb-4">
        <div className="flex items-center gap-2 text-sm text-neutral-500">
          <Check className="w-4 h-4" />
          <span>No tasks right now — you&apos;re all caught up.</span>
        </div>
      </div>
    )
  }

  const pendingTasks = tasks.filter(t => !completedIds.has(t.id))
  const pendingCount = pendingTasks.length

  return (
    <div className="flex flex-col mb-4">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 text-sm text-neutral-300 hover:text-white transition-colors w-full text-left"
      >
        <ChevronDown className={cn("w-4 h-4 transition-transform duration-200", isOpen ? "rotate-0" : "-rotate-90")} />
        <span className="font-medium">To do today</span>
      </button>

      <div className={cn(
        "grid transition-all duration-300 ease-in-out pl-6",
        isOpen ? "grid-rows-[1fr] opacity-100 mt-4" : "grid-rows-[0fr] opacity-0 mt-0"
      )}>
        <div className="overflow-hidden flex flex-col gap-3">
          {tasks.map((task) => {
            const isDone = completedIds.has(task.id)
            return (
              <div 
                key={task.id} 
                onClick={() => toggleComplete(task.id)}
                className="flex items-start gap-2.5 group cursor-pointer text-[13px] transition-colors"
              >
                {isDone ? (
                  <div className="w-3.5 h-3.5 mt-[2px] rounded-full bg-neutral-700 flex items-center justify-center shrink-0">
                    <Check className="w-2.5 h-2.5 text-neutral-400" strokeWidth={3} />
                  </div>
                ) : (
                  <Circle className="w-3.5 h-3.5 mt-[2px] opacity-40 group-hover:opacity-100 transition-opacity shrink-0 text-neutral-400" />
                )}
                <span className={cn(
                  "leading-snug",
                  isDone ? "text-neutral-600 line-through decoration-neutral-700" : "text-neutral-400 hover:text-neutral-200"
                )}>
                  {task.headline}
                </span>
              </div>
            )
          })}

          {pendingCount > 0 && (
            <ProceedButton pendingTasks={pendingTasks} />
          )}
        </div>
      </div>
    </div>
  )
}

/** 
 * "Proceed with tasks" button — dispatches a custom event that 
 * the AgentPane listens for to send the tasks to the chat.
 * Uses CustomEvent instead of useChatContext to avoid hook issues 
 * across the server/client boundary.
 */
function ProceedButton({ pendingTasks }: { pendingTasks: TaskItem[] }) {
  const handleProceed = () => {
    const taskList = pendingTasks.map((t, i) => `${i + 1}. ${t.headline}`).join('\n')
    // Dispatch a custom event the AgentPane can listen for
    window.dispatchEvent(new CustomEvent('allel:proceed-tasks', {
      detail: { text: `Here are my tasks for today. Please help me work through them:\n\n${taskList}` }
    }))
  }

  return (
    <button 
      onClick={handleProceed}
      className="mt-2 flex items-center gap-1.5 text-[12px] font-medium text-[#0055FF] hover:text-[#3377FF] transition-colors w-fit px-2 py-1 rounded bg-[#0055FF]/10 hover:bg-[#0055FF]/20"
    >
      Proceed with tasks
      <ArrowRight className="w-3 h-3" />
    </button>
  )
}
