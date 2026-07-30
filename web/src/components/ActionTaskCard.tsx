import type { ActionTask } from '@/lib/dashboard/mock-data'

function getStatusStyles(status: ActionTask['status']) {
  switch (status) {
    case 'Needs approval':
      return {
        border: 'border-[#5f4b16]',
        bg: 'bg-[#221a0d]',
        text: 'text-[#f2c979]',
      }
    case 'Ready to send':
      return {
        border: 'border-[#1f4633]',
        bg: 'bg-[#0f1713]',
        text: 'text-[#8dd6a7]',
      }
    case 'Waiting on founder':
      return {
        border: 'border-[#2f3546]',
        bg: 'bg-[#111521]',
        text: 'text-[#aeb9d9]',
      }
    default:
      return {
        border: 'border-[#ffffff10]',
        bg: 'bg-[#0f0f11]',
        text: 'text-[#c9c9d1]',
      }
  }
}

export default function ActionTaskCard({ task }: { task: ActionTask }) {
  const statusStyles = getStatusStyles(task.status)

  return (
    <div className="rounded-[18px] border border-[#ffffff0a] bg-[#0b0b0c] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-[#5d5d66]">
            {task.kind}
          </p>
          <h3 className="mt-2 text-[14px] font-medium leading-snug text-white">
            {task.headline}
          </h3>
          <p className="mt-1 text-[12px] text-[#7d7d87]">{task.account}</p>
        </div>
        <span
          className={`rounded-full border px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.18em] ${statusStyles.border} ${statusStyles.bg} ${statusStyles.text}`}
        >
          {task.status}
        </span>
      </div>

      <p className="mt-3 text-[13px] leading-relaxed text-[#8f8f99]">{task.detail}</p>

      <div className="mt-4 flex flex-wrap items-center gap-2 text-[11px] text-[#6f6f79]">
        <span className="rounded-full border border-[#ffffff10] px-2.5 py-1">
          {task.due}
        </span>
        {task.sources.map((source) => (
          <span
            key={`${task.id}-${source}`}
            className="rounded-full border border-[#ffffff10] bg-[#111113] px-2.5 py-1 text-[#9ea0aa]"
          >
            {source}
          </span>
        ))}
        {task.requiresApproval && (
          <span className="rounded-full border border-[#5f4b16] bg-[#221a0d] px-2.5 py-1 text-[#f2c979]">
            Founder approval required
          </span>
        )}
      </div>
    </div>
  )
}
