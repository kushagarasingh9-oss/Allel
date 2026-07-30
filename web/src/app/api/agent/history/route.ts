/**
 * GET /api/agent/history?agentId=alex|henry|sarah&sessionId=...
 *
 * Returns server-persisted conversation history for the given persona.
 * Used by ChatProvider to hydrate chat from the server on initial load,
 * so founders don't lose context across page reloads or device switches.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getPersistedConversationHistory, getPersistedConversationMemory } from '@/lib/agent/chat-memory'
import { VALID_PERSONA_IDS, type PersonaId } from '@/lib/agent/personas'
import { ensureWorkspaceForUser } from '@/lib/workspaces/ensure-workspace'
import { resolveAgentConversationSessionId } from '@/lib/agent/chat-session'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const agentId = searchParams.get('agentId') as PersonaId | null
    const sessionId = resolveAgentConversationSessionId({
      sessionId: searchParams.get('sessionId'),
    })

    if (!agentId || !VALID_PERSONA_IDS.has(agentId)) {
      return NextResponse.json(
        { error: 'Invalid agentId. Use: alex, henry, or sarah' },
        { status: 400 }
      )
    }

    const workspace = await ensureWorkspaceForUser(user)

    const [messages, memory] = await Promise.all([
      getPersistedConversationHistory({
        workspaceId: workspace.id,
        userId: user.id,
        personaId: agentId,
        sessionId,
      }),
      getPersistedConversationMemory({
        workspaceId: workspace.id,
        userId: user.id,
        personaId: agentId,
        sessionId,
      }),
    ])

    return NextResponse.json({
      messages,
      hasMemory: memory !== null && (memory.summary.length > 0 || memory.summaryMessageCount > 0),
      memoryPreview: memory
        ? {
            summaryMessageCount: memory.summaryMessageCount,
            lastUserMessageAt: memory.lastUserMessageAt,
            lastAssistantMessageAt: memory.lastAssistantMessageAt,
          }
        : null,
    })
  } catch (error) {
    console.error('[api/agent/history] Failed to load history', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load history' },
      { status: 500 }
    )
  }
}
