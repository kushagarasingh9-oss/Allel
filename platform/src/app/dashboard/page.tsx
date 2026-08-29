import { createClient } from '@/foundation/database/server';
import { ensureWorkspaceForUser } from '@/data/workspaces/ensure-workspace';
import { ChatProvider } from "@/ui/chat/chat-provider";
import { AllelCommandCenter } from "@/ui/dashboard/allel-command-center";

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
      <div className="w-full h-full flex flex-col overflow-hidden bg-[#0E0E10]">
        <AllelCommandCenter />
      </div>
    </ChatProvider>
  );
}

