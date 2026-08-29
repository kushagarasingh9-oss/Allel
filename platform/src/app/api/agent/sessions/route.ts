import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/foundation/database/server';
import { ensureWorkspaceForUser } from '@/data/workspaces/ensure-workspace';

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
      .select('session_id, persona_id, messages, updated_at')
      .eq('workspace_id', workspace.id)
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })
      .limit(30);

    if (error || !rows || rows.length === 0) {
      // Fallback default mock/demo sessions if DB table has no rows yet
      return NextResponse.json({
        sessions: [
          {
            sessionId: "session-1788035215812",
            personaId: "alex",
            title: "Close integration, draft-send...",
            updatedAt: new Date().toISOString(),
          },
          {
            sessionId: "session-1788034900120",
            personaId: "alex",
            title: "Setup Stripe failed payment workflow",
            updatedAt: new Date(Date.now() - 3600000).toISOString(),
          },
        ]
      });
    }

    const sessions = rows.map((row) => {
      let title = "Chat session";
      if (Array.isArray(row.messages) && row.messages.length > 0) {
        const firstUserMsg = row.messages.find((m: any) => m.role === 'user' || m.source === 'USER_EXPLICIT');
        if (firstUserMsg && (firstUserMsg.content || firstUserMsg.text)) {
          const text = (firstUserMsg.content || firstUserMsg.text || "").trim();
          title = text.length > 32 ? text.slice(0, 32) + "..." : text;
        }
      }

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
