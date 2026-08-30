'use client';

import React, { useEffect, useState } from 'react';
import {
  ArrowUpRight,
  CheckCircle2,
  ExternalLink,
  Loader2,
  Mail,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  Zap,
} from 'lucide-react';

interface MetricData {
  testMode: boolean;
  currency: string;
  strictRecoveredCents: number;
  protectedCents: number;
  atRiskCents: number;
  engagedCases: number;
  productRecoveredCases: number;
  churnedCases: number;
  pendingCases: number;
  unknownCases: number;
  revenueSavedFormatted: string;
}

interface WorkflowCase {
  id: string;
  accountName: string;
  contactEmail: string;
  status: 'open' | 'awaiting_approval' | 'approved' | 'sent' | 'monitoring' | 'resolved';
  riskScore: number;
  riskSeverity: 'low' | 'medium' | 'high' | 'critical';
  triggerProvider: 'stripe' | 'posthog' | 'gmail' | 'intercom';
  triggerEventType: string;
  triggerDescription: string;
  mrrCents: number;
  resolution?: string;
  evidenceCount: number;
  evidenceIds: string[];
  canonicalFeatures: {
    paymentFailures30d: number;
    daysSinceLastPayment: number;
    usageDeclinePct: number;
    unrepliedEmails: number;
  };
  draft?: {
    id: string;
    recipient: string;
    subject: string;
    bodyFull: string;
    verified: boolean;
    approvedBy?: string;
    approvedAt?: string;
  };
  sendProvenance?: {
    sentAt?: string;
    channel: string;
  };
  attribution?: {
    outcomeType: string;
    amountCents: number;
    date: string;
  };
}

function ProviderLogo({ provider, className = 'w-3.5 h-3.5' }: { provider: string; className?: string }) {
  const p = provider.toLowerCase();
  if (p === 'stripe') {
    return <img src="/logos/stripe.svg" alt="Stripe" className={`${className} object-contain shrink-0`} />;
  }
  if (p === 'posthog') {
    return <img src="/logos/posthog.svg" alt="PostHog" className={`${className} object-contain shrink-0`} />;
  }
  if (p === 'gmail') {
    return <img src="/logos/gmail.svg" alt="Gmail" className={`${className} object-contain shrink-0`} />;
  }
  if (p === 'intercom') {
    return <img src="/logos/intercom.svg" alt="Intercom" className={`${className} object-contain shrink-0`} />;
  }
  return <Zap className={`${className} text-zinc-400 shrink-0`} />;
}

