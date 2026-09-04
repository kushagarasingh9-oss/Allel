export default function Loading() {
  return (
    <div className="min-h-screen w-full bg-[#000000] flex items-center justify-center select-none z-50">
      <img
        src="/dot.png"
        alt="Loading..."
        className="w-7 h-7 object-contain animate-spin [animation-duration:1.2s] [animation-timing-function:linear]"
      />
    </div>
  );
}
