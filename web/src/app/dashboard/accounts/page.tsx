import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getDashboardStateForUser } from '@/lib/dashboard/data'
import AccountRow from '@/components/AccountRow'

export default async function AccountsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const state = await getDashboardStateForUser(user)

  return (
    <div className="p-8 lg:p-10 xl:p-12">
      <div className="mx-auto max-w-[1320px]">
        <div className="mb-10 flex flex-col gap-5 border-b border-[#ffffff0a] pb-8 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.24em] text-[#555]">
              Accounts
            </p>
            <h1
              className="text-[38px] font-normal leading-[1.02] text-white md:text-[46px]"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              Customer accounts ranked by risk.
            </h1>
            <p className="mt-3 max-w-[720px] text-[15px] leading-relaxed text-[#9a9aa4]">
              Review the accounts slipping on usage, billing, or support. The highest-risk
              workspaces stay at the top so the founder team knows where to intervene first.
            </p>
          </div>
        </div>

        {state.notice && (
          <div
            className={`mb-6 rounded-[18px] px-4 py-3 text-[13px] ${
              state.notice.tone === 'danger'
                ? 'border border-[#5c252d] bg-[#201014] text-[#ffb0b9]'
                : state.notice.tone === 'warning'
                  ? 'border border-[#5f4b16] bg-[#2a2110] text-[#f2c979]'
                  : 'border border-[#28344a] bg-[#111822] text-[#a9c4ff]'
            }`}
          >
            <p className="font-medium">{state.notice.title}</p>
            <p className="mt-1 text-[#d5d5dc]">{state.notice.detail}</p>
          </div>
        )}

        {state.mode !== 'live' ? (
          <div className="rounded-[28px] border border-dashed border-[#ffffff12] bg-[#0f0f10]/40 p-12">
            <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-[#555]">
              Accounts unavailable
            </p>
            <h2
              className="mt-3 text-[34px] font-normal leading-[1.02] text-white"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              Connect real sources before ranking accounts.
            </h2>
            <p className="mt-4 max-w-[720px] text-[15px] leading-relaxed text-[#9a9aa4]">
              This page only becomes useful once Stripe, PostHog, and account identity data are
              connected. Until then, the product should not pretend to know which accounts are at
              risk.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/dashboard/settings"
                className="rounded-[14px] bg-white px-4 py-3 text-[13px] font-medium text-black transition-transform hover:scale-[1.01]"
              >
                Open integrations
              </Link>
              <Link
                href="/dashboard"
                className="rounded-[14px] border border-[#ffffff12] bg-[#0b0b0c] px-4 py-3 text-[13px] font-medium text-white transition-colors hover:bg-[#141416]"
              >
                Back to brief
              </Link>
            </div>
          </div>
        ) : (
        <div className="liquid-glass rounded-[28px] border border-[#ffffff12] bg-[#0f0f10]/50 p-6 shadow-2xl md:p-8">
          <div className="flex px-2 pb-4 text-[11px] font-medium uppercase tracking-[0.2em] text-[#555]">
            <div className="w-[20%] pr-4 uppercase">Account</div>
            <div className="w-[12%] pr-4 uppercase">MRR</div>
            <div className="w-[12%] pr-4 uppercase">Risk</div>
            <div className="w-[12%] pr-4 uppercase">Usage Δ</div>
            <div className="w-[12%] pr-4 uppercase">Last Touch</div>
            <div className="w-[18%] pr-4 uppercase">Open Issue</div>
            <div className="w-[14%] text-right uppercase">Action</div>
          </div>
          
          <div className="flex flex-col">
            {state.accountSummaries.map((account) => (
              <AccountRow key={account.id ?? account.name} account={account} />
            ))}
          </div>
          
          {state.accountSummaries.length === 0 && (
            <div className="py-12 text-center text-[14px] text-[#555]">
              No accounts found.
            </div>
          )}
        </div>
        )}
      </div>
    </div>
  )
}
