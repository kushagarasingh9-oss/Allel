'use client'

import React, { useState, useTransition } from 'react'
import { X, CheckCircle2, AlertCircle, Loader2, ExternalLink, Eye, EyeOff } from 'lucide-react'
import {
  connectStripe,
  connectPostHog,
  connectNotion,
  connectLinear,
  connectSentry,
  connectHubSpot,
  connectSlack,
  connectAirtable,
  connectIntercom,
  getGmailConnectUrl,
  getIntercomConnectUrl,
} from '@/app/dashboard/settings/actions'
import type { IntegrationProvider } from '@/integrations/catalog'

type Props = {
  isOpen: boolean
  onClose: () => void
  provider: IntegrationProvider
  providerLabel: string
  icon: React.ReactNode
  unlockDescription: string
  onSuccess: (provider: string, message: string) => void
}

const HINTS: Partial<Record<IntegrationProvider, { placeholder: string; docUrl: string; label: string }>> = {
  stripe: {
    label: 'Stripe Secret Key',
    placeholder: 'sk_test_... or sk_live_...',
    docUrl: 'https://dashboard.stripe.com/apikeys',
  },
  posthog: {
    label: 'PostHog Personal API Key',
    placeholder: 'phx_...',
    docUrl: 'https://us.posthog.com/user/settings',
  },
  notion: {
    label: 'Notion Integration Secret',
    placeholder: 'secret_...',
    docUrl: 'https://www.notion.so/my-integrations',
  },
  linear: {
    label: 'Linear Personal API Key',
    placeholder: 'lin_api_...',
    docUrl: 'https://linear.app/settings/api',
  },
  sentry: {
    label: 'Sentry Auth Token',
    placeholder: 'sntrys_...',
    docUrl: 'https://sentry.io/settings/account/api/auth-tokens/',
  },
  intercom: {
    label: 'Intercom Access Token',
    placeholder: 'dG9rO...',
    docUrl: 'https://app.intercom.com/a/developer-signup',
  },
  hubspot: {
    label: 'HubSpot Private App Access Token',
    placeholder: 'pat-na1-...',
    docUrl: 'https://app.hubspot.com/l/private-apps',
  },
  slack: {
    label: 'Slack Bot User OAuth Token',
    placeholder: 'xoxb-...',
    docUrl: 'https://api.slack.com/apps',
  },
  gmail: {
    label: 'Gmail App Password or OAuth Key',
    placeholder: 'xxxx xxxx xxxx xxxx',
    docUrl: 'https://myaccount.google.com/apppasswords',
  },
  airtable: {
    label: 'Airtable Personal Access Token',
    placeholder: 'pat...',
    docUrl: 'https://airtable.com/create/tokens',
  },
}

