'use client'

import { useEffect, useState } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import { useParams, useRouter } from 'next/navigation'

type AccountDetail = {
  id: string
  name: string
  segment: string | null
  plan_name: string | null
  account_status: string
  mrr_cents: number
  risk_level: string
  risk_score: number
  usage_delta_percent: number
  open_issue: string | null
  next_action: string | null
  summary: string | null
  last_touch_at: string | null
  renewal_at: string | null
}

type TimelineEvent = {
  id: string
  event_type: string
  headline: string
  detail: string | null
  source: string | null
  event_at: string | null
  created_at: string
}

type Signal = {
  id: string
  signal_type: string
  headline: string
  detail: string | null
  next_step: string | null
  risk_level: string
  evidence: string[] | null
  created_at: string
}

type Contact = {
  email: string
  name: string | null
  is_primary: boolean
  external_ids: Record<string, unknown> | null
}

type Draft = {
  id: string
  draft_type: string
  subject: string
  body_preview: string
  status: string
  due_label: string | null
  created_at: string
}

function getRiskColor(risk: string) {
  switch (risk?.toLowerCase()) {
    case 'high':
      return { border: '#5b1d1d', bg: '#1b0f11', text: '#ffb0b9' }
    case 'medium':
      return { border: '#5a4720', bg: '#19140c', text: '#f2c979' }
    default:
      return { border: '#1f4633', bg: '#0f1713', text: '#8dd6a7' }
  }
}

function formatCents(cents: number) {
  return `$${(cents / 100).toLocaleString()}`
}

