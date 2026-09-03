/**
 * Workspace Scan Orchestrator
 *
 * Coordinates multi-provider ingestion (Stripe -> PostHog -> Intercom)
 * and executes fast local fleet risk scanning with fault isolation and timeout safety.
 */

import { syncStripeWorkspace } from '@/integrations/stripe/stripe-sync'
import { syncPostHogWorkspace } from '@/integrations/posthog/posthog-sync'
import { syncIntercomWorkspace } from '@/integrations/intercom/intercom-sync'
import { scanFleet, type ScanFleetOptions } from './customer-scan-service'
import { type FleetRiskScan } from './customer-scan-types'
import type { SupabaseClient } from '@supabase/supabase-js'

export type WorkspaceScanProvider = 'stripe' | 'posthog' | 'intercom'

export type ProviderSyncOutcome = {
  status: 'synced' | 'skipped' | 'failed'
  error?: string
  syncedCount?: number
  durationMs?: number
}

export type WorkspaceScanOptions = {
  skipSync?: boolean
  providers?: WorkspaceScanProvider[]
  limit?: number
  includeHealthy?: boolean
  supabaseClient?: SupabaseClient
  providerTimeoutMs?: number
  syncOverrides?: {
    stripe?: (workspaceId: string) => Promise<any>
    posthog?: (workspaceId: string) => Promise<any>
    intercom?: (workspaceId: string) => Promise<any>
  }
}

export type WorkspaceScanResult = {
  workspaceId: string
  scannedAt: string
  totalDurationMs: number
  syncSummary: {
    stripe: ProviderSyncOutcome
    posthog: ProviderSyncOutcome
    intercom: ProviderSyncOutcome
  }
  fleet: FleetRiskScan
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, providerName: string): Promise<T> {
  let timeoutId: NodeJS.Timeout
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`${providerName} sync timed out after ${timeoutMs}ms`))
    }, timeoutMs)
  })
  try {
    return await Promise.race([promise, timeoutPromise])
  } finally {
    clearTimeout(timeoutId!)
  }
}

/**
 * Execute sequential sync across configured providers followed by fleet risk analysis.
 *
 * Guarantees fault isolation: Failure or timeout in one integration provider does not abort
 * the remaining providers or prevent the local read-model fleet scan from executing.
 */
export async function runWorkspaceScan(
  workspaceId: string,
  options?: WorkspaceScanOptions
): Promise<WorkspaceScanResult> {
  const startTime = Date.now()
  const scannedAt = new Date().toISOString()
  const timeoutMs = options?.providerTimeoutMs ?? 8000
  const activeProviders = new Set<WorkspaceScanProvider>(
    options?.providers ?? ['stripe', 'posthog', 'intercom']
  )

  const syncSummary: WorkspaceScanResult['syncSummary'] = {
    stripe: { status: 'skipped' },
    posthog: { status: 'skipped' },
    intercom: { status: 'skipped' },
  }

  // ─── 1. Sequential Multi-Provider Sync (if not skipped) ─────────────
  if (!options?.skipSync) {
    // 1a. Stripe Sync
    if (activeProviders.has('stripe')) {
      const pStart = Date.now()
      try {
        const syncFn = options?.syncOverrides?.stripe ?? syncStripeWorkspace
        const res = await withTimeout(syncFn(workspaceId), timeoutMs, 'Stripe')
        syncSummary.stripe = {
          status: 'synced',
          syncedCount: res?.syncedAccounts ?? res?.syncedCount ?? 0,
          durationMs: Date.now() - pStart,
        }
      } catch (err: any) {
        console.warn(`[workspace-scan] Stripe sync note for ${workspaceId}:`, err?.message || err)
        syncSummary.stripe = {
          status: 'failed',
          error: err?.message || 'Stripe sync failed',
          durationMs: Date.now() - pStart,
        }
      }
    }

    // 1b. PostHog Sync
    if (activeProviders.has('posthog')) {
      const pStart = Date.now()
      try {
        const syncFn = options?.syncOverrides?.posthog ?? syncPostHogWorkspace
        const res = await withTimeout(syncFn(workspaceId), timeoutMs, 'PostHog')
        syncSummary.posthog = {
          status: 'synced',
          syncedCount: res?.syncedAccounts ?? res?.syncedPersons ?? 0,
          durationMs: Date.now() - pStart,
        }
      } catch (err: any) {
        console.warn(`[workspace-scan] PostHog sync note for ${workspaceId}:`, err?.message || err)
        syncSummary.posthog = {
          status: 'failed',
          error: err?.message || 'PostHog sync failed',
          durationMs: Date.now() - pStart,
        }
      }
    }

    // 1c. Intercom Sync
    if (activeProviders.has('intercom')) {
      const pStart = Date.now()
      try {
        const syncFn = options?.syncOverrides?.intercom ?? syncIntercomWorkspace
        const res = await withTimeout(syncFn(workspaceId), timeoutMs, 'Intercom')
        syncSummary.intercom = {
          status: 'synced',
          syncedCount: res?.syncedAccounts ?? res?.syncedContacts ?? 0,
          durationMs: Date.now() - pStart,
        }
      } catch (err: any) {
        console.warn(`[workspace-scan] Intercom sync note for ${workspaceId}:`, err?.message || err)
        syncSummary.intercom = {
          status: 'failed',
          error: err?.message || 'Intercom sync failed',
          durationMs: Date.now() - pStart,
        }
      }
    }
  }

  // ─── 2. Local Read-Model Fleet Scan (<50ms Execution) ───────────────
  const fleetScanOptions: ScanFleetOptions & { supabaseClient?: SupabaseClient } = {
    limit: options?.limit ?? 15,
    includeHealthy: options?.includeHealthy ?? false,
    supabaseClient: options?.supabaseClient,
  }

  const fleet = await scanFleet(workspaceId, fleetScanOptions)

  return {
    workspaceId,
    scannedAt,
    totalDurationMs: Date.now() - startTime,
    syncSummary,
    fleet,
  }
}
