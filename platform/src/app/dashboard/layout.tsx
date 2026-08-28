import { createClient } from '@/foundation/database/server'
import { redirect } from 'next/navigation'
import { AppSidebarContainer } from "@/ui/shell/app-sidebar"

export const dynamic = 'force-dynamic'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  let user = null

  try {
    const supabase = await createClient()
    const { data } = await supabase.auth.getUser()
    user = data.user
  } catch (error) {
    console.error('[dashboard/layout] Failed to resolve user session', error)
  }

  if (!user) {
    redirect('/auth/login')
  }

  return (
    <AppSidebarContainer>
      {children}
    </AppSidebarContainer>
  )
}
