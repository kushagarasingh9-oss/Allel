import assert from 'node:assert/strict'
import test from 'node:test'
import {
  pickPreferredOwnedWorkspace,
  pickPreferredWorkspaceMembership,
} from './ensure-workspace'

test('pickPreferredWorkspaceMembership prefers owner roles before newer memberships', () => {
  const preferred = pickPreferredWorkspaceMembership([
    {
      workspace_id: 'workspace-member',
      role: 'member',
      created_at: '2026-04-24T10:00:00.000Z',
    },
    {
      workspace_id: 'workspace-owner',
      role: 'owner',
      created_at: '2026-04-24T11:00:00.000Z',
    },
    {
      workspace_id: 'workspace-admin',
      role: 'admin',
      created_at: '2026-04-24T09:00:00.000Z',
    },
  ])

  assert.equal(preferred?.workspace_id, 'workspace-owner')
})

test('pickPreferredOwnedWorkspace falls back to the earliest created workspace deterministically', () => {
  const preferred = pickPreferredOwnedWorkspace([
    {
      id: 'workspace-b',
      name: 'Workspace B',
      slug: 'workspace-b',
      created_at: '2026-04-24T11:00:00.000Z',
    },
    {
      id: 'workspace-a',
      name: 'Workspace A',
      slug: 'workspace-a',
      created_at: '2026-04-24T10:00:00.000Z',
    },
  ])

  assert.equal(preferred?.id, 'workspace-a')
})
