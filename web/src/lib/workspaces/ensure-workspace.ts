import { createServiceClient } from '@/lib/supabase/service'

export type WorkspaceRecord = {
  id: string
  name: string
  slug: string
}

type WorkspaceMembershipRecord = {
  workspace_id: string
  role: 'owner' | 'admin' | 'member'
  created_at: string
}

type OwnedWorkspaceRow = WorkspaceRecord & {
  created_at: string
}

type MinimalUser = {
  id: string
  email?: string | null
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

const WORKSPACE_ROLE_PRIORITY: Record<WorkspaceMembershipRecord['role'], number> = {
  owner: 0,
  admin: 1,
  member: 2,
}

function compareIsoStrings(left: string, right: string) {
  return left.localeCompare(right)
}

export function pickPreferredWorkspaceMembership(
  memberships: WorkspaceMembershipRecord[]
) {
  return [...memberships].sort((left, right) => {
    const roleDelta =
      WORKSPACE_ROLE_PRIORITY[left.role] - WORKSPACE_ROLE_PRIORITY[right.role]

    if (roleDelta !== 0) return roleDelta

    const createdAtDelta = compareIsoStrings(left.created_at, right.created_at)
    if (createdAtDelta !== 0) return createdAtDelta

    return left.workspace_id.localeCompare(right.workspace_id)
  })[0] ?? null
}

export function pickPreferredOwnedWorkspace(workspaces: OwnedWorkspaceRow[]) {
  return [...workspaces].sort((left, right) => {
    const createdAtDelta = compareIsoStrings(left.created_at, right.created_at)
    if (createdAtDelta !== 0) return createdAtDelta

    return left.id.localeCompare(right.id)
  })[0] ?? null
}

export async function ensureWorkspaceForUser(user: MinimalUser): Promise<WorkspaceRecord> {
  const emailLocalPart = user.email?.split('@')[0] || 'workspace'
  const fallbackWorkspace: WorkspaceRecord = {
    id: user.id || 'default-workspace',
    name: `${emailLocalPart}'s Workspace`,
    slug: slugify(emailLocalPart || 'workspace') || 'workspace',
  }

  try {
    const supabase = createServiceClient()

    const membershipRes = await supabase
      .from('workspace_members')
      .select('workspace_id, role, created_at')
      .eq('user_id', user.id)

    if (!membershipRes.error && membershipRes.data && membershipRes.data.length > 0) {
      const preferredMembership = pickPreferredWorkspaceMembership(
        membershipRes.data as WorkspaceMembershipRecord[]
      )

      if (preferredMembership?.workspace_id) {
        const workspaceRes = await supabase
          .from('workspaces')
          .select('id, name, slug')
          .eq('id', preferredMembership.workspace_id)
          .maybeSingle()

        if (!workspaceRes.error && workspaceRes.data) {
          return workspaceRes.data as WorkspaceRecord
        }
      }
    }

    const ownedWorkspaceRes = await supabase
      .from('workspaces')
      .select('id, name, slug, created_at')
      .eq('owner_user_id', user.id)

    if (!ownedWorkspaceRes.error && ownedWorkspaceRes.data && ownedWorkspaceRes.data.length > 0) {
      const preferredOwnedWorkspace = pickPreferredOwnedWorkspace(
        ownedWorkspaceRes.data as OwnedWorkspaceRow[]
      )

      if (preferredOwnedWorkspace) {
        const workspace: WorkspaceRecord = {
          id: preferredOwnedWorkspace.id,
          name: preferredOwnedWorkspace.name,
          slug: preferredOwnedWorkspace.slug,
        }

        await supabase
          .from('workspace_members')
          .upsert(
            {
              workspace_id: workspace.id,
              user_id: user.id,
              role: 'owner',
            },
            { onConflict: 'workspace_id,user_id' }
          )

        return workspace
      }
    }

    const slugBase = slugify(emailLocalPart || 'workspace')

    const workspaceInsert = await supabase
      .from('workspaces')
      .insert({
        name: `${emailLocalPart}'s Workspace`,
        slug: `${slugBase}-${user.id.slice(0, 8)}`,
        owner_user_id: user.id,
      })
      .select('id, name, slug')
      .single()

    if (!workspaceInsert.error && workspaceInsert.data) {
      const workspace = workspaceInsert.data as WorkspaceRecord

      await supabase.from('workspace_members').insert({
        workspace_id: workspace.id,
        user_id: user.id,
        role: 'owner',
      })

      return workspace
    }
  } catch (error) {
    console.error('[ensureWorkspaceForUser] Fail-safe caught workspace lookup error:', error)
  }

  return fallbackWorkspace
}
