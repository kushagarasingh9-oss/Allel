import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/foundation/database/server';
import { ensureWorkspaceForUser } from '@/data/workspaces/ensure-workspace';
import { generateChatSessionTitle } from '@/intelligence/chat-titles';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ sessions: [] });
    }

    const workspace = await ensureWorkspaceForUser(user);

    // Fetch conversation sessions ordered by most recent updated_at
    const { data: rows, error } = await supabase
      .from('agent_conversations')
      .select('session_id, persona_id, message_history, updated_at')
      .eq('workspace_id', workspace.id)
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })
      .limit(30);

    if (error || !rows || rows.length === 0) {
      return NextResponse.json({ sessions: [] });
    }

    const sessions = rows.map((row: any) => {
      const historyList = Array.isArray(row.message_history) ? row.message_history : [];
      const title = generateChatSessionTitle(historyList);

      return {
        sessionId: row.session_id || "default",
        personaId: row.persona_id || "alex",
        title: title || "New conversation",
        updatedAt: row.updated_at || new Date().toISOString(),
      };
    });

    return NextResponse.json({ sessions });
  } catch (err) {
    console.error("Error fetching agent sessions:", err);
    return NextResponse.json({ sessions: [] });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('sessionId');

    if (!sessionId) {
      return NextResponse.json({ error: 'Missing sessionId' }, { status: 400 });
    }

    if (user) {
      const workspace = await ensureWorkspaceForUser(user);
      await supabase
        .from('agent_conversations')
        .delete()
        .eq('workspace_id', workspace.id)
        .eq('user_id', user.id)
        .eq('session_id', sessionId);
    }

    return NextResponse.json({ success: true, message: 'Session deleted' });
  } catch (err) {
    console.error('Error deleting session:', err);
    return NextResponse.json({ success: true });
  }
}
