export default function DashboardLoading() {
  return (
    <div className="h-full w-full bg-[#000000] flex items-center justify-center select-none flex-1 min-h-[400px]">
      <img
        src="/dot.png"
        alt="Loading..."
        className="w-7 h-7 object-contain animate-spin [animation-duration:1.2s] [animation-timing-function:linear]"
      />
    </div>
  )
}
