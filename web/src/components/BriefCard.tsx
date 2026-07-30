import type { BriefItem } from '@/lib/dashboard/mock-data'
import RiskBadge from './RiskBadge'
import EvidencePill from './EvidencePill'

export default function BriefCard({
  item,
  index,
}: {
  item: BriefItem
  index: number
}) {
  const accentColor =
    item.risk === 'High'
      ? '#ff6b7a'
      : item.risk === 'Medium'
        ? '#f2c979'
        : '#8dd6a7'

  return (
    <div
      className="group relative overflow-hidden rounded-[20px] border border-[#ffffff08] bg-[#0c0c0e] transition-all duration-300 hover:border-[#ffffff14]"
      style={{
        animationDelay: `${index * 80}ms`,
      }}
    >
      <div
        className="absolute left-0 top-0 h-full w-[3px]"
        style={{ backgroundColor: accentColor, opacity: 0.6 }}
      />

      <div className="p-6 pl-7">
        <div className="flex flex-wrap items-center gap-3">
          <RiskBadge risk={item.risk} />
          <span className="text-[13px] font-medium text-[#d5d5dc]">{item.account}</span>
          {item.sources.map((source) => (
            <span
              key={`${item.account}-${source}`}
              className="rounded-full border border-[#ffffff10] bg-[#101012] px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.16em] text-[#8d909c]"
            >
              {source}
            </span>
          ))}
        </div>

        <h3 className="mt-3 text-[16px] font-medium leading-snug text-white">{item.headline}</h3>

        <p className="mt-2 text-[13px] leading-relaxed text-[#84848f]">{item.detail}</p>

        {item.evidence.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {item.evidence.map((e) => (
              <EvidencePill key={e} text={e} />
            ))}
          </div>
        )}

        <div className="mt-4 rounded-[14px] border border-[#ffffff06] bg-[#0a0a0c] px-4 py-3">
          <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-[#636773]">
            Next move
          </p>
          <p className="mt-2 text-[12px] font-medium leading-relaxed text-[#d7d7de]">
            {item.nextStep}
          </p>
        </div>
      </div>
    </div>
  )
}
