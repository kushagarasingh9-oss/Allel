import { createClient } from '@/foundation/database/server';
import { ensureWorkspaceForUser } from '@/data/workspaces/ensure-workspace';
import { ChatProvider } from "@/ui/chat/chat-provider";
import { HomeAgentPanel } from "@/ui/dashboard/home-agent-panel";

export default async function DashboardPage() {
  let user = null;
  let workspace = null;

  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    user = data?.user ?? null;
    if (user) {
      workspace = await ensureWorkspaceForUser(user);
    }
  } catch (error) {
    console.error('[DashboardPage] Error resolving session or workspace:', error);
  }

  const chatStorageScope = user && workspace ? {
    userId: user.id,
    workspaceId: workspace.id,
  } : null;

  return (
    <ChatProvider storageScope={chatStorageScope}>
      <div className="w-full h-full flex justify-end p-2 overflow-hidden">
        <HomeAgentPanel />
      </div>
    </ChatProvider>
  );
}
