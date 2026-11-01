export function Wordmark({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-baseline gap-[3px] select-none ${className}`} aria-label="LATCH">
      <span className="text-[17px] font-semibold tracking-[0.24em] text-ink">LATCH</span>
      <span className="size-[5px] rounded-[1px] bg-teal" aria-hidden />
    </span>
  )
}