export default function WorkflowsPage() {
  const [metrics, setMetrics] = useState<MetricData | null>(null);
  const [cases, setCases] = useState<WorkflowCase[]>([]);
  const [selectedCase, setSelectedCase] = useState<WorkflowCase | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isApproving, setIsApproving] = useState<string | null>(null);
  const [approvalToast, setApprovalToast] = useState<string | null>(null);

  const INITIAL_CASES: WorkflowCase[] = [
    {
      id: 'case_rec_88392a1',
      accountName: 'Acme Logistics SaaS',
      contactEmail: 'sarah.connor@acmelogistics.io',
      status: 'resolved',
      riskScore: 88,
      riskSeverity: 'critical',
      triggerProvider: 'stripe',
      triggerEventType: 'invoice.payment_failed',
      triggerDescription: 'Monthly subscription renewal invoice failed ($4,500)',
      mrrCents: 450000,
      resolution: 'strictly_recovered',
      evidenceCount: 3,
      evidenceIds: ['evt_stripe_inv_fail_9981', 'evt_posthog_dash_zero_8812', 'evt_gmail_reply_7712'],
      canonicalFeatures: {
        paymentFailures30d: 2,
        daysSinceLastPayment: 14,
        usageDeclinePct: -65,
        unrepliedEmails: 1,
      },
      draft: {
        id: 'drf_9921820',
        recipient: 'sarah.connor@acmelogistics.io',
        subject: 'Quick check-in on Acme Logistics subscription',
        bodyFull: 'Hi Sarah, noticed the latest invoice for Acme Logistics failed processing yesterday. We have extended access for 7 days so operations are not interrupted. Could you update payment details via the portal link below?',
        verified: true,
        approvedBy: 'Founder',
        approvedAt: 'Aug 29, 2026',
      },
      sendProvenance: {
        sentAt: 'Aug 29, 2026 at 2:15 PM',
        channel: 'Connected Gmail (founder@allel.com)',
      },
      attribution: {
        outcomeType: 'Strictly Recovered',
        amountCents: 450000,
        date: 'Aug 30, 2026',
      },
    },
    {
      id: 'case_rec_77410b2',
      accountName: 'CloudScale Infra',
      contactEmail: 'devops@cloudscale.net',
      status: 'awaiting_approval',
      riskScore: 78,
      riskSeverity: 'high',
      triggerProvider: 'posthog',
      triggerEventType: 'cancellation_intent_viewed',
      triggerDescription: 'Visited billing settings and opened subscription cancel modal',
      mrrCents: 120000,
      resolution: undefined,
      evidenceCount: 2,
      evidenceIds: ['evt_posthog_cancel_click_4410'],
      canonicalFeatures: {
        paymentFailures30d: 0,
        daysSinceLastPayment: 3,
        usageDeclinePct: -42,
        unrepliedEmails: 0,
      },
      draft: {
        id: 'drf_7719283',
        recipient: 'devops@cloudscale.net',
        subject: 'Feedback regarding CloudScale cluster management',
        bodyFull: 'Hi team, noticed you visited the plan cancellation page earlier today. If latency spikes on region us-east were an issue, we just rolled out dedicated cluster isolation. Would love to help optimize your endpoints.',
        verified: true,
        approvedBy: undefined,
        approvedAt: undefined,
      },
    },
    {
      id: 'case_rec_55102c3',
      accountName: 'FinTech Pulse',
      contactEmail: 'alex@fintechpulse.co',
      status: 'resolved',
      riskScore: 65,
      riskSeverity: 'medium',
      triggerProvider: 'stripe',
      triggerEventType: 'customer.subscription.updated',
      triggerDescription: 'Cancellation at period end reversed by customer',
      mrrCents: 85000,
      resolution: 'protected',
      evidenceCount: 2,
      evidenceIds: ['evt_stripe_cancel_sched_1102', 'evt_stripe_renewal_confirm_9941'],
      canonicalFeatures: {
        paymentFailures30d: 0,
        daysSinceLastPayment: 22,
        usageDeclinePct: 0,
        unrepliedEmails: 0,
      },
      attribution: {
        outcomeType: 'Protected Revenue',
        amountCents: 85000,
        date: 'Aug 30, 2026',
      },
    },
  ];

  useEffect(() => {
    setCases(INITIAL_CASES);
    fetchData();
  }, []);

  async function fetchData() {
    try {
      const res = await fetch('/api/metrics/revenue-saved');
      if (res.ok) {
        const data = await res.json();
        setMetrics(data);
      }
    } catch (err) {
      console.error('Failed to load metrics', err);
    }
  }

  async function handleApproveCase(caseItem: WorkflowCase, e?: React.MouseEvent) {
    if (e) e.stopPropagation();
    if (!caseItem.draft) return;

    setIsApproving(caseItem.id);
    try {
      await fetch(`/api/drafts/${caseItem.draft.id}/approve`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
      }).catch(() => null);

      const nowStr = 'Just now';

      setCases((prev) =>
        prev.map((c) => {
          if (c.id === caseItem.id) {
            return {
              ...c,
              status: 'monitoring',
              draft: {
                ...c.draft!,
                approvedBy: 'Founder',
                approvedAt: nowStr,
              },
              sendProvenance: {
                sentAt: nowStr,
                channel: `Connected Gmail (${c.contactEmail})`,
              },
            };
          }
          return c;
        })
      );

      if (selectedCase && selectedCase.id === caseItem.id) {
        setSelectedCase((prev) =>
          prev
            ? {
                ...prev,
                status: 'monitoring',
                draft: {
                  ...prev.draft!,
                  approvedBy: 'Founder',
                  approvedAt: nowStr,
                },
                sendProvenance: {
                  sentAt: nowStr,
                  channel: `Connected Gmail (${prev.contactEmail})`,
                },
              }
            : null
        );
      }

      setApprovalToast(`Approved draft for ${caseItem.accountName} • Dispatched via Gmail`);
      setTimeout(() => setApprovalToast(null), 4000);
    } catch (err) {
      console.error('Approval error:', err);
    } finally {
      setIsApproving(null);
    }
  }

  const filteredCases = cases.filter((c) => {
    const matchesStatus = statusFilter === 'all' || c.status === statusFilter || c.resolution === statusFilter;
    const matchesSearch =
      c.accountName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.contactEmail.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.id.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  return (
    <div className="flex-1 min-h-screen bg-[#121214] text-zinc-300 flex flex-col overflow-y-auto font-sans select-none relative">
      {/* Toast Notification */}
      {approvalToast && (
        <div className="fixed top-5 right-5 z-50 flex items-center gap-2 px-3.5 py-2 rounded bg-[#1c1c1f] border border-white/[0.1] text-white text-xs shadow-2xl animate-in fade-in duration-150">
          <CheckCircle2 className="w-3.5 h-3.5 text-white shrink-0" />
          <span>{approvalToast}</span>
        </div>
      )}

      {/* Clean Header with Allel Logo Icon */}
      <div className="px-8 pt-7 pb-6 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <img
            src="/logo-icon.png"
            alt="Allel"
            className="w-[18px] h-[18px] object-contain shrink-0 mix-blend-screen bg-transparent translate-y-[3px]"
          />
          <h1 className="text-base font-semibold tracking-tight text-white leading-none">Revenue Recovery</h1>
        </div>

        <div className="flex items-center gap-3 text-xs">
          <button
            onClick={fetchData}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded text-zinc-400 hover:text-white hover:bg-white/[0.05] transition-colors cursor-pointer text-xs"
          >
            <RefreshCw className="w-3 h-3" />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Metrics Strip in Crisp White & Clean Neutral */}
      <div className="px-8 pb-6 grid grid-cols-2 sm:grid-cols-4 gap-6 border-b border-white/[0.05]">
        <div>
          <div className="text-[11px] text-zinc-400 font-medium">Strict Recovered</div>
          <div className="mt-1 text-2xl font-semibold tracking-tight text-white">
            {metrics ? metrics.revenueSavedFormatted : '$4,500'}
          </div>
          <div className="text-[10.5px] text-zinc-500 mt-0.5">Verified Stripe billing</div>
        </div>

        <div>
          <div className="text-[11px] text-zinc-400 font-medium">Protected Revenue</div>
          <div className="mt-1 text-2xl font-semibold tracking-tight text-white">
            ${((metrics?.protectedCents ?? 85000) / 100).toLocaleString()}
          </div>
          <div className="text-[10.5px] text-zinc-500 mt-0.5">Reversed pre-cancel</div>
        </div>

        <div>
          <div className="text-[11px] text-zinc-400 font-medium">At-Risk Monitored</div>
          <div className="mt-1 text-2xl font-semibold tracking-tight text-white">
            ${((metrics?.atRiskCents ?? 120000) / 100).toLocaleString()}
          </div>
          <div className="text-[10.5px] text-zinc-500 mt-0.5">
            {cases.filter((c) => c.status === 'awaiting_approval' || c.status === 'monitoring').length} active accounts
          </div>
        </div>

        <div>
          <div className="text-[11px] text-zinc-400 font-medium">Customer Engagement</div>
          <div className="mt-1 text-2xl font-semibold tracking-tight text-white">
            {(metrics?.engagedCases ?? 1) + (metrics?.productRecoveredCases ?? 0)}
          </div>
          <div className="text-[10.5px] text-zinc-500 mt-0.5">Verified customer replies</div>
        </div>
      </div>

      {/* Clean Tabs & Search */}
      <div className="px-8 pt-5 pb-2.5 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Minimal Text Tabs */}
        <div className="flex items-center gap-5 overflow-x-auto pb-1 sm:pb-0 text-xs">
          {[
            { id: 'all', label: 'All' },
            { id: 'awaiting_approval', label: 'Needs approval' },
            { id: 'monitoring', label: 'Monitoring' },
            { id: 'strictly_recovered', label: 'Recovered' },
            { id: 'protected', label: 'Protected' },
          ].map((tab) => {
            const isActive = statusFilter === tab.id;
            const count =
              tab.id === 'awaiting_approval'
                ? cases.filter((c) => c.status === 'awaiting_approval').length
                : null;

            return (
              <button
                key={tab.id}
                onClick={() => setStatusFilter(tab.id)}
                className={`pb-1.5 transition-colors cursor-pointer whitespace-nowrap flex items-center gap-1.5 relative ${
                  isActive ? 'text-white font-medium' : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <span>{tab.label}</span>
                {count !== null && count > 0 && (
                  <span className="px-1.5 py-0.2 rounded bg-white/[0.1] text-white text-[10px]">
                    {count}
                  </span>
                )}
                {isActive && (
                  <span className="absolute bottom-0 left-0 right-0 h-[1.5px] bg-white rounded-full" />
                )}
              </button>
            );
          })}
        </div>

        {/* Minimal Search Input */}
        <div className="relative w-full sm:w-52">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-2 text-zinc-400" />
          <input
            type="text"
            placeholder="Filter accounts..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-2.5 py-1 rounded bg-white/[0.04] hover:bg-white/[0.06] focus:bg-white/[0.08] text-xs text-white placeholder:text-zinc-400 focus:outline-none transition-colors"
          />
        </div>
      </div>

      {/* Minimalist Cases Table */}
      <div className="px-8 pb-12 flex-1">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="text-zinc-400 text-[11px] font-normal border-b border-white/[0.05]">
                <th className="py-2.5 pr-4">Account</th>
                <th className="py-2.5 px-4">Trigger & Provider</th>
                <th className="py-2.5 px-4">MRR at Risk</th>
                <th className="py-2.5 px-4">Status</th>
                <th className="py-2.5 px-4">Attribution</th>
                <th className="py-2.5 pl-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.03]">
              {filteredCases.map((c) => (
                <tr
                  key={c.id}
                  onClick={() => setSelectedCase(c)}
                  className="hover:bg-white/[0.02] transition-colors cursor-pointer group"
                >
                  {/* Account Name & Contact */}
                  <td className="py-3.5 pr-4">
                    <div className="font-medium text-white group-hover:text-white transition-colors text-xs">
                      {c.accountName}
                    </div>
                    <div className="text-[11.5px] text-zinc-400 mt-0.5">{c.contactEmail}</div>
                  </td>

                  {/* Trigger with specific Integration Logo */}
                  <td className="py-3.5 px-4">
                    <div className="flex items-center gap-1.5 text-white font-medium text-xs">
                      <ProviderLogo provider={c.triggerProvider} />
                      <span className="capitalize">{c.triggerProvider}</span>
                    </div>
                    <div className="text-[11px] text-zinc-400 mt-0.5 truncate max-w-[200px]">
                      {c.triggerEventType.replace(/[_.]/g, ' ')}
                    </div>
                  </td>

                  {/* MRR at Risk */}
                  <td className="py-3.5 px-4">
                    <div className="font-medium text-white text-xs">
                      ${(c.mrrCents / 100).toLocaleString()}
                    </div>
                    <div className="text-[11px] text-zinc-500 mt-0.5 capitalize">
                      {c.riskSeverity} priority
                    </div>
                  </td>

                  {/* Status Indicator */}
                  <td className="py-3.5 px-4">
                    <div className="flex items-center gap-1.5 text-[11.5px]">
                      <span
                        className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                          c.status === 'resolved'
                            ? 'bg-white'
                            : c.status === 'awaiting_approval'
                            ? 'bg-zinc-300 animate-pulse'
                            : 'bg-zinc-400'
                        }`}
                      />
                      <span className="text-zinc-200 capitalize font-medium">
                        {c.status.replace('_', ' ')}
                      </span>
                    </div>
                  </td>

                  {/* Attribution Outcome */}
                  <td className="py-3.5 px-4">
                    {c.resolution ? (
                      <span className="text-[11.5px] font-medium text-white capitalize">
                        {c.resolution.replace('_', ' ')}
                      </span>
                    ) : (
                      <span className="text-zinc-400">—</span>
                    )}
                  </td>

                  {/* Actions */}
                  <td className="py-3.5 pl-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {c.status === 'awaiting_approval' && (
                        <button
                          type="button"
                          onClick={(e) => handleApproveCase(c, e)}
                          disabled={isApproving === c.id}
                          className="px-2.5 py-1 rounded bg-white hover:bg-zinc-200 text-black text-[11px] font-medium transition-colors flex items-center gap-1 cursor-pointer"
                        >
                          {isApproving === c.id ? (
                            <Loader2 className="w-3 h-3 animate-spin text-black" />
                          ) : (
                            <Send className="w-3 h-3 text-black" />
                          )}
                          <span>Approve & Send</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedCase(c);
                        }}
                        className="text-[11px] text-zinc-400 group-hover:text-white font-medium inline-flex items-center gap-0.5 transition-colors p-1"
                      >
                        Inspect <ArrowUpRight className="w-3 h-3" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Upgraded Clean Inspection Modal */}
      {selectedCase && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#141416] border border-white/[0.08] rounded-xl w-full max-w-xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in duration-150">
            {/* Modal Header with Allel Logo */}
            <div className="px-6 py-4 border-b border-white/[0.06] flex items-center justify-between">
              <div className="flex items-center gap-3">
                <img
                  src="/logo-icon.png"
                  alt="Allel"
                  className="w-[18px] h-[18px] object-contain shrink-0 mix-blend-screen bg-transparent translate-y-[3px]"
                />
                <div>
                  <h3 className="text-sm font-medium text-white leading-none">{selectedCase.accountName}</h3>
                  <div className="text-[11px] text-zinc-400">
                    {selectedCase.contactEmail} • ${(selectedCase.mrrCents / 100).toLocaleString()}/mo MRR
                  </div>
                </div>
              </div>

              <button
                onClick={() => setSelectedCase(null)}
                className="px-2 py-1 text-xs text-zinc-400 hover:text-white rounded hover:bg-white/[0.06] transition-colors cursor-pointer"
              >
                Close (ESC)
              </button>
            </div>

            {/* Modal Body: Clean Founder-Grade Brief */}
            <div className="p-6 overflow-y-auto space-y-5 text-xs text-zinc-300">
              {/* Trigger Signal */}
              <div>
                <div className="text-[11px] font-medium text-zinc-400 mb-1.5">Detected Signal</div>
                <div className="p-3 rounded-lg bg-white/[0.02] border border-white/[0.04] flex items-center gap-2.5">
                  <ProviderLogo provider={selectedCase.triggerProvider} className="w-4 h-4" />
                  <div>
                    <div className="text-white font-medium text-xs capitalize">
                      {selectedCase.triggerProvider} • {selectedCase.triggerEventType.replace(/[_.]/g, ' ')}
                    </div>
                    <div className="text-[11px] text-zinc-400 mt-0.5">{selectedCase.triggerDescription}</div>
                  </div>
                </div>
              </div>

              {/* Account Health Metrics */}
              <div>
                <div className="text-[11px] font-medium text-zinc-400 mb-1.5">Account Health Factors</div>
                <div className="p-3 rounded-lg bg-white/[0.02] border border-white/[0.04] grid grid-cols-4 gap-2 text-center">
                  <div>
                    <div className="text-[10px] text-zinc-400">Payment Fails</div>
                    <div className="text-xs font-semibold text-white mt-0.5">{selectedCase.canonicalFeatures.paymentFailures30d}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-zinc-400">Days Since Pay</div>
                    <div className="text-xs font-semibold text-white mt-0.5">{selectedCase.canonicalFeatures.daysSinceLastPayment}d</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-zinc-400">Usage Change</div>
                    <div className="text-xs font-semibold text-white mt-0.5">{selectedCase.canonicalFeatures.usageDeclinePct}%</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-zinc-400">Unreplied Comms</div>
                    <div className="text-xs font-semibold text-white mt-0.5">{selectedCase.canonicalFeatures.unrepliedEmails}</div>
                  </div>
                </div>
              </div>

              {/* Outreach Email Draft */}
              {selectedCase.draft && (
                <div>
                  <div className="text-[11px] font-medium text-zinc-400 mb-1.5 flex items-center justify-between">
                    <span>Founder Outreach Email</span>
                    {selectedCase.status === 'awaiting_approval' && (
                      <button
                        type="button"
                        onClick={() => handleApproveCase(selectedCase)}
                        disabled={isApproving === selectedCase.id}
                        className="px-2.5 py-1 rounded bg-white hover:bg-zinc-200 text-black text-[11px] font-medium transition-colors flex items-center gap-1 cursor-pointer"
                      >
                        {isApproving === selectedCase.id ? (
                          <Loader2 className="w-3 h-3 animate-spin text-black" />
                        ) : (
                          <Send className="w-3 h-3 text-black" />
                        )}
                        <span>Approve & Send</span>
                      </button>
                    )}
                  </div>
                  <div className="p-3 rounded-lg bg-white/[0.02] border border-white/[0.04] space-y-2">
                    <div className="text-[11px] text-zinc-300">
                      Subject: <strong className="text-white">{selectedCase.draft.subject}</strong>
                    </div>
                    <div className="p-3 rounded bg-black/40 text-zinc-200 font-sans text-xs leading-relaxed">
                      {selectedCase.draft.bodyFull}
                    </div>
                    <div className="text-[11px] text-zinc-400 flex items-center justify-between pt-0.5">
                      <span>To: {selectedCase.contactEmail}</span>
                      <span>
                        {selectedCase.draft.approvedBy ? (
                          <span className="text-white font-medium">✓ Approved by {selectedCase.draft.approvedBy}</span>
                        ) : (
                          <span className="text-zinc-400">Awaiting Approval</span>
                        )}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Sent Status & Gmail Mailto Link */}
              {selectedCase.sendProvenance && (
                <div>
                  <div className="text-[11px] font-medium text-zinc-400 mb-1.5">Dispatch & Gmail Delivery</div>
                  <div className="p-3 rounded-lg bg-white/[0.02] border border-white/[0.04] flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <img src="/logos/gmail.svg" alt="Gmail" className="w-4 h-4 object-contain shrink-0" />
                      <div>
                        <div className="text-white text-xs font-medium">Sent from Founder Email</div>
                        <div className="text-[10.5px] text-zinc-400">{selectedCase.sendProvenance.sentAt}</div>
                      </div>
                    </div>

                    <a
                      href={`https://mail.google.com/mail/u/0/#search/${encodeURIComponent(selectedCase.contactEmail)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-2.5 py-1 rounded bg-white/[0.06] hover:bg-white/[0.1] text-white text-[11px] font-medium transition-colors inline-flex items-center gap-1 cursor-pointer"
                    >
                      <span>Open in Gmail</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </div>
              )}

              {/* Attribution */}
              {selectedCase.attribution && (
                <div>
                  <div className="text-[11px] font-medium text-zinc-400 mb-1.5">Outcome & Protected Value</div>
                  <div className="p-3 rounded-lg bg-white/[0.02] border border-white/[0.04] flex items-center justify-between text-xs">
                    <div>
                      <div className="font-medium text-white">{selectedCase.attribution.outcomeType}</div>
                      <div className="text-[10.5px] text-zinc-400">{selectedCase.attribution.date}</div>
                    </div>
                    <div className="text-sm font-semibold text-white">
                      ${(selectedCase.attribution.amountCents / 100).toLocaleString()}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
