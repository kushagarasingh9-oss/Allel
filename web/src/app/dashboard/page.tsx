import { createClient } from '@/lib/supabase/server';
import { ensureWorkspaceForUser } from '@/lib/workspaces/ensure-workspace';
import { ChatProvider } from "@/components/agent-feed/chat-provider";
import { HomeAgentPanel } from "@/components/dashboard/home-agent-panel";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const workspace = user ? await ensureWorkspaceForUser(user) : null;

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
