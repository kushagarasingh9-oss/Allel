export default function Loading() {
  return (
    <div className="min-h-screen w-full bg-[#0b0b0a] flex flex-col items-center justify-center select-none z-50">
      <div className="relative flex items-center justify-center">
        {/* Subtle breathing glow ring */}
        <div className="absolute w-16 h-16 rounded-full bg-white/5 animate-ping duration-1000 pointer-events-none" />
        
        {/* Brand Dot Logo Badge */}
        <img
          src="/dot.png"
          alt="Allel"
          className="w-12 h-12 rounded-full object-contain relative z-10 shadow-2xl animate-pulse"
        />
      </div>
      <div className="mt-4 flex items-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-white/40 animate-bounce [animation-delay:-0.3s]" />
        <span className="w-1.5 h-1.5 rounded-full bg-white/40 animate-bounce [animation-delay:-0.15s]" />
        <span className="w-1.5 h-1.5 rounded-full bg-white/40 animate-bounce" />
      </div>
    </div>
  )
}
