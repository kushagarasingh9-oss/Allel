import { createClient } from '@/lib/supabase/server'
import { getDashboardStateForUser } from '@/lib/dashboard/data'
import { ensureWorkspaceForUser } from '@/lib/workspaces/ensure-workspace'
import { WorkspaceLayout } from "@/components/dashboard/workspace-layout"
import { AgentPane } from "@/components/agent-feed/agent-pane"
import { DashboardLeftPane } from "@/components/dashboard/left-pane"

export default async function InboxPage() {
  return (
    <div className="w-full h-full flex items-center justify-center text-neutral-500 text-sm">
      {/* Empty inbox view */}
    </div>
  )
}
