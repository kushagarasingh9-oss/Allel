import type { LiveSignal } from '@/lib/dashboard/mock-data'

export default function SignalFeedItem({ signal }: { signal: LiveSignal }) {
  return (
    <div className="group flex items-start gap-4 rounded-[14px] px-3 py-3 transition-colors hover:bg-[#ffffff04]">
      {/* Timeline dot + line */}
      <div className="flex flex-col items-center pt-1">
        <div className="h-2 w-2 rounded-full bg-[#6366f1] shadow-[0_0_8px_#6366f150]" />
        <div className="mt-1 h-full w-[1px] bg-gradient-to-b from-[#6366f130] to-transparent" />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-3">
          <span className="font-mono text-[11px] tabular-nums text-[#555]">
            {signal.time}
          </span>
          <span className="text-[13px] font-medium text-[#d9d9df]">
            {signal.label}
          </span>
        </div>
        <p className="mt-1 text-[12px] leading-relaxed text-[#6d6d76]">
          {signal.detail}
        </p>
      </div>
    </div>
  )
}
