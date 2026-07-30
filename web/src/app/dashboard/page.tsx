import { createClient } from '@/lib/supabase/server'
import { getDashboardStateForUser } from '@/lib/dashboard/data'
import { ensureWorkspaceForUser } from '@/lib/workspaces/ensure-workspace'
import { WorkspaceLayout } from "@/components/dashboard/workspace-layout"
import { AgentPane } from "@/components/agent-feed/agent-pane"
import { DashboardLeftPane } from "@/components/dashboard/left-pane"

export default async function DashboardPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const state = await getDashboardStateForUser(user)
  const workspace = user ? await ensureWorkspaceForUser(user) : null

  // Dynamic date formatting
  const now = new Date()
  const dateStr = now.toLocaleDateString('en-US', { 
    weekday: 'long', 
    month: 'short', 
    day: 'numeric' 
  })

  // Dynamic greeting
  const hour = now.getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const userName = user?.email?.split('@')[0] ?? 'there'

  // Map action items to task format
  const tasks = state.actionItems.map(item => ({
    id: item.id,
    headline: item.headline,
    status: item.status,
    kind: item.kind,
    requiresApproval: item.requiresApproval,
  }))

  return (
    <WorkspaceLayout 
      chatStorageScope={
        user && workspace
          ? {
              userId: user.id,
              workspaceId: workspace.id,
            }
          : null
      }
      leftPane={
        <DashboardLeftPane 
          dateStr={dateStr}
          greeting={greeting}
          userName={userName}
          briefSummary={state.briefSummary}
          tasks={tasks}
          mode={state.mode}
        />
      }
      rightPane={<AgentPane />}
    />
  )
}
