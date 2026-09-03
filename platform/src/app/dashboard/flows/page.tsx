'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertCircle, CheckCircle2, Loader2, RefreshCw, Search } from 'lucide-react'

type Metrics = {
  revenueSavedFormatted: string
  protectedCents: number
  atRiskCents: number
  engagedCases: number
  productRecoveredCases: number
}

type ApiCase = {
  id: string
  customer_account_id: string
  status: string
  resolution: string | null
  severity: string
  risk_score: number
  score_confidence: number
  mrr_baseline_cents: number
  trigger_provider: string
  trigger_event_type: string
  action_reason: string | null
  evidence_snapshot: unknown[] | null
  opened_at: string
  customer_accounts: { name?: string | null; domain?: string | null } | Array<{ name?: string | null; domain?: string | null }> | null
}

type CaseDetail = {
  case: ApiCase
  account: { name?: string | null; domain?: string | null } | null
  contacts: Array<{ email: string; is_primary: boolean; is_provisional: boolean }>
  features: {
    failed_payment_count_30d: number | null
    last_payment_succeeded_at: string | null
    usage_delta_percent: number | null
    unreplied_outbound_count: number | null
  } | null
  drafts: Array<{
    id: string
    status: string
    recipient_email: string | null
    subject: string
    body_preview: string
    approved_at: string | null
    sent_at: string | null
  }>
  events: Array<{
    id: string
    event_type: string
    from_status: string | null
    to_status: string | null
    detail: string | null
    created_at: string
  }>
  jobs: Array<{
    id: string
    job_type: string
    status: string
    last_error_message: string | null
  }>
}

function accountName(item: ApiCase) {
  const relation = Array.isArray(item.customer_accounts)
    ? item.customer_accounts[0]
    : item.customer_accounts
  return relation?.name || relation?.domain || 'Unknown account'
}

function formatMoney(cents: number | null | undefined) {
  return `$${((cents ?? 0) / 100).toLocaleString()}`
}

function formatStatus(value: string) {
  return value.replaceAll('_', ' ')
}

function accountDomain(item: ApiCase) {
  const relation = Array.isArray(item.customer_accounts)
    ? item.customer_accounts[0]
    : item.customer_accounts
  return relation?.domain || null
}

function humanizeReason(item: ApiCase) {
  if (item.action_reason) return item.action_reason
  if (item.trigger_event_type === 'invoice.payment_failed') return 'Failed invoice payment'
  if (item.trigger_event_type === 'customer.subscription.deleted') return 'Subscription cancelled'
  if (item.trigger_event_type === 'customer.subscription.updated') return 'Subscription plan changed'
  if (item.trigger_event_type === 'charge.failed') return 'Payment card declined'
  if (item.trigger_event_type.includes('usage')) return 'Steep drop in usage'
  return formatStatus(item.trigger_event_type)
}

