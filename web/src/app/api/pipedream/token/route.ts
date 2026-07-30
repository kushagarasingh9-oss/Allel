/**
 * POST /api/pipedream/token
 *
 * Creates a short-lived Pipedream Connect token for the frontend SDK.
 * The frontend uses this token to open OAuth popups for connecting integrations.
 *
 * Returns the full CreateTokenResponse shape expected by the SDK's tokenCallback.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createConnectToken } from '@/lib/integrations/pipedream'

export async function POST() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Use the Supabase user ID as the external user ID for Pipedream
    const result = await createConnectToken(user.id)

    return NextResponse.json(result)
  } catch (error) {
    console.error('[pipedream/token] Failed to create connect token:', error)
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Failed to create connect token',
      },
      { status: 500 }
    )
  }
}
