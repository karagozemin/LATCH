import type { ReactNode } from 'react'

export function Panel({ children, className = '', id }: { children: ReactNode; className?: string; id?: string }) {
  return (
    <section id={id} className={`scroll-mt-32 panel-hl rounded-2xl border border-edge/[0.13] bg-panel ${className}`}>{children}</section>
  )
}

export function PanelHeader({
  title,
  subtitle,
  right,
}: {
  title: string
  subtitle?: string
  right?: ReactNode
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-edge/[0.1] px-5 py-4 sm:px-6">
      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold tracking-tight text-ink">{title}</h2>
        {subtitle && <p className="mt-0.5 text-[13px] text-pretty text-slate2">{subtitle}</p>}
      </div>
      {right}
    </div>
  )
}

export function Label({ children }: { children: ReactNode }) {
  return <span className="text-[11px] font-medium uppercase tracking-[0.09em] text-faint">{children}</span>
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-edge/[0.1] ${className}`} aria-hidden />
}
