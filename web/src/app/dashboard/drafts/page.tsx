import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getDashboardStateForUser } from '@/lib/dashboard/data'
import DraftCard from '@/components/DraftCard'

export default async function DraftsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const state = await getDashboardStateForUser(user)

  return (
    <div className="p-8 lg:p-10 xl:p-12">
      <div className="mx-auto max-w-[1200px]">
        <div className="mb-10 flex flex-col gap-5 border-b border-[#ffffff0a] pb-8 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.24em] text-[#555]">
              Draft queue
            </p>
            <h1
              className="text-[38px] font-normal leading-[1.02] text-white md:text-[46px]"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              Follow-ups waiting for approval.
            </h1>
            <p className="mt-3 max-w-[720px] text-[15px] leading-relaxed text-[#9a9aa4]">
              The agent drafts save notes, payment nudges, and activation follow-ups. Founders
              keep final approval before anything is sent.
            </p>
          </div>

          <div className="flex flex-col items-start gap-3 lg:items-end">
            <div className="rounded-full border border-[#ffffff12] bg-[#101012] px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.18em] text-[#8b8b96]">
              {state.draftQueue.length} drafts
            </div>
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
              Draft queue unavailable
            </p>
            <h2
              className="mt-3 text-[34px] font-normal leading-[1.02] text-white"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              Follow-ups appear after real risk signals exist.
            </h2>
            <p className="mt-4 max-w-[720px] text-[15px] leading-relaxed text-[#9a9aa4]">
              The draft queue should be driven by real account risk and real contacts. Finish the
              core integrations first so the agent has something trustworthy to draft from.
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
        ) : state.draftQueue.length === 0 ? (
          <div className="rounded-[28px] border border-dashed border-[#ffffff12] p-12 text-center text-[#555]">
            <p>No drafts waiting right now.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {state.draftQueue.map((draft) => (
              <DraftCard key={draft.id} draft={draft} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
