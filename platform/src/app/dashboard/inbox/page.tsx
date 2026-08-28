import { createClient } from '@/foundation/database/server'
import { getDashboardStateForUser } from '@/data/dashboard/data'
import { ensureWorkspaceForUser } from '@/data/workspaces/ensure-workspace'
import { WorkspaceLayout } from "@/ui/dashboard/workspace-layout"
import { AgentPane } from "@/ui/chat/agent-pane"
import { DashboardLeftPane } from "@/ui/dashboard/left-pane"

export default async function InboxPage() {
  return (
    <div className="w-full h-full flex items-center justify-center text-neutral-500 text-sm">
      {/* Empty inbox view */}
    </div>
  )
}
