import logo from '../../assets/Latch-Arc.png'

export function Wordmark({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 select-none ${className}`} aria-label="LATCH">
      <span className="size-8 overflow-hidden rounded-[8px] bg-black" aria-hidden>
        <img src={logo} alt="" width={32} height={32} className="size-full scale-[1.45] object-cover" draggable={false} />
      </span>
      <span className="inline-flex items-baseline gap-[3px]">
        <span className="text-[17px] font-semibold tracking-[0.24em] text-ink">LATCH</span>
        <span className="size-[5px] rounded-[1px] bg-teal" aria-hidden />
      </span>
    </span>
  )
}
