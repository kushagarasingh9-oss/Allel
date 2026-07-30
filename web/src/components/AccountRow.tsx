import Link from 'next/link'
import { type AccountSummary } from '@/lib/dashboard/mock-data'
import RiskBadge from './RiskBadge'

export default function AccountRow({ account }: { account: AccountSummary }) {
  const isUsagePositive = account.usageDelta.startsWith('+')
  const isUsageNegative = account.usageDelta.startsWith('-')

  return (
    <Link
      href={`/dashboard/accounts/${account.id}`}
      className="group flex items-center justify-between border-b border-[#ffffff0a] py-4 transition-colors hover:bg-[#ffffff03] hover:px-2 -mx-2 px-2 rounded-lg cursor-pointer no-underline"
    >
      <div className="flex w-[20%] flex-col gap-1 pr-4">
        <span className="text-[15px] font-semibold text-white">{account.name}</span>
        <span className="text-[13px] text-[#9a9aa4]">{account.segment}</span>
      </div>

      <div className="flex w-[12%] justify-start pr-4">
        <span className="font-mono text-[14px] text-white/90">{account.mrr}</span>
      </div>

      <div className="flex w-[12%] justify-start pr-4">
        <RiskBadge risk={account.risk} />
      </div>

      <div className="flex w-[12%] justify-start pr-4">
        <span
          className={`text-[13px] font-medium ${
            isUsagePositive
              ? 'text-[#8dd6a7]'
              : isUsageNegative
                ? 'text-[#ffb0b9]'
                : 'text-[#9a9aa4]'
          }`}
        >
          {account.usageDelta}
        </span>
      </div>

      <div className="flex w-[12%] flex-col gap-1 pr-4">
        <span className="text-[13px] text-[#9a9aa4]">{account.lastTouch}</span>
      </div>

      <div className="flex w-[18%] flex-col gap-1 pr-4">
        <span
          className={`text-[13px] truncate ${
            account.openIssue === 'None' ? 'text-[#555]' : 'text-white/80'
          }`}
          title={account.openIssue}
        >
          {account.openIssue}
        </span>
      </div>

      <div className="flex w-[14%] justify-end">
        <span className="text-[13px] font-medium text-[#8b5cf6] transition-colors group-hover:text-[#a78bfa]">
          {account.nextAction}
        </span>
      </div>
    </Link>
  )
}

