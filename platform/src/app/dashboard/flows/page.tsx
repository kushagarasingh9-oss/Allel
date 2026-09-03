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
          <button onClick={() => void refresh()} className="flex items-center gap-2 rounded-lg border border-white/[0.08] bg-[#141416] px-3 py-1.5 text-xs font-medium text-zinc-400 hover:text-white hover:border-white/20 transition-all shadow-xs">
            <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} /> Refresh
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
            label="Strict Recovered"
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
          <div className="flex items-center gap-1.5 rounded-sm border border-white/10 bg-[#111114] p-1 shadow-xs">
            {['all', 'awaiting_approval', 'monitoring', 'resolved'].map(status => (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={`rounded-sm px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
                  statusFilter === status
                    ? 'bg-white text-black font-semibold shadow-xs'
                    : 'text-zinc-400 hover:text-white hover:bg-white/[0.04]'
                }`}
              >
                {formatStatus(status)}
              </button>
            ))}
          </div>
          <label className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500" />
            <input
              value={searchQuery}
              onChange={event => setSearchQuery(event.target.value)}
              placeholder="Filter live cases..."
              className="rounded-sm border border-white/10 bg-[#111114] py-2 pl-9 pr-4 text-xs text-white outline-none focus:border-white/20 transition-colors placeholder:text-zinc-500 shadow-xs"
            />
          </label>
        </div>

        <div className="overflow-hidden rounded-sm border border-white/10 bg-[#111114] shadow-xs">
          <table className="w-full text-left text-xs">
            <thead className="bg-white/[0.02] border-b border-white/[0.06] text-[11px] font-medium uppercase tracking-[0.12em] text-zinc-500">
              <tr><th className="p-3.5">Account</th><th className="p-3.5">Trigger</th><th className="p-3.5">Risk</th><th className="p-3.5">MRR</th><th className="p-3.5">Status</th><th className="p-3.5 text-right">Inspect</th></tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {filteredCases.map(item => (
                <tr key={item.id} className="hover:bg-white/[0.02] transition-colors">
                  <td className="p-3.5 font-medium text-white">{accountName(item)}</td>
                  <td className="p-3.5"><div className="capitalize text-zinc-300 font-medium">{item.trigger_provider}</div><div className="text-zinc-500 text-[11px]">{formatStatus(item.trigger_event_type)}</div></td>
                  <td className="p-3.5"><div className="capitalize font-medium">{item.severity}</div><div className="text-zinc-500 text-[11px]">{item.risk_score}/100 · {(item.score_confidence * 100).toFixed(0)}% confidence</div></td>
                  <td className="p-3.5 font-medium text-white">{formatMoney(item.mrr_baseline_cents)}</td>
                  <td className="p-3.5 capitalize text-zinc-300">{formatStatus(item.status)}</td>
                  <td className="p-3.5 text-right">
                    <button
                      onClick={() => void loadCaseDetail(item.id)}
                      className="rounded-sm border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-white hover:bg-white/[0.08] hover:border-white/20 transition-colors"
                    >
                      Inspect
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && filteredCases.length === 0 && <div className="p-12 text-center text-sm text-zinc-500">No live recovery cases match this view.</div>}
          {loading && <div className="flex items-center justify-center gap-2 p-12 text-sm text-zinc-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading live cases</div>}
        </div>
      </div>

      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-xs" onClick={() => setSelected(null)}>
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-sm border border-white/10 bg-[#111114] p-6 shadow-2xl" onClick={event => event.stopPropagation()}>
            <div className="mb-6 flex items-start justify-between">
              <div>
                <h2 className="text-lg font-semibold text-white">{selected.account?.name || accountName(selected.case)}</h2>
                <p className="text-xs text-zinc-500 mt-0.5">Case {selected.case.id}</p>
              </div>
              <button
                onClick={() => setSelected(null)}
                className="rounded-sm border border-white/10 px-2.5 py-1 text-xs text-zinc-400 hover:text-white hover:bg-white/5 transition-colors"
              >
                Close
              </button>
            </div>

            <DetailSection title="Evidence"><pre className="whitespace-pre-wrap text-xs text-zinc-400 font-mono">{JSON.stringify(selected.case.evidence_snapshot || [], null, 2)}</pre></DetailSection>
            <DetailSection title="Canonical features"><div className="grid grid-cols-2 gap-2 text-xs"><Fact label="Payment failures (30d)" value={selected.features?.failed_payment_count_30d ?? '—'} /><Fact label="Usage change" value={selected.features?.usage_delta_percent == null ? '—' : `${selected.features.usage_delta_percent}%`} /><Fact label="Unreplied outbound" value={selected.features?.unreplied_outbound_count ?? '—'} /><Fact label="Last successful payment" value={selected.features?.last_payment_succeeded_at ? new Date(selected.features.last_payment_succeeded_at).toLocaleString() : '—'} /></div></DetailSection>
            <DetailSection title="Contacts">{selected.contacts.length ? selected.contacts.map(contact => <div key={contact.email} className="mb-1 text-xs text-zinc-300">{contact.email} {contact.is_primary ? '· primary' : ''} {contact.is_provisional ? '· provisional' : '· verified contact'}</div>) : <p className="text-xs text-zinc-500">No linked contacts.</p>}</DetailSection>
            <DetailSection title="Drafts">{selected.drafts.length ? selected.drafts.map(draft => <div key={draft.id} className="mb-3 rounded-sm border border-white/10 bg-black/30 p-3.5"><div className="font-medium text-white">{draft.subject}</div><div className="mt-1 text-xs text-zinc-400">{draft.body_preview}</div><div className="mt-3 flex items-center justify-between text-xs"><span className="capitalize text-zinc-500">{formatStatus(draft.status)}</span>{draft.status === 'needs_review' && <button disabled={approving === draft.id} onClick={() => void approveDraft(draft.id, selected.case.id)} className="rounded-sm bg-white px-3 py-1.5 font-medium text-black disabled:opacity-50 hover:bg-zinc-200 transition-colors">{approving === draft.id ? 'Approving…' : 'Approve only'}</button>}</div></div>) : <p className="text-xs text-zinc-500">No draft linked to this case.</p>}</DetailSection>
            <DetailSection title="Workflow jobs">{selected.jobs.length ? selected.jobs.map(job => <div key={job.id} className="mb-1.5 flex justify-between text-xs"><span>{formatStatus(job.job_type)}</span><span className={job.status === 'dead_letter' ? 'text-red-300 font-medium' : 'text-zinc-500'}>{formatStatus(job.status)}</span></div>) : <p className="text-xs text-zinc-500">No jobs linked to this case.</p>}</DetailSection>
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
    <div className="rounded-sm border border-white/10 bg-[#111114] p-5 shadow-xs transition-colors hover:border-white/20">
      <div className="text-[12px] font-medium uppercase tracking-[0.14em] text-zinc-400">
        {label}
      </div>
      <div className="mt-3 text-[30px] sm:text-[34px] font-medium tracking-tight text-white leading-none">
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
