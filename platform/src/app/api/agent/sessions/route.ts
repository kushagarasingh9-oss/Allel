import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/foundation/database/server';
import { createServiceClient } from '@/foundation/database/service';
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
    const { searchParams } = new URL(request.url);
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '100', 10), 1), 200);

    // Fetch conversation sessions ordered by most recent updated_at
    const { data: rows, error } = await supabase
      .from('agent_conversations')
      .select('session_id, persona_id, message_history, updated_at')
      .eq('workspace_id', workspace.id)
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })
      .limit(limit);

    if (error || !rows || rows.length === 0) {
      return NextResponse.json({ sessions: [] });
    }

    // Filter out phantom/empty sessions that have zero messages
    const validRows = rows.filter((row: any) => {
      const historyList = Array.isArray(row.message_history) ? row.message_history : [];
      return historyList.length > 0;
    });

    const sessions = validRows.map((row: any) => {
      const historyList = Array.isArray(row.message_history) ? row.message_history : [];
      const title = generateChatSessionTitle(historyList);

      return {
        sessionId: row.session_id || "default",
        personaId: row.persona_id || "alex",
        title: title || "New conversation",
        updatedAt: row.updated_at || new Date().toISOString(),
        messageCount: historyList.length,
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

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('sessionId');

    if (!sessionId) {
      return NextResponse.json({ error: 'Missing sessionId' }, { status: 400 });
    }

    const workspace = await ensureWorkspaceForUser(user);
    const serviceDb = createServiceClient();
    const { data: deletedRows, error } = await serviceDb
      .from('agent_conversations')
      .delete()
      .eq('workspace_id', workspace.id)
      .eq('user_id', user.id)
      .eq('session_id', sessionId)
      .select('session_id');

    if (error) {
      console.error('Error deleting session from DB:', error);
      return NextResponse.json({ error: 'Failed to delete session' }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: 'Session deleted', deletedCount: deletedRows?.length ?? 0 });
  } catch (err) {
    console.error('Error deleting session:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