export default function WorkflowsPage() {
  const [metrics, setMetrics] = useState<Metrics | null>(null)
  const [cases, setCases] = useState<ApiCase[]>([])
  const [selected, setSelected] = useState<CaseDetail | null>(null)
  const [statusFilter, setStatusFilter] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [approving, setApproving] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)

  const loadCaseDetail = useCallback(async (caseId: string) => {
    const response = await fetch(`/api/recovery/cases/${caseId}`, { cache: 'no-store' })
    const payload = await response.json()
    if (!response.ok) throw new Error(payload.error || 'Failed to load recovery case')
    setSelected(payload as CaseDetail)
  }, [])

  const refresh = useCallback(async () => {
    setLoading(true)
    setNotice(null)
    try {
      const [casesResponse, metricsResponse] = await Promise.all([
        fetch('/api/recovery/cases?limit=100', { cache: 'no-store' }),
        fetch('/api/metrics/revenue-saved', { cache: 'no-store' }),
      ])
      const casesPayload = await casesResponse.json()
      if (!casesResponse.ok) throw new Error(casesPayload.error || 'Failed to load recovery cases')
      setCases(casesPayload.cases || [])
      if (metricsResponse.ok) setMetrics(await metricsResponse.json())
      else setMetrics(null)
    } catch (error) {
      setCases([])
      setMetrics(null)
      setNotice({ tone: 'error', text: error instanceof Error ? error.message : 'Failed to load live recovery data' })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const filteredCases = useMemo(() => cases.filter(item => {
    const statusMatches = statusFilter === 'all'
      || item.status === statusFilter
      || item.resolution === statusFilter
    const needle = searchQuery.trim().toLowerCase()
    const searchMatches = !needle
      || accountName(item).toLowerCase().includes(needle)
      || item.id.toLowerCase().includes(needle)
    return statusMatches && searchMatches
  }), [cases, searchQuery, statusFilter])

  async function approveDraft(draftId: string, caseId: string) {
    setApproving(draftId)
    setNotice(null)
    try {
      const response = await fetch(`/api/drafts/${draftId}/approve`, { method: 'PATCH' })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.error || 'Draft approval failed')
      await Promise.all([refresh(), loadCaseDetail(caseId)])
      setNotice({ tone: 'success', text: 'Draft approved. It has not been sent.' })
    } catch (error) {
      setNotice({ tone: 'error', text: error instanceof Error ? error.message : 'Draft approval failed' })
    } finally {
      setApproving(null)
    }
  }

  return (
    <div className="min-h-screen bg-[#0d0d0f] p-8 text-zinc-300">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <img
              src="/logo-icon.png"
              alt="Allel"
              className="w-5 h-5 object-contain shrink-0 mix-blend-screen bg-transparent"
              style={{ width: 20, height: 20 }}
            />
            <h1 className="text-[17px] font-medium tracking-tight text-white">Revenue Recovery</h1>
          </div>
          <button
            onClick={() => void refresh()}
            disabled={loading}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium text-zinc-400 hover:text-white hover:bg-white/[0.04] transition-colors cursor-pointer disabled:opacity-50"
            title="Refresh recovery cases"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>{loading ? 'Refreshing…' : 'Refresh'}</span>
          </button>
        </div>

        {notice && (
          <div className={`mb-5 flex items-center gap-2 rounded-xl border p-3 text-sm ${notice.tone === 'error' ? 'border-red-900/60 bg-red-950/30 text-red-200' : 'border-emerald-900/60 bg-emerald-950/30 text-emerald-200'}`}>
            {notice.tone === 'error' ? <AlertCircle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
            {notice.text}
          </div>
        )}

        <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Metric
            label="Recovered Revenue"
            value={metrics?.revenueSavedFormatted ?? '$0'}
          />
          <Metric
            label="Protected Revenue"
            value={metrics ? formatMoney(metrics.protectedCents) : '$0'}
          />
          <Metric
            label="MRR at Risk"
            value={metrics ? formatMoney(metrics.atRiskCents) : '$0'}
          />
          <Metric
            label="Engaged Cases"
            value={metrics ? String(metrics.engagedCases + metrics.productRecoveredCases) : '0'}
          />
        </div>

        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1 p-0.5 rounded-sm border border-white/10 bg-[#0c0c0e]">
            {['all', 'awaiting_approval', 'monitoring', 'resolved'].map(status => (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={`rounded-xs px-3 py-1.5 text-xs font-medium capitalize transition-all cursor-pointer select-none ${
                  statusFilter === status
                    ? 'bg-white/[0.08] text-white shadow-xs'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.02]'
                }`}
              >
                {formatStatus(status)}
              </button>
            ))}
          </div>
          <label className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500" />
            <input
              value={searchQuery}
              onChange={event => setSearchQuery(event.target.value)}
              placeholder="Filter cases..."
              className="rounded-sm border border-white/10 bg-[#0c0c0e] py-1.5 pl-8 pr-3 text-xs text-white outline-none focus:border-white/20 transition-colors placeholder:text-zinc-500"
            />
          </label>
        </div>

        <div className="overflow-hidden rounded-sm border border-white/10 bg-[#0c0c0e] shadow-xs">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-white/[0.06] bg-white/[0.01] text-[12px] font-normal text-zinc-400">
              <tr>
                <th className="px-4 py-3 font-normal">Account</th>
                <th className="px-4 py-3 font-normal">MRR at Risk</th>
                <th className="px-4 py-3 font-normal">Risk Level</th>
                <th className="px-4 py-3 font-normal">Trigger Reason</th>
                <th className="px-4 py-3 text-right font-normal">Outreach Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {filteredCases.map(item => (
                <tr key={item.id} className="hover:bg-white/[0.02] transition-colors">
                  <td className="px-4 py-3.5">
                    <div className="font-medium text-white text-[13px]">{accountName(item)}</div>
                    {accountDomain(item) && (
                      <div className="text-zinc-500 text-[11px] mt-0.5">{accountDomain(item)}</div>
                    )}
                  </td>
                  <td className="px-4 py-3.5">
                    <span className="font-medium text-white text-[13px]">{formatMoney(item.mrr_baseline_cents)}</span>
                    <span className="text-zinc-500 text-[11px]"> /mo</span>
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="inline-flex items-center gap-1.5">
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded-xs text-[10px] font-medium uppercase tracking-wider ${
                        item.severity === 'critical'
                          ? 'text-red-400 bg-red-500/10 border border-red-500/20'
                          : item.severity === 'high'
                            ? 'text-amber-400 bg-amber-500/10 border border-amber-500/20'
                            : 'text-zinc-400 bg-white/[0.04] border border-white/[0.08]'
                      }`}>
                        {item.severity}
                      </span>
                      <span className="text-zinc-500 text-[11px]">{item.risk_score}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3.5 text-zinc-300 text-xs max-w-[240px] truncate" title={item.action_reason || item.trigger_event_type}>
                    {humanizeReason(item)}
                  </td>
                  <td className="px-4 py-3.5 text-right">
                    {item.status === 'awaiting_approval' && (
                      <button
                        onClick={() => void loadCaseDetail(item.id)}
                        className="inline-flex items-center gap-1.5 rounded-sm border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-300 hover:bg-amber-500/20 transition-colors cursor-pointer"
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                        Draft Ready · Review
                      </button>
                    )}
                    {(item.status === 'sent' || item.status === 'monitoring') && (
                      <button
                        onClick={() => void loadCaseDetail(item.id)}
                        className="inline-flex items-center gap-1.5 rounded-sm border border-sky-500/20 bg-sky-500/10 px-2.5 py-1 text-xs font-medium text-sky-300 hover:bg-sky-500/20 transition-colors cursor-pointer"
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />
                        Outreach Sent · Monitoring
                      </button>
                    )}
                    {item.status === 'resolved' && (
                      <button
                        onClick={() => void loadCaseDetail(item.id)}
                        className="inline-flex items-center gap-1.5 rounded-sm border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-300 hover:bg-emerald-500/20 transition-colors cursor-pointer"
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                        {item.resolution === 'strictly_recovered' ? 'Payment Recovered' : 'Saved'}
                      </button>
                    )}
                    {item.status === 'suppressed' && (
                      <button
                        onClick={() => void loadCaseDetail(item.id)}
                        className="inline-flex items-center gap-1.5 rounded-sm border border-white/[0.06] bg-transparent px-2.5 py-1 text-xs font-normal text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer"
                      >
                        Cooling Down
                      </button>
                    )}
                    {!['awaiting_approval', 'sent', 'monitoring', 'resolved', 'suppressed'].includes(item.status) && (
                      <button
                        onClick={() => void loadCaseDetail(item.id)}
                        className="inline-flex items-center gap-1.5 rounded-sm border border-white/10 bg-white/[0.03] px-2.5 py-1 text-xs font-medium text-zinc-300 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer"
                      >
                        {formatStatus(item.status)}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && filteredCases.length === 0 && (
            <div className="py-16 text-center text-xs text-zinc-500">
              No live recovery cases match this view.
            </div>
          )}
          {loading && (
            <div className="flex items-center justify-center gap-2 py-16 text-xs text-zinc-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading live cases
            </div>
          )}
        </div>
      </div>

      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-xs" onClick={() => setSelected(null)}>
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-sm border border-white/10 bg-[#111114] p-6 shadow-2xl" onClick={event => event.stopPropagation()}>
            <div className="mb-6 flex items-start justify-between">
              <div>
                <h2 className="text-lg font-semibold text-white">{selected.account?.name || accountName(selected.case)}</h2>
                <p className="text-xs text-zinc-400 mt-0.5">
                  {formatMoney(selected.case.mrr_baseline_cents)} MRR · {humanizeReason(selected.case)}
                </p>
              </div>
              <button
                onClick={() => setSelected(null)}
                className="rounded-sm border border-white/10 px-2.5 py-1 text-xs text-zinc-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>

            {/* AI Recovery Outreach Draft */}
            <DetailSection title="AI Recovery Outreach">
              {selected.drafts.length ? selected.drafts.map(draft => (
                <div key={draft.id} className="rounded-sm border border-white/10 bg-black/30 p-4 mb-3">
                  <div className="flex items-center justify-between text-xs text-zinc-400 mb-2">
                    <span>To: <strong className="text-zinc-200">{draft.recipient_email || selected.contacts[0]?.email || 'Primary Contact'}</strong></span>
                    <span className="capitalize text-zinc-500">{formatStatus(draft.status)}</span>
                  </div>
                  <div className="font-medium text-white text-sm mb-1">{draft.subject}</div>
                  <div className="text-xs text-zinc-400 whitespace-pre-wrap leading-relaxed border-t border-white/[0.06] pt-2.5 mt-2.5">{draft.body_preview}</div>
                  <div className="mt-4 flex items-center justify-end">
                    {draft.status === 'needs_review' && (
                      <button
                        disabled={approving === draft.id}
                        onClick={() => void approveDraft(draft.id, selected.case.id)}
                        className="rounded-sm bg-white px-3.5 py-1.5 text-xs font-semibold text-black disabled:opacity-50 hover:bg-zinc-200 transition-colors cursor-pointer"
                      >
                        {approving === draft.id ? 'Approving…' : 'Approve & Queue Outreach'}
                      </button>
                    )}
                  </div>
                </div>
              )) : (
                <p className="text-xs text-zinc-500">No outreach draft queued for this case.</p>
              )}
            </DetailSection>

            <DetailSection title="Customer Contacts">
              {selected.contacts.length ? selected.contacts.map(contact => (
                <div key={contact.email} className="mb-1 text-xs text-zinc-300">
                  {contact.email} {contact.is_primary ? '· primary' : ''} {contact.is_provisional ? '· provisional' : '· verified'}
                </div>
              )) : <p className="text-xs text-zinc-500">No linked contacts.</p>}
            </DetailSection>

            <DetailSection title="Signals & Features">
              <div className="grid grid-cols-2 gap-2 text-xs">
                <Fact label="Payment failures (30d)" value={selected.features?.failed_payment_count_30d ?? '—'} />
                <Fact label="Usage change" value={selected.features?.usage_delta_percent == null ? '—' : `${selected.features.usage_delta_percent}%`} />
                <Fact label="Unreplied outbound" value={selected.features?.unreplied_outbound_count ?? '—'} />
                <Fact label="Last successful payment" value={selected.features?.last_payment_succeeded_at ? new Date(selected.features.last_payment_succeeded_at).toLocaleDateString() : '—'} />
              </div>
            </DetailSection>

            <details className="mt-4 text-xs text-zinc-500 cursor-pointer">
              <summary className="hover:text-zinc-300 transition-colors">Technical Evidence & Audit Logs</summary>
              <div className="mt-2 space-y-3">
                <pre className="whitespace-pre-wrap text-[11px] text-zinc-400 font-mono bg-black/40 p-3 rounded-sm border border-white/[0.04]">
                  {JSON.stringify(selected.case.evidence_snapshot || [], null, 2)}
                </pre>
                {selected.jobs.length > 0 && (
                  <div className="rounded-sm border border-white/[0.04] bg-black/40 p-3">
                    {selected.jobs.map(job => (
                      <div key={job.id} className="flex justify-between py-0.5">
                        <span>{formatStatus(job.job_type)}</span>
                        <span className={job.status === 'dead_letter' ? 'text-red-300' : 'text-zinc-400'}>{formatStatus(job.status)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </details>
          </div>
        </div>
      )}
    </div>
  )
}

function Metric({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <div className="rounded-sm border border-white/10 bg-[#0c0c0e] p-5 shadow-xs transition-colors hover:border-white/20">
      <div className="text-[13px] font-normal text-zinc-400">
        {label}
      </div>
      <div className="mt-2.5 text-[28px] sm:text-[32px] font-medium tracking-tight text-white leading-none">
        {value}
      </div>
    </div>
  )
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-5">
      <h3 className="mb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-zinc-500">{title}</h3>
      <div className="rounded-xl border border-white/[0.06] bg-[#0d0d0f] p-3.5">{children}</div>
    </section>
  )
}

function Fact({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg bg-white/[0.02] border border-white/[0.04] p-2.5">
      <div className="text-zinc-500 text-[11px]">{label}</div>
      <div className="mt-1 text-white font-medium">{value}</div>
    </div>
  )
}
