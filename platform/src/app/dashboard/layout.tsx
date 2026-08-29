import { createClient } from '@/foundation/database/server'
import { redirect } from 'next/navigation'
import { ensureWorkspaceForUser } from '@/data/workspaces/ensure-workspace'
import { ChatProvider } from "@/ui/chat/chat-provider"
import { AppSidebarContainer } from "@/ui/shell/app-sidebar"

export const dynamic = 'force-dynamic'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  let user = null
  let workspace = null

  try {
    const supabase = await createClient()
    const { data } = await supabase.auth.getUser()
    user = data.user
    if (user) {
      workspace = await ensureWorkspaceForUser(user)
    }
  } catch (error) {
    console.error('[dashboard/layout] Failed to resolve user session', error)
  }

  if (!user) {
    redirect('/auth/login')
  }

  const chatStorageScope = user && workspace ? {
    userId: user.id,
    workspaceId: workspace.id,
  } : null

  return (
    <ChatProvider storageScope={chatStorageScope}>
      <AppSidebarContainer>
        {children}
      </AppSidebarContainer>
    </ChatProvider>
  )
}

