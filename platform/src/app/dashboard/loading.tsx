export default function DashboardLoading() {
  return (
    <div className="h-full w-full bg-[#141414] flex flex-col items-center justify-center select-none flex-1 min-h-[400px]">
      <div className="relative flex items-center justify-center">
        <div className="absolute w-12 h-12 rounded-full bg-white/5 animate-ping duration-1000 pointer-events-none" />
        <img
          src="/dot.png"
          alt="Allel"
          className="w-9 h-9 rounded-full object-contain relative z-10 animate-pulse"
        />
      </div>
    </div>
  )
}
