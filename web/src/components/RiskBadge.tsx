import { getRiskClasses, type RiskLevel } from '@/lib/dashboard/mock-data'

export default function RiskBadge({ risk }: { risk: RiskLevel }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold leading-none ${getRiskClasses(risk)}`}
    >
      <span
        className={`inline-block h-[5px] w-[5px] rounded-full ${
          risk === 'High'
            ? 'bg-[#ff6b7a] shadow-[0_0_6px_#ff6b7a80]'
            : risk === 'Medium'
              ? 'bg-[#f2c979] shadow-[0_0_6px_#f2c97980]'
              : 'bg-[#8dd6a7] shadow-[0_0_6px_#8dd6a780]'
        }`}
      />
      {risk}
    </span>
  )
}
