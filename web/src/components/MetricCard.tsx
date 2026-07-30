import type { OverviewMetric } from '@/lib/dashboard/mock-data'

export default function MetricCard({ metric }: { metric: OverviewMetric }) {
  return (
    <div className="group relative overflow-hidden rounded-[20px] border border-[#ffffff08] bg-[#0c0c0e] p-5 transition-all duration-300 hover:border-[#ffffff14] hover:bg-[#0e0e11]">
      {/* Subtle gradient glow on hover */}
      <div className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-[#6366f1] opacity-0 blur-[40px] transition-opacity duration-500 group-hover:opacity-[0.06]" />

      <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-[#555]">
        {metric.label}
      </p>
      <p
        className="mt-2 text-[32px] font-normal leading-none tracking-tight text-white"
        style={{ fontFamily: 'var(--font-display)' }}
      >
        {metric.value}
      </p>
      <p className="mt-2 text-[12px] text-[#8b8b96]">{metric.change}</p>
      <p className="mt-3 border-t border-[#ffffff06] pt-3 text-[11px] leading-relaxed text-[#555]">
        {metric.detail}
      </p>
    </div>
  )
}
