import logo from '@/assets/logo.svg'

export function Wordmark({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 select-none ${className}`} aria-label="LATCH">
      <img src={logo} alt="" width={32} height={32} className="size-8 rounded-[8px]" draggable={false} />
      <span className="inline-flex items-baseline gap-[3px]">
        <span className="text-[17px] font-semibold tracking-[0.24em] text-ink">LATCH</span>
        <span className="size-[5px] rounded-[1px] bg-teal" aria-hidden />
      </span>
    </span>
  )
}
