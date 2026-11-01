import type { HoldStatus } from '@/lib/latch'

const STYLE: Record<HoldStatus, { label: string; text: string; bg: string; dot: string }> = {
  active: { label: 'Active', text: 'text-teal', bg: 'bg-teal/[0.1]', dot: 'bg-teal' },
  captured: { label: 'Fully Captured', text: 'text-sky', bg: 'bg-sky/[0.1]', dot: 'bg-sky' },
  expired: { label: 'Expired', text: 'text-warn', bg: 'bg-warn/[0.1]', dot: 'bg-warn' },
  refunded: { label: 'Refunded', text: 'text-slate2', bg: 'bg-edge/[0.12]', dot: 'bg-slate2' },
}

export function StatusChip({ status }: { status: HoldStatus }) {
  const s = STYLE[status]
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${s.bg} ${s.text}`}
    >
      <span className={`size-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  )
}
