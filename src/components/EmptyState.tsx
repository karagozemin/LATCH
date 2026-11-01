import type { ReactNode } from 'react'

interface Props {
  icon: ReactNode
  title: string
  body: string
  action?: ReactNode
}

export function EmptyState({ icon, title, body, action }: Props) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      <div className="mb-4 flex size-11 items-center justify-center rounded-xl border border-edge/[0.15] bg-canvas text-slate2">
        {icon}
      </div>
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      <p className="mt-1.5 max-w-sm text-[13px] leading-relaxed text-pretty text-slate2">{body}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}
