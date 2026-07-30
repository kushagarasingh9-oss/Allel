/**
 * Linear Integration Service
 *
 * Full API coverage: issues (list/search/create/update/assign),
 * comments (create), teams (list), workflow states (list),
 * labels (list), projects (list), cycles (list).
 * Uses Linear GraphQL API.
 */

import { getIntegrationMetadata, getIntegrationToken } from './provider-tokens'

// ============================================================
//  Types
// ============================================================

type LinearMetadata = {
  team_key?: string
}

export type LinearCredentials = {
  apiKey: string
  teamKey: string | null
}

export type LinearIssue = {
  id: string
  identifier: string
  title: string
  description?: string | null
  url?: string | null
  updatedAt?: string | null
  createdAt?: string | null
  priority?: number | null
  priorityLabel?: string | null
  estimate?: number | null
  dueDate?: string | null
  state?: {
    id?: string | null
    name?: string | null
    type?: string | null
  } | null
  team?: {
    id?: string | null
    key?: string | null
    name?: string | null
  } | null
  assignee?: {
    id?: string | null
    name?: string | null
    email?: string | null
  } | null
  labels?: {
    nodes?: Array<{ id: string; name: string }> | null
  } | null
  project?: {
    id?: string | null
    name?: string | null
  } | null
  cycle?: {
    id?: string | null
    name?: string | null
    number?: number | null
  } | null
}

export type LinearTeam = {
  id: string
  key: string
  name: string
  description?: string | null
}

export type LinearWorkflowState = {
  id: string
  name: string
  type: string
  position: number
}

export type LinearLabel = {
  id: string
  name: string
  color: string
}

export type LinearProject = {
  id: string
  name: string
  state: string
  progress: number
  url: string
}

export type LinearCycle = {
  id: string
  name: string | null
  number: number
  startsAt: string
  endsAt: string
  progress: number
}

export type LinearUser = {
  id: string
  name: string
  email: string
  displayName: string
}

export type LinearComment = {
  id: string
  body: string
  createdAt: string
  user?: { name: string } | null
}

// ============================================================
//  Credentials
// ============================================================

export async function getLinearCredentials(workspaceId: string): Promise<LinearCredentials> {
  const [apiKey, metadata] = await Promise.all([
    getIntegrationToken(workspaceId, 'linear'),
    getIntegrationMetadata<LinearMetadata>(workspaceId, 'linear'),
  ])

  return {
    apiKey,
    teamKey:
      typeof metadata.team_key === 'string' && metadata.team_key.length > 0
        ? metadata.team_key
        : null,
  }
}

// ============================================================
//  Internal helper
// ============================================================

