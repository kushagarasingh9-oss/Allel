'use client'

/**
 * Settings Page (Integrations) — Client component
 *
 * Reads live connection status from the DB and wires Connect/Disconnect
 * buttons to real server actions + PipedreamConnectButton for OAuth.
 */

import { useEffect, useState, useTransition, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Search } from 'lucide-react'
import {
  SiAirtable,
  SiNotion,
  SiGithub,
  SiGmail,
  SiGoogledocs,
  SiGoogledrive,
  SiIntercom,
  SiLinear,
  SiPosthog,
  SiStripe,
  SiGooglecalendar,
  SiSentry,
  SiHubspot,
  SiSupabase,
  SiZendesk,
} from '@icons-pack/react-simple-icons'
import { IconPlugConnected } from '@tabler/icons-react'
import DirectConnectModal from '@/components/DirectConnectModal'
import { disconnectIntegration, getConnectedProvidersAction } from './actions'
import {
  INTEGRATION_DEFINITIONS,
  type IntegrationConnectMethod,
  type IntegrationProvider,
} from '@/lib/integrations/catalog'

type IntegrationDef = {
  name: string
  provider: IntegrationProvider
  appSlug: string
  description: string
  icon: React.ReactNode
  connectMethod: IntegrationConnectMethod
  capability: 'syncable' | 'tool_only' | 'planned'
  unlockDescription: string
}

