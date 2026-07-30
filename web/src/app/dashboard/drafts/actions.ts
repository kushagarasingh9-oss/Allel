'use server'

/**
 * Draft Queue Server Actions
 *
 * Used by the drafts page to approve, reject, edit, and send drafts.
 *
 * Security: Every action verifies the authenticated user is a member
 * of the workspace that owns the draft (prevents IDOR).
 */

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import {
  approveDraftForActor,
  editDraftForActor,
  rejectDraftForActor,
  sendDraftForActor,
} from '@/lib/drafts/draft-workflows'

function logActionFailure(context: string, error: unknown) {
  console.error(`[draft-actions] ${context}`, error)
}

export async function approveDraft(draftId: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  await approveDraftForActor({
    supabase,
    draftId,
    access: { kind: 'user', userId: user.id },
    actor: 'founder',
    source: 'dashboard_action',
  })

  revalidatePath('/dashboard/drafts')
  revalidatePath('/dashboard')
}

export async function rejectDraft(draftId: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  await rejectDraftForActor({
    supabase,
    draftId,
    access: { kind: 'user', userId: user.id },
    actor: 'founder',
    source: 'dashboard_action',
    mode: 'delete',
  })

  revalidatePath('/dashboard/drafts')
  revalidatePath('/dashboard')
}

export async function editDraft(
  draftId: string,
  updates: { subject?: string; body?: string }
) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  await editDraftForActor({
    supabase,
    draftId,
    access: { kind: 'user', userId: user.id },
    actor: 'founder',
    source: 'dashboard_action',
    updates,
  })

  revalidatePath('/dashboard/drafts')
}

export async function markDraftSent(draftId: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { ok: false as const, error: 'Unauthorized' }
  }

  try {
    await sendDraftForActor({
      supabase,
      draftId,
      access: { kind: 'user', userId: user.id },
      actor: 'founder',
      source: 'dashboard_action',
    })
    revalidatePath('/dashboard/drafts')
    revalidatePath('/dashboard')
    revalidatePath('/dashboard/accounts')
    return { ok: true as const }
  } catch (error) {
    logActionFailure('Failed to send draft', error)
    return {
      ok: false as const,
      error: 'Failed to send email. Please try again.',
    }
  }
}
