export default function EvidencePill({ text }: { text: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-[#ffffff08] bg-[#0f0f12] px-2.5 py-1 text-[11px] text-[#8b8b96]">
      <svg
        width="8"
        height="8"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="opacity-40"
      >
        <circle cx="12" cy="12" r="10" />
      </svg>
      {text}
    </span>
  )
}
