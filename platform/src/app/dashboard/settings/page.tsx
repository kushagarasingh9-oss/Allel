'use client'

/**
 * Settings Page (Integrations) — Client component
 *
 * Reads live connection status from the DB and wires Connect/Disconnect
 * buttons to real server actions + PipedreamConnectButton for OAuth.
 */

import { useEffect, useState, useTransition, useCallback } from 'react'
import { createClient } from '@/foundation/database/client'
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
import DirectConnectModal from '@/ui/integrations/DirectConnectModal'
import { disconnectIntegration, getConnectedProvidersAction } from './actions'
import {
  INTEGRATION_DEFINITIONS,
  type IntegrationConnectMethod,
  type IntegrationProvider,
} from '@/integrations/catalog'

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
      <path fill="#0052CC" d="M11.53 2c0 2.4 1.97 4.35 4.35 4.35h3.58v3.58c0 2.4 1.97 4.35 4.35 4.35V2h-12.28z" />
      <path fill="#2684FF" d="M6.88 6.64c0 2.4 1.97 4.35 4.35 4.35h3.58v3.58c0 2.4 1.97 4.35 4.35 4.35V6.64H6.88z" />
      <path fill="#0052CC" d="M2.23 11.28c0 2.4 1.97 4.35 4.35 4.35h3.58v3.58c0 2.4 1.97 4.35 4.35 4.35v-12.28H2.23z" />
    </svg>
  ),
  zendesk: <SiZendesk className="w-5 h-5 text-[#03363D]" />,
  salesforce: (
    <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
      <path fill="#00A1E0" d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z" />
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

const CATEGORIES: Record<string, string> = {
  stripe: 'Billing & Telemetry',
  posthog: 'Billing & Telemetry',
  intercom: 'CRM & Support',
  hubspot: 'CRM & Support',
  zendesk: 'CRM & Support',
  salesforce: 'CRM & Support',
  linear: 'Engineering',
  sentry: 'Engineering',
  jira: 'Engineering',
  github: 'Engineering',
  supabase: 'Engineering',
  gmail: 'Team & Workspace',
  slack: 'Team & Workspace',
  google_calendar: 'Team & Workspace',
  notion: 'Team & Workspace',
  airtable: 'Team & Workspace',
  google_docs: 'Team & Workspace',
  google_drive: 'Team & Workspace',
}

export default function SettingsPage() {
  const [userId, setUserId] = useState<string | null>(null)
  const [connectedProviders, setConnectedProviders] = useState<Set<string>>(new Set())
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
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
        const result = await disconnectIntegration(provider)
        if (result.success) {
          setConnectedProviders((prev) => {
            const next = new Set(prev)
            next.delete(provider)
            return next
          })
          setToastMessage({ type: 'success', text: result.message ?? `${provider} disconnected.` })
        } else {
          setToastMessage({ type: 'error', text: result.error ?? `Failed to disconnect ${provider}.` })
        }
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

  const filtered = INTEGRATIONS.filter((app) => {
    const matchesSearch =
      !searchQuery.trim() ||
      app.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      app.description.toLowerCase().includes(searchQuery.toLowerCase())
    if (!matchesSearch) return false

    if (selectedCategory === 'connected') {
      return connectedProviders.has(app.provider)
    }
    if (selectedCategory !== 'all') {
      return CATEGORIES[app.provider] === selectedCategory
    }
    return true
  }).sort((a, b) => {
    // 1. Connected tools always come first
    const aConn = connectedProviders.has(a.provider) ? 1 : 0
    const bConn = connectedProviders.has(b.provider) ? 1 : 0
    if (bConn !== aConn) return bConn - aConn

    // 2. Direct connect tools before coming soon
    const aDirect = a.connectMethod === 'direct' ? 1 : 0
    const bDirect = b.connectMethod === 'direct' ? 1 : 0
    if (bDirect !== aDirect) return bDirect - aDirect

    return 0
  })

  return (
    <div className="flex-1 flex flex-col h-full bg-[#0d0d0f] overflow-y-auto w-full p-8 font-sans transition-colors text-white">
      <div className="max-w-7xl mx-auto w-full">
        {/* Toast */}
        {toastMessage && (
          <div
            className={`fixed top-6 right-6 z-50 px-4 py-2.5 rounded-sm text-xs font-medium shadow-lg border transition-all duration-300 ${
              toastMessage.type === 'success'
                ? 'bg-[#101b13] border-[#10b981]/30 text-[#8dd6a7]'
                : 'bg-[#190d10] border-[#f87171]/30 text-[#ffb0b9]'
            }`}
          >
            {toastMessage.text}
            <button
              onClick={() => setToastMessage(null)}
              className="ml-3 text-zinc-400 hover:text-white transition-colors cursor-pointer"
            >
              ✕
            </button>
          </div>
        )}

        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-2.5 mb-1.5">
            <h1 className="text-[17px] font-medium tracking-tight text-white">
              Connections
            </h1>
            <IconPlugConnected className="w-4 h-4 text-zinc-400" stroke={1.75} />
          </div>
          <p className="text-xs text-zinc-400">
            Connect your stack via Direct API keys. Scoped read-only access with KMS encryption.
          </p>
        </div>

        {/* Category Filter Tabs + Search Row */}
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1 p-0.5 rounded-sm border border-white/10 bg-[#0c0c0e]">
            {[
              { id: 'all', label: 'All' },
              { id: 'connected', label: `Connected (${connectedProviders.size})` },
              { id: 'Billing & Telemetry', label: 'Billing & Telemetry' },
              { id: 'CRM & Support', label: 'CRM & Support' },
              { id: 'Engineering', label: 'Engineering' },
              { id: 'Team & Workspace', label: 'Team & Workspace' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setSelectedCategory(tab.id)}
                className={`rounded-xs px-2.5 py-1 text-xs font-medium transition-all cursor-pointer select-none ${
                  selectedCategory === tab.id
                    ? 'bg-white/[0.08] text-white shadow-xs'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.02]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <label className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search connections..."
              className="rounded-sm border border-white/10 bg-[#0c0c0e] py-1.5 pl-8 pr-3 text-xs text-white outline-none focus:border-white/20 transition-colors placeholder:text-zinc-500"
            />
          </label>
        </div>

        {/* Vertically Compact, Edgy Integration Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((app) => {
            const isConnected = connectedProviders.has(app.provider)
            const isDisconnecting = disconnectingProvider === app.provider

            return (
              <div
                key={app.provider}
                className="bg-[#101012] border border-white/[0.08] rounded-sm p-3 hover:border-white/20 transition-all group flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-1.5 gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-5 h-5 flex items-center justify-center shrink-0">
                        {app.icon}
                      </div>
                      <h3 className="text-xs font-medium text-white tracking-tight truncate">
                        {app.name}
                      </h3>
                    </div>

                    {isConnected ? (
                      <div className="flex items-center gap-1.5 shrink-0">
                        <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-xs bg-emerald-500/10 border border-emerald-500/20">
                          <div className="w-1 h-1 rounded-full bg-emerald-400 animate-pulse" />
                          <span className="text-emerald-400 text-[9px] font-medium tracking-wide">
                            Connected
                          </span>
                        </div>
                        <button
                          onClick={() => handleDisconnect(app.provider)}
                          disabled={isDisconnecting || isPending}
                          className="text-[10px] font-medium text-zinc-500 hover:text-red-400 transition-colors disabled:opacity-50 cursor-pointer"
                        >
                          {isDisconnecting ? '…' : 'Disconnect'}
                        </button>
                      </div>
                    ) : app.connectMethod === 'coming_soon' ? (
                      <span className="px-2 py-0.5 rounded-xs text-[9px] font-medium text-zinc-500 bg-white/[0.03] border border-white/[0.06] shrink-0">
                        Soon
                      </span>
                    ) : (
                      <button
                        onClick={() => setConnectingModalApp(app)}
                        className="px-2.5 py-0.5 rounded-sm text-[11px] font-medium bg-white text-black hover:bg-zinc-200 transition-colors shadow-xs flex items-center gap-1 cursor-pointer shrink-0"
                      >
                        Connect
                      </button>
                    )}
                  </div>
                  <p className="text-[11px] text-zinc-400 leading-snug group-hover:text-zinc-300 transition-colors line-clamp-1">
                    {app.description}
                  </p>
                </div>
              </div>
            )
          })}
        </div>

        {filtered.length === 0 && (
          <div className="py-16 text-center text-xs text-zinc-500">
            No connections match this category or search query.
          </div>
        )}
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
