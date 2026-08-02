'use client'

/**
 * PipedreamConnectButton — One-click OAuth connect for any integration.
 *
 * Uses the @pipedream/sdk/browser client to open an OAuth iframe when clicked.
 * On success, calls the connectViaPipedreamSafe server action (non-redirecting)
 * to store credentials and trigger the first sync.
 */

import { useState, useCallback, useEffect, useRef } from 'react'
import { connectViaPipedreamSafe, connectDemoIntegrationSafe } from '@/app/dashboard/settings/actions'

type PipedreamConnectButtonProps = {
  /** Our internal provider name (e.g. 'stripe', 'slack') */
  provider: string
  /** Pipedream app slug (e.g. 'stripe', 'slack') */
  appSlug: string
  /** Button label */
  label: string
  /** The Supabase user ID (externalUserId for Pipedream) */
  userId: string
  /** Whether the integration is already connected */
  isConnected?: boolean
}

export default function PipedreamConnectButton({
  provider,
  appSlug,
  label,
  userId,
  isConnected = false,
}: PipedreamConnectButtonProps) {
  const [status, setStatus] = useState<'idle' | 'connecting' | 'syncing' | 'done' | 'error'>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const clientRef = useRef<unknown>(null)

  // Lazily import and initialize the browser client
  useEffect(() => {
    let cancelled = false
    import('@pipedream/sdk/browser').then(({ createFrontendClient }) => {
      if (cancelled) return
      clientRef.current = createFrontendClient({
        externalUserId: userId,
        tokenCallback: async () => {
          const res = await fetch('/api/pipedream/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
          })
          if (!res.ok) {
            throw new Error('Failed to get connect token')
          }
          return await res.json()
        },
      })
    })
    return () => { cancelled = true }
  }, [userId])

  const handleConnect = useCallback(async () => {
    // Check if custom OAuth app ID is configured for this provider
    const customAppIds: Record<string, string | undefined> = {
      intercom: process.env.NEXT_PUBLIC_PIPEDREAM_OAUTH_APP_INTERCOM,
      slack: process.env.NEXT_PUBLIC_PIPEDREAM_OAUTH_APP_SLACK,
      hubspot: process.env.NEXT_PUBLIC_PIPEDREAM_OAUTH_APP_HUBSPOT,
      stripe: process.env.NEXT_PUBLIC_PIPEDREAM_OAUTH_APP_STRIPE,
      gmail: process.env.NEXT_PUBLIC_PIPEDREAM_OAUTH_APP_GMAIL,
      sentry: process.env.NEXT_PUBLIC_PIPEDREAM_OAUTH_APP_SENTRY,
      linear: process.env.NEXT_PUBLIC_PIPEDREAM_OAUTH_APP_LINEAR,
      posthog: process.env.NEXT_PUBLIC_PIPEDREAM_OAUTH_APP_POSTHOG,
      airtable: process.env.NEXT_PUBLIC_PIPEDREAM_OAUTH_APP_AIRTABLE,
      notion: process.env.NEXT_PUBLIC_PIPEDREAM_OAUTH_APP_NOTION,
      google_calendar: process.env.NEXT_PUBLIC_PIPEDREAM_OAUTH_APP_GOOGLE_CALENDAR,
    }

    const oauthAppId = customAppIds[provider] || undefined

    setStatus('connecting')
    setErrorMessage(null)

    try {
      const client = clientRef.current as {
        connectAccount: (opts: {
          app: string
          oauthAppId?: string
          onSuccess?: (res: { id: string }) => void
          onError?: (err: Error) => void
          onClose?: (status: { successful: boolean; completed: boolean }) => void
        }) => Promise<void>
      } | null

      if (!client) {
        throw new Error('Pipedream OAuth client initializing… Click Connect again.')
      }

      await new Promise<void>((resolve, reject) => {
        const opts: {
          app: string
          oauthAppId?: string
          onSuccess?: (res: { id: string }) => void
          onError?: (err: Error) => void
          onClose?: (status: { successful: boolean; completed: boolean }) => void
        } = {
          app: appSlug,
          onSuccess: async (res) => {
            setStatus('syncing')

            // Call server action to securely fetch & store Pipedream credentials
            const result = await connectViaPipedreamSafe(provider, res.id)

            if (result.success) {
              setStatus('done')
              window.location.href =
                '/dashboard/settings?success=' + encodeURIComponent(result.message)
            } else {
              setStatus('error')
              setErrorMessage(result.message)
            }

            resolve()
          },
          onError: (err) => {
            reject(err)
          },
          onClose: (closeStatus) => {
            if (!closeStatus.successful) {
              reject(new Error('Connection cancelled'))
            }
          },
        }

        if (oauthAppId) {
          opts.oauthAppId = oauthAppId
        }

        client.connectAccount(opts)
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Connection failed'
      if (msg === 'Connection cancelled') {
        setStatus('idle')
        return
      }
      setStatus('error')
      setErrorMessage(msg)
    }
  }, [appSlug, provider, label])

  const isLoading = status === 'connecting' || status === 'syncing'

  return (
    <div>
      <button
        onClick={handleConnect}
        disabled={isLoading}
        className="relative px-5 py-1.5 rounded-sm overflow-hidden group transition-transform active:scale-95 shadow-[0_1px_3px_rgba(0,0,0,0.3)] disabled:opacity-60 disabled:cursor-wait"
      >
        {/* Double Layer Background Effect for Premium Monochrome */}
        <div className="absolute inset-0 bg-[#1c1c1c] border border-[#333] rounded-sm group-hover:bg-[#2a2a2a] transition-colors" />
        <div className="absolute inset-[1px] bg-gradient-to-b from-white/[0.08] to-transparent rounded-sm pointer-events-none" />
        <span className="relative z-10 text-[12px] font-medium text-neutral-200 group-hover:text-white transition-colors">
          {isLoading ? (
            <span className="flex items-center justify-center gap-2">
              <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
              {status === 'connecting' ? 'Opening OAuth…' : 'Syncing…'}
            </span>
          ) : isConnected ? (
            'Reconnect'
          ) : (
            'Connect'
          )}
        </span>
      </button>

      {/* Floating Error Toast (Never distorting card layout) */}
      {status === 'error' && errorMessage && (
        <div className="fixed top-6 right-6 z-50 px-4 py-3 rounded-lg bg-[#190d10] border border-[#f87171]/30 text-[#ffb0b9] text-[13px] font-medium shadow-xl flex items-center gap-3 max-w-md animate-in fade-in slide-in-from-top-2">
          <span>{errorMessage}</span>
          <button
            onClick={() => setErrorMessage(null)}
            className="text-neutral-400 hover:text-white transition-colors"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  )
}
