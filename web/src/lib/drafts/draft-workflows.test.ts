import assert from 'node:assert/strict'
import test from 'node:test'
import {
  approveDraftForActor,
  DraftWorkflowError,
  sendDraftForActor,
} from './draft-workflows'

type DraftRow = {
  id: string
  workspace_id: string
  customer_account_id: string | null
  subject: string
  body_preview: string
  status: string
  approved_at?: string | null
  approved_by_actor?: string | null
}

function createFakeSupabase(draft: DraftRow) {
  const drafts = [draft]
  const timeline: Array<Record<string, unknown>> = []

  return {
    state: { drafts, timeline },
    from(table: string) {
      if (table === 'follow_up_drafts') {
        return {
          filters: {} as Record<string, unknown>,
          updatePayload: null as Record<string, unknown> | null,
          select() {
            return this
          },
          eq(column: string, value: unknown) {
            this.filters[column] = value

            if (this.updatePayload) {
              const match = drafts.find((row) => row.id === this.filters.id)
              if (match) {
                Object.assign(match, this.updatePayload)
              }
              return Promise.resolve({ error: null })
            }

            return this
          },
          maybeSingle() {
            const match =
              drafts.find((row) => row.id === this.filters.id) ?? null
            return Promise.resolve({ data: match, error: null })
          },
          update(payload: Record<string, unknown>) {
            this.updatePayload = payload
            return this
          },
          delete() {
            return {
              eq(column: string, value: unknown) {
                const index = drafts.findIndex((row) => row[column as 'id'] === value)
                if (index >= 0) drafts.splice(index, 1)
                return Promise.resolve({ error: null })
              },
            }
          },
        }
      }

      if (table === 'workspace_members') {
        return {
          filters: {} as Record<string, unknown>,
          select() {
            return this
          },
          eq(column: string, value: unknown) {
            this.filters[column] = value
            return this
          },
          maybeSingle() {
            return Promise.resolve({
              data: this.filters.user_id === 'user-1' ? { workspace_id: 'workspace-1' } : null,
              error: null,
            })
          },
        }
      }

      if (table === 'account_timeline') {
        return {
          insert(payload: Record<string, unknown>) {
            timeline.push(payload)
            return Promise.resolve({ error: null })
          },
        }
      }

      throw new Error(`Unexpected table ${table}`)
    },
  }
}

test('approveDraftForActor centralizes status change, logging, timeline writes, and memory refresh', async () => {
  const supabase = createFakeSupabase({
    id: 'draft-1',
    workspace_id: 'workspace-1',
    customer_account_id: 'account-1',
    subject: 'Retention follow-up',
    body_preview: 'Hello there',
    status: 'needs_review',
  })
  const runLogs: Array<Record<string, unknown>> = []
  const refreshed: string[] = []

  const result = await approveDraftForActor({
    supabase: supabase as never,
    draftId: 'draft-1',
    access: { kind: 'user', userId: 'user-1' },
    actor: 'founder',
    source: 'test',
    deps: {
      logRun: async (record) => {
        runLogs.push(record as unknown as Record<string, unknown>)
      },
      refreshMemory: async (_workspaceId, accountId) => {
        refreshed.push(accountId)
      },
    },
  })

  assert.equal(result.status, 'ready_to_send')
  assert.equal(supabase.state.drafts[0]?.status, 'ready_to_send')
  assert.equal(supabase.state.drafts[0]?.approved_by_actor, 'founder')
  assert.equal(runLogs[0]?.runType, 'draft_approved')
  assert.equal(supabase.state.timeline[0]?.event_type, 'draft_approved')
  assert.deepEqual(refreshed, ['account-1'])
})

test('approveDraftForActor rejects agent self-approval', async () => {
  const supabase = createFakeSupabase({
    id: 'draft-2',
    workspace_id: 'workspace-1',
    customer_account_id: 'account-2',
    subject: 'Save offer',
    body_preview: 'We can help',
    status: 'needs_review',
  })

  await assert.rejects(
    () =>
      approveDraftForActor({
        supabase: supabase as never,
        draftId: 'draft-2',
        access: { kind: 'workspace', workspaceId: 'workspace-1' },
        actor: 'agent',
        source: 'test',
      }),
    (error: unknown) =>
      error instanceof DraftWorkflowError && error.code === 'forbidden'
  )
})

test('sendDraftForActor requires founder approval provenance and a human sender', async () => {
  const supabase = createFakeSupabase({
    id: 'draft-3',
    workspace_id: 'workspace-1',
    customer_account_id: 'account-3',
    subject: 'Save offer',
    body_preview: 'We can help',
    status: 'ready_to_send',
    approved_at: '2026-04-24T00:00:00.000Z',
    approved_by_actor: 'founder',
  })

  const result = await sendDraftForActor({
    supabase: supabase as never,
    draftId: 'draft-3',
    access: { kind: 'workspace', workspaceId: 'workspace-1' },
    actor: 'founder',
    source: 'dashboard',
    deps: {
      sendDraft: async () => ({
        messageId: 'message-1',
        threadId: 'thread-1',
        recipient: 'founder@example.com',
      }),
    },
  })

  assert.equal(result.status, 'sent')
  assert.equal(result.messageId, 'message-1')
  assert.equal(result.subject, 'Save offer')
})

test('sendDraftForActor rejects drafts without founder approval provenance', async () => {
  const supabase = createFakeSupabase({
    id: 'draft-4',
    workspace_id: 'workspace-1',
    customer_account_id: 'account-4',
    subject: 'Save offer',
    body_preview: 'We can help',
    status: 'ready_to_send',
    approved_at: null,
    approved_by_actor: null,
  })

  await assert.rejects(
    () =>
      sendDraftForActor({
        supabase: supabase as never,
        draftId: 'draft-4',
        access: { kind: 'workspace', workspaceId: 'workspace-1' },
        actor: 'founder',
        source: 'dashboard',
      }),
    /human founder/
  )
})