const CAPABILITY_LABELS: Record<string, { label: string; className: string }> = {
  syncable: { label: 'Auto-sync', className: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
  tool_only: { label: 'Agent tool', className: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
  planned: { label: 'Planned', className: 'bg-neutral-500/10 text-neutral-500 border-neutral-500/20' },
}

const INTEGRATION_ICONS: Partial<Record<IntegrationProvider, React.ReactNode>> = {
  slack: <img src="/logos/slack.svg" alt="Slack" className="w-5 h-5 object-contain" />,
  gmail: <img src="/logos/gmail.svg" alt="Gmail" className="w-5 h-5 object-contain" />,
  intercom: <img src="/logos/intercom.svg" alt="Intercom" className="w-5 h-5 object-contain" />,
  posthog: <img src="/logos/posthog.svg" alt="PostHog" className="w-5 h-5 object-contain" />,
  stripe: <img src="/logos/stripe.svg" alt="Stripe" className="w-5 h-5 object-contain" />,
  google_calendar: <img src="/logos/google-calendar.svg" alt="Google Calendar" className="w-5 h-5 object-contain" />,
  hubspot: <img src="/logos/hubspot.svg" alt="HubSpot" className="w-5 h-5 object-contain" />,
  linear: <img src="/logos/linear.svg" alt="Linear" className="w-5 h-5 object-contain" />,
  sentry: <img src="/logos/sentry-light.svg" alt="Sentry" className="w-5 h-5 object-contain" />,
  airtable: <img src="/logos/airtable.svg" alt="Airtable" className="w-5 h-5 object-contain" />,
  notion: <img src="/logos/notion.svg" alt="Notion" className="w-5 h-5 object-contain" />,
  supabase: <img src="/logos/supabase.svg" alt="Supabase" className="w-5 h-5 object-contain" />,
  jira: (
    <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
      <path fill="#0052CC" d="M11.53 2c0 2.4 1.97 4.35 4.35 4.35h3.58v3.58c0 2.4 1.97 4.35 4.35 4.35V2h-12.28z"/>
      <path fill="#2684FF" d="M6.88 6.64c0 2.4 1.97 4.35 4.35 4.35h3.58v3.58c0 2.4 1.97 4.35 4.35 4.35V6.64H6.88z"/>
      <path fill="#0052CC" d="M2.23 11.28c0 2.4 1.97 4.35 4.35 4.35h3.58v3.58c0 2.4 1.97 4.35 4.35 4.35v-12.28H2.23z"/>
    </svg>
  ),
  zendesk: <SiZendesk className="w-5 h-5 text-[#03363D]" />,
  salesforce: (
    <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
      <path fill="#00A1E0" d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z"/>
    </svg>
  ),
  google_docs: <SiGoogledocs className="w-5 h-5 text-[#4285F4]" />,
  google_drive: <SiGoogledrive className="w-5 h-5 text-[#1FA463]" />,
  github: <SiGithub className="w-5 h-5 text-white" />,
}

const INTEGRATIONS: IntegrationDef[] = INTEGRATION_DEFINITIONS.map((definition) => ({
  name: definition.label,
  provider: definition.provider,
  appSlug: definition.appSlug ?? definition.provider,
  description: definition.description,
  icon:
    INTEGRATION_ICONS[definition.provider] ?? (
      <IconPlugConnected className="w-5 h-5 text-neutral-300" />
    ),
  connectMethod: definition.connectMethod,
  capability: definition.capability,
  unlockDescription: definition.unlockDescription,
}))

export default function SettingsPage() {
  const [userId, setUserId] = useState<string | null>(null)
  const [connectedProviders, setConnectedProviders] = useState<Set<string>>(new Set())
  const [searchQuery, setSearchQuery] = useState('')
  const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [disconnectingProvider, setDisconnectingProvider] = useState<string | null>(null)
  const [connectingModalApp, setConnectingModalApp] = useState<IntegrationDef | null>(null)
  const [isPending, startTransition] = useTransition()

  // Load user + connection status
  useEffect(() => {
    async function load() {
      try {
        const connectedList = await getConnectedProvidersAction()
        setConnectedProviders(new Set(connectedList))
      } catch {
        // Fallback
      }
    }
    load()
  }, [])

  // Check URL params for success/error messages
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const success = params.get('success')
    const error = params.get('error')
    if (success) {
      setToastMessage({ type: 'success', text: success })
      // Clean URL
      window.history.replaceState({}, '', window.location.pathname)
    } else if (error) {
      setToastMessage({ type: 'error', text: error })
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [])

  // Auto-dismiss toast
  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => setToastMessage(null), 6000)
      return () => clearTimeout(timer)
    }
  }, [toastMessage])

  const handleDisconnect = useCallback((provider: string) => {
    setDisconnectingProvider(provider)
    startTransition(async () => {
      try {
        await disconnectIntegration(provider)
        setConnectedProviders((prev) => {
          const next = new Set(prev)
          next.delete(provider)
          return next
        })
        setToastMessage({ type: 'success', text: `${provider} disconnected.` })
      } catch {
        setToastMessage({ type: 'error', text: `Failed to disconnect ${provider}.` })
      } finally {
        setDisconnectingProvider(null)
      }
    })
  }, [])

  const handleConnectSuccess = useCallback((provider: string, message: string) => {
    setConnectedProviders((prev) => new Set([...prev, provider]))
    setToastMessage({ type: 'success', text: message })
  }, [])

  const filtered = searchQuery.trim()
    ? INTEGRATIONS.filter(
        (app) =>
          app.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          app.description.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : INTEGRATIONS

  return (
    <div className="flex-1 flex flex-col h-full bg-[#0E0E12] overflow-y-auto w-full p-10 font-sans">
      <div className="max-w-[1080px] mx-auto w-full pt-8 pb-20">
        {/* Toast */}
        {toastMessage && (
          <div
            className={`fixed top-6 right-6 z-50 px-5 py-3 rounded-lg text-[13px] font-medium shadow-lg border transition-all duration-300 ${
              toastMessage.type === 'success'
                ? 'bg-[#101b13] border-[#10b981]/30 text-[#8dd6a7]'
                : 'bg-[#190d10] border-[#f87171]/30 text-[#ffb0b9]'
            }`}
          >
            {toastMessage.text}
            <button
              onClick={() => setToastMessage(null)}
              className="ml-3 text-neutral-500 hover:text-white transition-colors"
            >
              ✕
            </button>
          </div>
        )}

        {/* Header */}
        <div className="mb-10">
          <h1 className="flex items-center text-3xl font-medium text-white mb-2 tracking-tight">
            Connections
            <IconPlugConnected className="w-7 h-7 text-neutral-400 ml-3" stroke={2} />
          </h1>
          <p className="text-[14px] text-neutral-400">
            Connect your stack via Direct API keys. Zero monthly subscriptions required.
          </p>
        </div>

        {/* Search */}
        <div className="relative mb-8">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500" />
          <input
            type="text"
            placeholder="Search connections..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[#121216] border border-[#24242A] rounded-lg py-3 pl-10 pr-4 text-[13px] text-white outline-none focus:border-white/20 transition-colors placeholder:text-neutral-500"
          />
        </div>

        {/* Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map((app) => {
            const isConnected = connectedProviders.has(app.provider)
            const isDisconnecting = disconnectingProvider === app.provider

            return (
              <div
                key={app.provider}
                className="bg-[#121216] border border-[#24242A] rounded-lg p-5 flex flex-col justify-between min-h-[170px] shadow-sm hover:border-white/20 transition-all group"
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-7 h-7 flex items-center justify-center shrink-0">
                        {app.icon}
                      </div>
                      <h3 className="text-[15px] font-medium text-white tracking-tight">
                        {app.name}
                      </h3>
                    </div>

                    {isConnected ? (
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-[#10b981]/10 border border-[#10b981]/20">
                          <div className="w-[5px] h-[5px] rounded-full bg-[#10b981] animate-pulse" />
                          <span className="text-[#10b981] text-[11px] font-medium tracking-wide">
                            Connected
                          </span>
                        </div>
                        <button
                          onClick={() => handleDisconnect(app.provider)}
                          disabled={isDisconnecting || isPending}
                          className="text-[12px] font-medium text-neutral-500 hover:text-red-400 transition-colors disabled:opacity-50"
                        >
                          {isDisconnecting ? 'Disconnecting…' : 'Disconnect'}
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConnectingModalApp(app)}
                        className="px-3 py-1.5 rounded-md text-xs font-medium bg-white text-black hover:bg-neutral-200 transition-all shadow-sm flex items-center gap-1"
                      >
                        Connect
                      </button>
                    )}
                  </div>
                  <p className="text-[13px] text-neutral-400 mt-2 leading-[1.6] group-hover:text-neutral-300 transition-colors">
                    {app.description}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Direct API Connection Modal */}
      {connectingModalApp && (
        <DirectConnectModal
          isOpen={!!connectingModalApp}
          onClose={() => setConnectingModalApp(null)}
          provider={connectingModalApp.provider}
          providerLabel={connectingModalApp.name}
          icon={connectingModalApp.icon}
          unlockDescription={connectingModalApp.unlockDescription}
          onSuccess={handleConnectSuccess}
        />
      )}
    </div>
  )
}
