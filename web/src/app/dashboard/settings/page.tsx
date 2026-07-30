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
} from '@icons-pack/react-simple-icons'
import { IconPlugConnected } from '@tabler/icons-react'
import PipedreamConnectButton from '@/components/PipedreamConnectButton'
import { disconnectIntegration } from './actions'
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
  slack: <img src="/logos/slack.svg" alt="Slack" className="w-5 h-5" />,
  gmail: <SiGmail className="w-5 h-5 text-[#EA4335]" />,
  intercom: <SiIntercom className="w-5 h-5 text-[#286EFA]" />,
  posthog: <SiPosthog className="w-5 h-5 text-[#F54E00]" />,
  stripe: <SiStripe className="w-5 h-5 text-[#635BFF]" />,
  google_calendar: <SiGooglecalendar className="w-5 h-5 text-[#4285F4]" />,
  hubspot: <SiHubspot className="w-5 h-5 text-[#FF7A59]" />,
  linear: <SiLinear className="w-5 h-5 text-[#5E6AD2]" />,
  sentry: <SiSentry className="w-5 h-5 text-[#362D59]" />,
  airtable: <SiAirtable className="w-5 h-5 text-[#18BFFF]" />,
  notion: <SiNotion className="w-5 h-5 text-white" />,
  supabase: <SiSupabase className="w-5 h-5 text-[#3ECF8E]" />,
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
  const [isPending, startTransition] = useTransition()

  // Load user + connection status
  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      setUserId(user.id)

      // Resolve workspace
      const { data: membership } = await supabase
        .from('workspace_members')
        .select('workspace_id')
        .eq('user_id', user.id)
        .limit(1)
        .maybeSingle()

      const workspaceId = membership?.workspace_id
      if (!workspaceId) return

      // Fetch connected integrations for this workspace
      const { data: connections } = await supabase
        .from('integration_connections')
        .select('provider, status')
        .eq('workspace_id', workspaceId)

      if (connections) {
        const connected = new Set(
          connections
            .filter((c: { provider: string; status: string }) => c.status === 'connected')
            .map((c: { provider: string }) => c.provider)
        )
        setConnectedProviders(connected)
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

  const filtered = searchQuery.trim()
    ? INTEGRATIONS.filter(
        (app) =>
          app.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          app.description.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : INTEGRATIONS

  return (
    <div className="flex-1 flex flex-col h-full bg-[#0a0a0a] overflow-y-auto w-full p-10">
      <div className="max-w-[1080px] mx-auto w-full pt-8 pb-20">
        {/* Toast */}
        {toastMessage && (
          <div
            className={`fixed top-6 right-6 z-50 px-5 py-3 rounded-md text-[13px] font-medium shadow-lg border transition-all duration-300 ${
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
            Integrations
            <IconPlugConnected className="w-7 h-7 text-neutral-500 ml-5" stroke={2} />
          </h1>
          <p className="text-[14px] text-neutral-400">
            Connect your stack. Let your agent handle the execution.
          </p>
        </div>

        {/* Search */}
        <div className="relative mb-8">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500" />
          <input
            type="text"
            placeholder="Search integrations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[#111111] border border-[#262626] rounded-sm py-3 pl-10 pr-4 text-[13px] text-white outline-none focus:border-[#404040] transition-colors placeholder:text-neutral-500"
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
                className="bg-[#111111] border border-[#262626] rounded-sm p-6 flex flex-col min-h-[160px] shadow-sm hover:border-[#333] transition-colors group"
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-7 h-7 flex items-center justify-center shrink-0">
                      {app.icon}
                    </div>
                    <h3 className="text-[15px] font-medium text-white tracking-tight">
                      {app.name}
                    </h3>
                  </div>

                  {isConnected ? (
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-sm bg-[#10b981]/10 border border-[#10b981]/20">
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
                  ) : app.connectMethod === 'coming_soon' ? (
                    <span className="text-[11px] font-medium text-neutral-500 px-3 py-1 rounded-sm bg-[#1a1a1a] border border-[#262626]">
                      Coming soon
                    </span>
                  ) : app.connectMethod === 'pipedream' && userId ? (
                    <PipedreamConnectButton
                      provider={app.provider}
                      appSlug={app.appSlug}
                      label={app.name}
                      userId={userId}
                      isConnected={false}
                    />
                  ) : (
                    <button
                      disabled
                      className="relative px-5 py-1.5 rounded-sm overflow-hidden opacity-50 cursor-not-allowed"
                    >
                      <div className="absolute inset-0 bg-[#1c1c1c] border border-[#333] rounded-sm" />
                      <span className="relative z-10 text-[12px] font-medium text-neutral-400">
                        Loading…
                      </span>
                    </button>
                  )}
                </div>
                {/* Capability badge */}
                <div className="flex items-center gap-2 mt-2">
                  <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${CAPABILITY_LABELS[app.capability]?.className ?? ''}`}>
                    {CAPABILITY_LABELS[app.capability]?.label ?? app.capability}
                  </span>
                </div>
                <p className="text-[13px] text-neutral-400 mt-2 leading-[1.6] group-hover:text-neutral-300 transition-colors pr-2">
                  {app.description}
                </p>
                {/* Unlock description — shown when not connected */}
                {!isConnected && app.capability !== 'planned' && (
                  <p className="text-[11.5px] text-neutral-600 mt-2 leading-[1.5] group-hover:text-neutral-500 transition-colors">
                    {app.unlockDescription}
                  </p>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