function timeAgo(dateStr: string | null) {
  if (!dateStr) return 'Never'
  const diff = Date.now() - new Date(dateStr).getTime()
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  if (days === 0) return 'Today'
  if (days === 1) return '1 day ago'
  return `${days} days ago`
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function getStatusColor(status: string) {
  switch (status) {
    case 'needs_review':
      return { bg: '#19140c', text: '#f2c979', border: '#5a4720' }
    case 'ready_to_send':
      return { bg: '#0f1713', text: '#8dd6a7', border: '#1f4633' }
    case 'sent':
      return { bg: '#111521', text: '#aeb9d9', border: '#2f3546' }
    default:
      return { bg: '#111', text: '#999', border: '#333' }
  }
}

export default function AccountDetailPage() {
  const params = useParams()
  const router = useRouter()
  const accountId = params.id as string

  const [account, setAccount] = useState<AccountDetail | null>(null)
  const [timeline, setTimeline] = useState<TimelineEvent[]>([])
  const [signals, setSignals] = useState<Signal[]>([])
  const [contacts, setContacts] = useState<Contact[]>([])
  const [drafts, setDrafts] = useState<Draft[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      )

      const [accountRes, timelineRes, signalsRes, contactsRes, draftsRes] = await Promise.all([
        supabase
          .from('customer_accounts')
          .select('*')
          .eq('id', accountId)
          .single(),
        supabase
          .from('account_timeline')
          .select('id, event_type, headline, detail, source, event_at, created_at')
          .eq('customer_account_id', accountId)
          .order('created_at', { ascending: false })
          .limit(30),
        supabase
          .from('account_signals')
          .select('id, signal_type, headline, detail, next_step, risk_level, evidence, created_at')
          .eq('customer_account_id', accountId)
          .order('created_at', { ascending: false })
          .limit(10),
        supabase
          .from('account_contacts')
          .select('email, name, is_primary, external_ids')
          .eq('customer_account_id', accountId)
          .order('is_primary', { ascending: false }),
        supabase
          .from('follow_up_drafts')
          .select('id, draft_type, subject, body_preview, status, due_label, created_at')
          .eq('customer_account_id', accountId)
          .neq('status', 'sent')
          .order('created_at', { ascending: false })
          .limit(5),
      ])

      if (accountRes.data) setAccount(accountRes.data as AccountDetail)
      if (timelineRes.data) setTimeline(timelineRes.data as TimelineEvent[])
      if (signalsRes.data) setSignals(signalsRes.data as Signal[])
      if (contactsRes.data) setContacts(contactsRes.data as Contact[])
      if (draftsRes.data) setDrafts(draftsRes.data as Draft[])
      setLoading(false)
    }

    load()
  }, [accountId])

  if (loading) {
    return (
      <div style={{ padding: '48px', color: '#9a9aa4' }}>
        <div style={{ fontSize: 14, opacity: 0.6 }}>Loading account...</div>
      </div>
    )
  }

  if (!account) {
    return (
      <div style={{ padding: '48px', color: '#9a9aa4' }}>
        <div style={{ fontSize: 14 }}>Account not found.</div>
        <button
          onClick={() => router.push('/dashboard/accounts')}
          style={{ marginTop: 12, color: '#6366f1', background: 'none', border: 'none', cursor: 'pointer', fontSize: 14 }}
        >
          ← Back to accounts
        </button>
      </div>
    )
  }

  const risk = getRiskColor(account.risk_level)

  return (
    <div style={{ padding: '40px 48px', maxWidth: 1200, color: '#fff' }}>
      {/* Back nav */}
      <button
        onClick={() => router.push('/dashboard/accounts')}
        style={{
          color: '#9a9aa4',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          fontSize: 13,
          marginBottom: 24,
          padding: 0,
        }}
      >
        ← Back to accounts
      </button>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 8 }}>
        <h1 style={{ fontSize: 28, fontWeight: 600, margin: 0 }}>{account.name}</h1>
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            padding: '4px 10px',
            borderRadius: 6,
            border: `1px solid ${risk.border}`,
            background: risk.bg,
            color: risk.text,
          }}
        >
          {account.risk_level} risk
        </span>
      </div>

      {account.summary && (
        <p style={{ color: '#d9d9df', fontSize: 14, marginTop: 4, marginBottom: 24, lineHeight: 1.5 }}>
          {account.summary}
        </p>
      )}

      {/* Key Metrics Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 32 }}>
        {[
          { label: 'MRR', value: formatCents(account.mrr_cents) },
          { label: 'Risk Score', value: `${account.risk_score}/100` },
          { label: 'Usage Δ', value: `${account.usage_delta_percent > 0 ? '+' : ''}${account.usage_delta_percent}%` },
          { label: 'Last Touch', value: timeAgo(account.last_touch_at) },
          { label: 'Renewal', value: account.renewal_at ? timeAgo(account.renewal_at) : 'No date' },
          { label: 'Status', value: account.account_status },
        ].map((m) => (
          <div
            key={m.label}
            style={{
              background: '#0f0f10',
              border: '1px solid rgba(255,255,255,0.04)',
              borderRadius: 14,
              padding: '16px 18px',
            }}
          >
            <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.22em', color: '#6d6d76', marginBottom: 6 }}>
              {m.label}
            </div>
            <div style={{ fontSize: 18, fontWeight: 600, color: '#fff' }}>{m.value}</div>
          </div>
        ))}
      </div>

      {/* Two-column layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        {/* Left: Signals + Contacts */}
        <div>
          {/* Active Signals */}
          <h2 style={{ fontSize: 14, fontWeight: 600, color: '#d9d9df', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.12em' }}>
            Active Signals ({signals.length})
          </h2>
          {signals.length === 0 ? (
            <div style={{ color: '#6d6d76', fontSize: 13, marginBottom: 24 }}>No active signals.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
              {signals.map((s) => {
                const sc = getRiskColor(s.risk_level)
                return (
                  <div
                    key={s.id}
                    style={{
                      background: '#0f0f10',
                      border: `1px solid ${sc.border}`,
                      borderLeft: `3px solid ${sc.text}`,
                      borderRadius: 12,
                      padding: '14px 16px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.15em', color: sc.text }}>
                        {s.signal_type}
                      </span>
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 500, color: '#fff', marginBottom: 4 }}>{s.headline}</div>
                    {s.detail && <div style={{ fontSize: 13, color: '#9a9aa4', lineHeight: 1.4 }}>{s.detail}</div>}
                    {s.next_step && (
                      <div style={{ fontSize: 12, color: '#6366f1', marginTop: 6 }}>→ {s.next_step}</div>
                    )}
                    {s.evidence && s.evidence.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 8 }}>
                        {s.evidence.map((e, i) => (
                          <span
                            key={i}
                            style={{
                              fontSize: 11,
                              padding: '2px 8px',
                              borderRadius: 6,
                              background: 'rgba(255,255,255,0.04)',
                              color: '#9a9aa4',
                            }}
                          >
                            {e}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* Contacts */}
          <h2 style={{ fontSize: 14, fontWeight: 600, color: '#d9d9df', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.12em' }}>
            Contacts ({contacts.length})
          </h2>
          {contacts.length === 0 ? (
            <div style={{ color: '#6d6d76', fontSize: 13, marginBottom: 24 }}>No contacts linked.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
              {contacts.map((c) => (
                <div
                  key={c.email}
                  style={{
                    background: '#0f0f10',
                    border: '1px solid rgba(255,255,255,0.04)',
                    borderRadius: 10,
                    padding: '10px 14px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <div>
                    <div style={{ fontSize: 14, color: '#fff' }}>{c.name || c.email}</div>
                    <div style={{ fontSize: 12, color: '#6d6d76' }}>{c.email}</div>
                  </div>
                  {c.is_primary && (
                    <span style={{ fontSize: 10, color: '#8dd6a7', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                      Primary
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Pending Drafts */}
          {drafts.length > 0 && (
            <>
              <h2 style={{ fontSize: 14, fontWeight: 600, color: '#d9d9df', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.12em' }}>
                Pending Drafts ({drafts.length})
              </h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {drafts.map((d) => {
                  const dc = getStatusColor(d.status)
                  return (
                    <div
                      key={d.id}
                      style={{
                        background: '#0f0f10',
                        border: '1px solid rgba(255,255,255,0.06)',
                        borderRadius: 12,
                        padding: '14px 16px',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                        <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#6d6d76' }}>
                          {d.draft_type.replace(/_/g, ' ')}
                        </span>
                        <span
                          style={{
                            fontSize: 10,
                            padding: '2px 8px',
                            borderRadius: 6,
                            border: `1px solid ${dc.border}`,
                            background: dc.bg,
                            color: dc.text,
                          }}
                        >
                          {d.status.replace(/_/g, ' ')}
                        </span>
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 500, color: '#fff', marginBottom: 4 }}>{d.subject}</div>
                      <div style={{ fontSize: 12, color: '#9a9aa4', lineHeight: 1.3 }}>
                        {d.body_preview.slice(0, 120)}...
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>

        {/* Right: Timeline */}
        <div>
          <h2 style={{ fontSize: 14, fontWeight: 600, color: '#d9d9df', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.12em' }}>
            Timeline ({timeline.length})
          </h2>
          {timeline.length === 0 ? (
            <div style={{ color: '#6d6d76', fontSize: 13 }}>No timeline events yet.</div>
          ) : (
            <div style={{ position: 'relative', paddingLeft: 20 }}>
              {/* Vertical line */}
              <div
                style={{
                  position: 'absolute',
                  left: 5,
                  top: 8,
                  bottom: 8,
                  width: 1,
                  background: 'rgba(255,255,255,0.06)',
                }}
              />
              {timeline.map((event) => (
                <div key={event.id} style={{ position: 'relative', marginBottom: 16 }}>
                  {/* Dot */}
                  <div
                    style={{
                      position: 'absolute',
                      left: -18,
                      top: 6,
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background:
                        event.event_type === 'email_sent' ? '#8dd6a7'
                        : event.event_type === 'billing' ? '#ffb0b9'
                        : event.event_type === 'usage' ? '#f2c979'
                        : '#6d6d76',
                    }}
                  />
                  <div
                    style={{
                      background: '#0f0f10',
                      border: '1px solid rgba(255,255,255,0.04)',
                      borderRadius: 10,
                      padding: '10px 14px',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#6d6d76' }}>
                        {event.source ?? event.event_type}
                      </span>
                      <span style={{ fontSize: 11, color: '#555' }}>
                        {formatDate(event.event_at ?? event.created_at)}
                      </span>
                    </div>
                    <div style={{ fontSize: 13, color: '#d9d9df' }}>{event.headline}</div>
                    {event.detail && (
                      <div style={{ fontSize: 12, color: '#6d6d76', marginTop: 4, lineHeight: 1.3 }}>
                        {event.detail.slice(0, 150)}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
