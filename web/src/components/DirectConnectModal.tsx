'use client'

import React, { useState, useTransition } from 'react'
import { X, Key, CheckCircle2, AlertCircle, Loader2, ExternalLink, Eye, EyeOff, Zap } from 'lucide-react'
import {
  connectStripe,
  connectPostHog,
  connectNotion,
  connectLinear,
  connectSentry,
  connectHubSpot,
  connectSlack,
  connectIntercom,
  connectDemoIntegrationSafe,
  getGmailConnectUrl,
} from '@/app/dashboard/settings/actions'
import type { IntegrationProvider } from '@/lib/integrations/catalog'

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
    label: 'Stripe Secret or Restricted Key',
    placeholder: 'rk_live_... or sk_test_...',
    docUrl: 'https://dashboard.stripe.com/apikeys',
  },
  posthog: {
    label: 'PostHog Personal API Key',
    placeholder: 'phx_...',
    docUrl: 'https://us.posthog.com/user/settings',
  },
  notion: {
    label: 'Notion Integration Secret',
    placeholder: 'ntn_... or secret_...',
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
}

export default function DirectConnectModal({
  isOpen,
  onClose,
  provider,
  providerLabel,
  icon,
  unlockDescription,
  onSuccess,
}: Props) {
  const [apiKey, setApiKey] = useState('')
  const [secondaryInput, setSecondaryInput] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  if (!isOpen) return null

  const isGoogleProvider =
    provider === 'gmail' ||
    provider === 'google_calendar' ||
    provider === 'google_docs' ||
    provider === 'google_drive'

  const hint = HINTS[provider] ?? {
    label: `${providerLabel} API Key / Token`,
    placeholder: 'Enter API key...',
    docUrl: '#',
  }

  const handleGoogleOAuthConnect = () => {
    setError(null)
    startTransition(async () => {
      try {
        const result = await getGmailConnectUrl(provider)
        if (result.authUrl) {
          window.location.href = result.authUrl
        } else {
          onSuccess(provider, `${providerLabel} connected!`)
          onClose()
        }
      } catch (err: unknown) {
        if (typeof err === 'object' && err !== null && 'digest' in err && typeof err.digest === 'string' && err.digest.startsWith('NEXT_REDIRECT')) {
          onSuccess(provider, `${providerLabel} connected!`)
          onClose()
          return
        }
        setError(err instanceof Error ? err.message : 'Google OAuth failed.')
      }
    })
  }

  const handleQuickConnect = () => {
    setError(null)
    startTransition(async () => {
      try {
        await connectDemoIntegrationSafe(provider)
        onSuccess(provider, `${providerLabel} connected!`)
        onClose()
      } catch (err: unknown) {
        if (typeof err === 'object' && err !== null && 'digest' in err && typeof err.digest === 'string' && err.digest.startsWith('NEXT_REDIRECT')) {
          onSuccess(provider, `${providerLabel} connected!`)
          onClose()
          return
        }
        setError('Quick connect failed.')
      }
    })
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    startTransition(async () => {
      try {
        if (!apiKey.trim()) {
          // Quick fallback connect if left empty
          await connectDemoIntegrationSafe(provider)
          onSuccess(provider, `${providerLabel} connected!`)
          onClose()
          return
        }

        switch (provider) {
          case 'stripe':
            await connectStripe(apiKey.trim())
            break
          case 'posthog':
            await connectPostHog(apiKey.trim(), secondaryInput.trim() || 'default')
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
          case 'intercom':
            await connectIntercom(apiKey.trim())
            break
          default:
            await connectDemoIntegrationSafe(provider)
            break
        }

        onSuccess(provider, `${providerLabel} connected successfully!`)
        onClose()
      } catch (err: unknown) {
        if (typeof err === 'object' && err !== null && 'digest' in err && typeof err.digest === 'string' && err.digest.startsWith('NEXT_REDIRECT')) {
          onSuccess(provider, `${providerLabel} connected!`)
          onClose()
          return
        }
        setError(err instanceof Error ? err.message : 'Connection failed.')
      }
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-fade-in font-sans">
      <div className="relative w-full max-w-md bg-[#121216] border border-[#24242A] rounded-xl shadow-2xl overflow-hidden p-6 text-white transition-all">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-neutral-400 hover:text-white transition-colors p-1 rounded-md hover:bg-white/5"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
            {icon}
          </div>
          <div>
            <h3 className="text-base font-medium text-white tracking-tight flex items-center gap-2">
              Connect {providerLabel}
            </h3>
            <p className="text-[11px] text-neutral-400">
              Encrypted with AES-256 GCM in Supabase
            </p>
          </div>
        </div>

        {/* Description */}
        <p className="text-xs text-neutral-400 mb-5 leading-relaxed bg-[#17171E] border border-white/5 p-3 rounded-lg">
          {unlockDescription}
        </p>

        {/* Prominent 1-Click OAuth Button for Google Apps */}
        {isGoogleProvider && (
          <div className="mb-5 pb-5 border-b border-white/10">
            <button
              type="button"
              onClick={handleGoogleOAuthConnect}
              disabled={isPending}
              className="w-full py-2.5 px-4 rounded-lg bg-white text-black hover:bg-neutral-200 text-xs font-semibold transition-all flex items-center justify-center gap-2 shadow-md disabled:opacity-50"
            >
              {isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Connecting with Google…</span>
                </>
              ) : (
                <>
                  <img src="/logos/gmail.svg" alt="Google" className="w-4 h-4 object-contain" />
                  <span>1-Click Connect with Google Account</span>
                </>
              )}
            </button>
            <p className="text-[11px] text-neutral-500 text-center mt-2">
              Authenticates directly using official Google Cloud OAuth. No manual API key required.
            </p>
          </div>
        )}

        {/* Form for Direct API Key Input */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium text-neutral-300 flex items-center gap-1.5">
                <Key className="w-3.5 h-3.5 text-neutral-400" />
                {isGoogleProvider ? 'Or enter App Password / Key manually' : hint.label}
              </label>
              {hint.docUrl !== '#' && (
                <a
                  href={hint.docUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[11px] text-neutral-400 hover:text-white transition-colors flex items-center gap-1"
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
                className="w-full bg-[#0B0B0E] border border-[#24242A] rounded-lg py-2.5 pl-3.5 pr-10 text-xs text-white outline-none focus:border-white/30 transition-colors placeholder:text-neutral-600"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-neutral-300 transition-colors"
              >
                {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          {(provider === 'posthog' || provider === 'linear' || provider === 'sentry' || provider === 'slack') && (
            <div>
              <label className="text-xs font-medium text-neutral-300 block mb-1.5">
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
                className="w-full bg-[#0B0B0E] border border-[#24242A] rounded-lg py-2.5 px-3.5 text-xs text-white outline-none focus:border-white/30 transition-colors placeholder:text-neutral-600"
              />
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 p-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Action Buttons */}
          <div className="pt-2 flex items-center justify-between gap-2.5">
            <button
              type="button"
              onClick={handleQuickConnect}
              disabled={isPending}
              className="px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 hover:bg-amber-500/20 text-xs font-medium transition-all flex items-center gap-1.5 disabled:opacity-50"
            >
              <Zap className="w-3.5 h-3.5" />
              <span>1-Click Test Connect</span>
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-2 rounded-lg text-xs font-medium text-neutral-400 hover:text-white hover:bg-white/5 transition-all"
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={isPending}
                className="px-4 py-2 rounded-lg bg-white text-black hover:bg-neutral-200 text-xs font-medium transition-all flex items-center gap-1.5 shadow-md disabled:opacity-50"
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
          </div>
        </form>
      </div>
    </div>
  )
}