async function linearRequest<T>(apiKey: string, query: string, variables?: Record<string, unknown>) {
  const response = await fetch('https://api.linear.app/graphql', {
    method: 'POST',
    headers: {
      Authorization: apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  })

  if (!response.ok) {
    throw new Error(`Linear API error: ${response.status} ${response.statusText}`)
  }

  const payload = (await response.json()) as {
    data?: T
    errors?: Array<{ message?: string }>
  }

  if (payload.errors?.length) {
    throw new Error(payload.errors.map((error) => error.message ?? 'Unknown Linear error').join('; '))
  }

  if (!payload.data) {
    throw new Error('Linear returned no data')
  }

  return payload.data
}

// ============================================================
//  Validate
// ============================================================

export async function validateLinearApiKey(apiKey: string) {
  try {
    await linearRequest<{ viewer: { id: string } }>(
      apiKey,
      'query ValidateLinearKey { viewer { id } }'
    )
    return true
  } catch {
    return false
  }
}

// ============================================================
//  Issues: List / Search / Get / Create / Update
// ============================================================

const ISSUE_FIELDS = `
  id identifier title description url updatedAt createdAt
  priority priorityLabel estimate dueDate
  state { id name type }
  team { id key name }
  assignee { id name email }
  labels { nodes { id name } }
  project { id name }
  cycle { id name number }
`

/** List open issues (for sync) */
export async function fetchLinearIssues(apiKey: string, teamKey: string | null) {
  const data = await linearRequest<{
    issues: { nodes?: LinearIssue[] }
  }>(
    apiKey,
    `query SyncLinearIssues {
      issues(first: 100, filter: { state: { type: { neq: "completed" } } }) {
        nodes { ${ISSUE_FIELDS} }
      }
    }`
  )

  const issues = data.issues.nodes ?? []
  if (!teamKey) return issues
  return issues.filter((issue) => issue.team?.key === teamKey)
}

/** Search issues by text query */
export async function searchLinearIssues(
  apiKey: string,
  query: string,
  limit: number = 15
): Promise<LinearIssue[]> {
  const data = await linearRequest<{
    issueSearch: { nodes?: LinearIssue[] }
  }>(
    apiKey,
    `query SearchIssues($query: String!, $first: Int!) {
      issueSearch(query: $query, first: $first) {
        nodes { ${ISSUE_FIELDS} }
      }
    }`,
    { query, first: limit }
  )
  return data.issueSearch.nodes ?? []
}

/** Get a single issue by ID */
export async function getLinearIssue(
  apiKey: string,
  issueId: string
): Promise<LinearIssue> {
  const data = await linearRequest<{ issue: LinearIssue }>(
    apiKey,
    `query GetIssue($id: String!) {
      issue(id: $id) { ${ISSUE_FIELDS} }
    }`,
    { id: issueId }
  )
  return data.issue
}

/** Create an issue */
export async function createLinearIssue(
  apiKey: string,
  input: {
    teamId: string
    title: string
    description?: string
    priority?: number
    stateId?: string
    assigneeId?: string
    labelIds?: string[]
    projectId?: string
    cycleId?: string
    dueDate?: string
    estimate?: number
  }
): Promise<{ success: boolean; issue: LinearIssue }> {
  const data = await linearRequest<{
    issueCreate: { success: boolean; issue: LinearIssue }
  }>(
    apiKey,
    `mutation CreateIssue($input: IssueCreateInput!) {
      issueCreate(input: $input) {
        success
        issue { ${ISSUE_FIELDS} }
      }
    }`,
    { input }
  )
  return data.issueCreate
}

/** Update an issue */
export async function updateLinearIssue(
  apiKey: string,
  issueId: string,
  input: {
    title?: string
    description?: string
    priority?: number
    stateId?: string
    assigneeId?: string
    labelIds?: string[]
    dueDate?: string
    estimate?: number
  }
): Promise<{ success: boolean; issue: LinearIssue }> {
  const data = await linearRequest<{
    issueUpdate: { success: boolean; issue: LinearIssue }
  }>(
    apiKey,
    `mutation UpdateIssue($id: String!, $input: IssueUpdateInput!) {
      issueUpdate(id: $id, input: $input) {
        success
        issue { ${ISSUE_FIELDS} }
      }
    }`,
    { id: issueId, input }
  )
  return data.issueUpdate
}

// ============================================================
//  Comments: Create
// ============================================================

/** Add a comment to an issue */
export async function createLinearComment(
  apiKey: string,
  issueId: string,
  body: string
): Promise<{ id: string }> {
  const data = await linearRequest<{
    commentCreate: { success: boolean; comment: { id: string } }
  }>(
    apiKey,
    `mutation CreateComment($input: CommentCreateInput!) {
      commentCreate(input: $input) {
        success
        comment { id }
      }
    }`,
    { input: { issueId, body } }
  )
  return data.commentCreate.comment
}

// ============================================================
//  Teams: List
// ============================================================

/** List all teams */
export async function listLinearTeams(apiKey: string): Promise<LinearTeam[]> {
  const data = await linearRequest<{
    teams: { nodes?: LinearTeam[] }
  }>(
    apiKey,
    `query ListTeams {
      teams { nodes { id key name description } }
    }`
  )
  return data.teams.nodes ?? []
}

// ============================================================
//  Workflow States: List
// ============================================================

/** List workflow states for a team */
export async function listLinearWorkflowStates(
  apiKey: string,
  teamId: string
): Promise<LinearWorkflowState[]> {
  const data = await linearRequest<{
    workflowStates: { nodes?: LinearWorkflowState[] }
  }>(
    apiKey,
    `query ListStates($teamId: ID) {
      workflowStates(filter: { team: { id: { eq: $teamId } } }) {
        nodes { id name type position }
      }
    }`,
    { teamId }
  )
  return data.workflowStates.nodes ?? []
}

// ============================================================
//  Labels: List
// ============================================================

/** List all labels */
export async function listLinearLabels(apiKey: string): Promise<LinearLabel[]> {
  const data = await linearRequest<{
    issueLabels: { nodes?: LinearLabel[] }
  }>(
    apiKey,
    `query ListLabels {
      issueLabels { nodes { id name color } }
    }`
  )
  return data.issueLabels.nodes ?? []
}

// ============================================================
//  Projects: List
// ============================================================

/** List projects */
export async function listLinearProjects(apiKey: string): Promise<LinearProject[]> {
  const data = await linearRequest<{
    projects: { nodes?: LinearProject[] }
  }>(
    apiKey,
    `query ListProjects {
      projects(first: 50) {
        nodes { id name state progress url }
      }
    }`
  )
  return data.projects.nodes ?? []
}

// ============================================================
//  Cycles: List active
// ============================================================

/** List active cycles */
export async function listLinearCycles(
  apiKey: string,
  teamId: string
): Promise<LinearCycle[]> {
  const data = await linearRequest<{
    cycles: { nodes?: LinearCycle[] }
  }>(
    apiKey,
    `query ListCycles($teamId: ID) {
      cycles(filter: { team: { id: { eq: $teamId } } }, first: 10) {
        nodes { id name number startsAt endsAt progress }
      }
    }`,
    { teamId }
  )
  return data.cycles.nodes ?? []
}

// ============================================================
//  Users: List
// ============================================================

/** List workspace users */
export async function listLinearUsers(apiKey: string): Promise<LinearUser[]> {
  const data = await linearRequest<{
    users: { nodes?: LinearUser[] }
  }>(
    apiKey,
    `query ListUsers {
      users { nodes { id name email displayName } }
    }`
  )
  return data.users.nodes ?? []
}