export default function DirectConnectModal({
  isOpen,
  onClose,
  provider,
  providerLabel,
  icon,
  onSuccess,
}: Props) {
  const [apiKey, setApiKey] = useState('')
  const [secondaryInput, setSecondaryInput] = useState('')
  const [intercomRegion, setIntercomRegion] = useState<'us' | 'eu' | 'au'>('us')
  const [showKey, setShowKey] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  if (!isOpen) return null

  const isGoogleProvider =
    provider === 'gmail' ||
    provider === 'google_calendar' ||
    provider === 'google_docs' ||
    provider === 'google_drive'
  const isIntercomProvider = provider === 'intercom'
  const usesOAuthConnect = isGoogleProvider

  const hint = HINTS[provider] ?? {
    label: `${providerLabel} API Key`,
    placeholder: 'Enter API key...',
    docUrl: '#',
  }

  const handleOAuthConnect = () => {
    setError(null)
    startTransition(async () => {
      try {
        const result = isIntercomProvider
          ? await getIntercomConnectUrl(intercomRegion)
          : await getGmailConnectUrl(provider)
        if (result.authUrl) {
          window.location.href = result.authUrl
        } else {
          onSuccess(provider, `${providerLabel} connected!`)
          onClose()
        }
      } catch (err: unknown) {
        if (typeof err === 'object' && err !== null && 'digest' in err && typeof err.digest === 'string' && err.digest.startsWith('NEXT_REDIRECT')) {
          const digest = (err as { digest: string }).digest
          if (digest.includes('error=')) {
            const errorMatch = digest.match(/error=([^&]*)/)
            setError(errorMatch ? decodeURIComponent(errorMatch[1]) : 'Connection failed.')
            return
          }
          onSuccess(provider, `${providerLabel} connected!`)
          onClose()
          return
        }
        setError(err instanceof Error ? err.message : 'OAuth connection failed.')
      }
    })
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!apiKey.trim()) {
      setError('Please enter a valid API key.')
      return
    }

    startTransition(async () => {
      try {
        switch (provider) {
          case 'stripe':
            await connectStripe(apiKey.trim())
            break
          case 'posthog':
            await connectPostHog(apiKey.trim(), secondaryInput.trim() || undefined)
            break
          case 'intercom':
            await connectIntercom(apiKey.trim(), intercomRegion)
            break
          case 'notion':
            await connectNotion(apiKey.trim())
            break
          case 'linear':
            await connectLinear(apiKey.trim(), secondaryInput.trim() || undefined)
            break
          case 'sentry':
            await connectSentry(apiKey.trim(), secondaryInput.trim() || 'default-org')
            break
          case 'hubspot':
            await connectHubSpot(apiKey.trim())
            break
          case 'slack':
            await connectSlack(apiKey.trim(), secondaryInput.trim() || 'general')
            break
          case 'airtable':
            await connectAirtable(apiKey.trim())
            break
          default:
            throw new Error(`Unsupported provider: ${provider}`)
        }

        onSuccess(provider, `${providerLabel} connected successfully!`)
        onClose()
      } catch (err: unknown) {
        if (typeof err === 'object' && err !== null && 'digest' in err && typeof err.digest === 'string' && err.digest.startsWith('NEXT_REDIRECT')) {
          const digest = (err as { digest: string }).digest
          if (digest.includes('error=')) {
            const errorMatch = digest.match(/error=([^&;]*)/)
            const cleanErr = errorMatch
              ? decodeURIComponent(errorMatch[1].replace(/\+/g, ' '))
              : 'Connection failed.'
            setError(cleanErr)
            return
          }
          onSuccess(provider, `${providerLabel} connected!`)
          onClose()
          return
        }
        setError(err instanceof Error ? err.message : 'Connection failed.')
      }
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in font-sans">
      <div className="relative w-full max-w-[420px] bg-[#101012] border border-white/[0.12] rounded-sm shadow-2xl p-5 text-white select-none">
        {/* Header */}
        <div className="flex items-center justify-between pb-3.5 mb-4 border-b border-white/[0.06]">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-sm bg-white/[0.04] border border-white/10 flex items-center justify-center shrink-0">
              {icon}
            </div>
            <h3 className="text-sm font-medium text-white tracking-tight">
              Connect {providerLabel}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-white transition-colors p-1 rounded-sm hover:bg-white/5 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* OAuth Connect */}
        {usesOAuthConnect && (
          <div className="space-y-4">
            {isIntercomProvider && (
              <div>
                <label className="block text-[11px] font-medium text-zinc-300 mb-1.5">
                  Intercom workspace region
                </label>
                <select
                  value={intercomRegion}
                  onChange={(event) => setIntercomRegion(event.target.value as 'us' | 'eu' | 'au')}
                  disabled={isPending}
                  className="w-full bg-[#0a0a0c] border border-white/10 rounded-sm py-2 px-3 text-xs text-white outline-none focus:border-white/30 cursor-pointer"
                >
                  <option value="us">United States</option>
                  <option value="eu">Europe</option>
                  <option value="au">Australia</option>
                </select>
              </div>
            )}
            <button
              type="button"
              onClick={handleOAuthConnect}
              disabled={isPending}
              className="w-full py-2.5 px-4 rounded-sm bg-white text-black hover:bg-zinc-200 text-xs font-semibold transition-colors flex items-center justify-center gap-2 shadow-xs disabled:opacity-50 cursor-pointer"
            >
              {isPending ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Connecting…</span>
                </>
              ) : (
                <>
                  <img src={isIntercomProvider ? "/logos/intercom.svg" : "/logos/gmail.svg"} alt="Provider" className="w-4 h-4 object-contain" />
                  <span>{isIntercomProvider ? 'Connect with Intercom' : 'Connect with Google Account'}</span>
                </>
              )}
            </button>
          </div>
        )}

        {usesOAuthConnect && error && (
          <div className="flex items-center gap-2 p-2.5 mt-3 rounded-sm bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Form for direct credentials */}
        {!usesOAuthConnect && (
          <form onSubmit={handleSubmit} className="space-y-3.5">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[11px] font-medium text-zinc-300">
                  {hint.label}
                </label>
                {hint.docUrl !== '#' && (
                  <a
                    href={hint.docUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[11px] text-zinc-500 hover:text-white transition-colors flex items-center gap-1"
                  >
                    <span>Get Key</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>

              <div className="relative">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={hint.placeholder}
                  className="w-full bg-[#0a0a0c] border border-white/10 rounded-sm py-2 pl-3 pr-9 text-xs text-white outline-none focus:border-white/30 transition-colors placeholder:text-zinc-600 font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors p-0.5 cursor-pointer"
                >
                  {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            {provider === 'intercom' && (
              <div>
                <label className="text-[11px] font-medium text-zinc-300 block mb-1.5">
                  Intercom Workspace Region
                </label>
                <select
                  value={intercomRegion}
                  onChange={(e) => setIntercomRegion(e.target.value as 'us' | 'eu' | 'au')}
                  disabled={isPending}
                  className="w-full bg-[#0a0a0c] border border-white/10 rounded-sm py-2 px-3 text-xs text-white outline-none focus:border-white/30 cursor-pointer"
                >
                  <option value="us">United States (Default)</option>
                  <option value="eu">Europe</option>
                  <option value="au">Australia</option>
                </select>
              </div>
            )}

            {(provider === 'posthog' || provider === 'linear' || provider === 'sentry' || provider === 'slack') && (
              <div>
                <label className="text-[11px] font-medium text-zinc-300 block mb-1.5">
                  {provider === 'posthog' && 'Project / Workspace ID (Optional)'}
                  {provider === 'linear' && 'Team Key (Optional)'}
                  {provider === 'sentry' && 'Organization Slug (Optional)'}
                  {provider === 'slack' && 'Default Channel (Optional)'}
                </label>
                <input
                  type="text"
                  value={secondaryInput}
                  onChange={(e) => setSecondaryInput(e.target.value)}
                  placeholder="Optional secondary detail..."
                  className="w-full bg-[#0a0a0c] border border-white/10 rounded-sm py-2 px-3 text-xs text-white outline-none focus:border-white/30 transition-colors placeholder:text-zinc-600 font-mono"
                />
              </div>
            )}

            {error && (
              <div className="flex items-center gap-2 p-2 rounded-sm bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Action Buttons — Cancel & Connect Key Only */}
            <div className="pt-3 mt-4 border-t border-white/[0.06] flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 rounded-sm text-xs font-medium text-zinc-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={isPending}
                className="px-3.5 py-1.5 rounded-sm bg-white text-black hover:bg-zinc-200 text-xs font-medium transition-colors flex items-center gap-1.5 shadow-xs disabled:opacity-50 cursor-pointer"
              >
                {isPending ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Saving…</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Connect Key</span>
                  </>
                )}
              </button>
            </div>

            {isIntercomProvider && (
              <div className="pt-2 border-t border-white/5">
                <button
                  type="button"
                  onClick={handleOAuthConnect}
                  disabled={isPending}
                  className="w-full py-1.5 px-3 rounded-sm bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white text-xs font-medium transition-colors flex items-center justify-center gap-2 border border-white/5 disabled:opacity-50 cursor-pointer"
                >
                  <img src="/logos/intercom.svg" alt="Intercom" className="w-3.5 h-3.5 object-contain" />
                  <span>Or Connect with Intercom OAuth</span>
                </button>
              </div>
            )}
          </form>
        )}
      </div>
    </div>
  )
}

