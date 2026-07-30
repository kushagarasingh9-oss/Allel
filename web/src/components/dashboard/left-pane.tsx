"use client"

import * as React from "react"
import { TasksDropdown, type TaskItem } from "@/components/agent-feed/tasks-dropdown"
import type { DashboardMode } from "@/lib/dashboard/data"
import { Loader2 } from "lucide-react"
import { ThemeToggle } from "@/components/ui/theme-toggle"

interface DashboardLeftPaneProps {
  dateStr: string
  greeting: string
  userName: string
  briefSummary: string
  tasks: TaskItem[]
  mode: DashboardMode
}

export function DashboardLeftPane({
  dateStr,
  greeting,
  userName,
  briefSummary: initialBriefSummary,
  tasks,
  mode,
}: DashboardLeftPaneProps) {
  const [briefSummary, setBriefSummary] = React.useState(initialBriefSummary)
  const [isRefreshing, setIsRefreshing] = React.useState(false)

  const handleRefresh = React.useCallback(async () => {
    setIsRefreshing(true)
    try {
      const response = await fetch('/api/brief/refresh', { method: 'POST' })
      if (!response.ok) {
        console.error('[DashboardLeftPane] Brief refresh failed:', response.status)
        return
      }

      const data = await response.json()
      if (data.summary) {
        setBriefSummary(data.summary)
      }
    } catch (error) {
      console.error('[DashboardLeftPane] Brief refresh error:', error)
    } finally {
      setIsRefreshing(false)
    }
  }, [])

  return (
    <aside className="w-full h-full flex flex-col p-8 overflow-y-auto bg-transparent">
      {/* Date & Greeting */}
      <div className="mt-8 mb-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-medium text-neutral-900 dark:text-white">{dateStr}</h1>
          <ThemeToggle />
        </div>

        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-medium text-neutral-900 dark:text-white">{greeting}, {userName}</h2>
          <button 
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="text-xs text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 transition-colors disabled:opacity-50 flex items-center gap-1.5"
          >
            {isRefreshing ? (
              <>
                <Loader2 className="w-3 h-3 animate-spin" />
                Refreshing…
              </>
            ) : (
              'Refresh'
            )}
          </button>
        </div>

        {/* AI Daily Brief — generated from all connected sources */}
        {briefSummary ? (
          <p className="text-sm text-neutral-600 dark:text-neutral-400 leading-[1.65]">
            {briefSummary}
          </p>
        ) : mode === 'onboarding' ? (
          <p className="text-sm text-neutral-600 dark:text-neutral-400 leading-[1.65]">
            Connect your first integration to start building your daily brief.
            Head to <a href="/dashboard/settings" className="text-[#0055FF] hover:text-[#3377FF] underline underline-offset-4 decoration-[#0055FF]/30">Integrations</a> to 
            connect your tools — your agent will start working for you automatically.
          </p>
        ) : (
          <p className="text-sm text-neutral-500 dark:text-neutral-500 leading-[1.65]">
            No brief yet today. Ask your agent to build one, or it&apos;ll generate automatically in the morning.
          </p>
        )}
      </div>

      {/* Todo items — agentic tasks */}
      <div className="space-y-4">
        <TasksDropdown tasks={tasks} />

        <button className="flex items-center gap-3 w-full text-left group">
          <div className="h-[14px] w-[14px] shrink-0 rounded-full border-2 border-neutral-300 dark:border-neutral-800 group-hover:border-neutral-400 dark:group-hover:border-neutral-600 transition-colors"></div>
          <span className="text-sm text-neutral-500 group-hover:text-neutral-700 dark:text-neutral-600 dark:group-hover:text-neutral-400 transition-colors">
            New...
          </span>
        </button>
      </div>
    </aside>
  )
}
