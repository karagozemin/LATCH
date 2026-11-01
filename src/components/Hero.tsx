import { ChevronRight, Lock, Undo2, HandCoins } from 'lucide-react'

const STEPS = [
  { n: '01', title: 'Reserve', body: 'Lock USDC for a named recipient until an expiry you set.', icon: Lock },
  { n: '02', title: 'Capture', body: 'The recipient takes what they need, in as many parts as they like.', icon: HandCoins },
  { n: '03', title: 'Refund', body: 'After expiry, you reclaim whatever was left unused.', icon: Undo2 },
]

export function Hero() {
  return (
    <section className="panel-hl relative overflow-hidden rounded-2xl border border-edge/[0.13] bg-panel">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-teal/60 to-transparent" aria-hidden />
      <div className="px-5 pb-7 pt-8 sm:px-8 sm:pt-10">
        <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.14em] text-teal">USDC authorizations on Arc</p>
        <h2 className="max-w-2xl text-balance text-[28px] font-semibold leading-[1.1] tracking-[-0.03em] text-ink sm:text-[40px]">
          Programmable payments. Precise control.
        </h2>
        <p className="mt-3 max-w-xl text-[15px] text-pretty text-slate2">
          Reserve USDC, capture what you need, return the rest.
        </p>
      </div>

      <ol className="grid border-t border-edge/[0.1] sm:grid-cols-3">
        {STEPS.map((s, i) => (
          <li
            key={s.n}
            className={`relative flex gap-4 px-5 py-5 sm:px-8 ${i > 0 ? 'border-t border-edge/[0.1] sm:border-l sm:border-t-0' : ''}`}
          >
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-edge/[0.15] bg-canvas text-teal">
              <s.icon className="size-4" strokeWidth={1.75} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs text-faint">{s.n}</span>
                <span className="text-sm font-semibold text-ink">{s.title}</span>
              </div>
              <p className="mt-1 text-[13px] leading-relaxed text-pretty text-slate2">{s.body}</p>
            </div>
            {i < STEPS.length - 1 && (
              <ChevronRight
                className="absolute -right-2 top-1/2 z-10 hidden size-4 -translate-y-1/2 rounded-full bg-panel text-faint sm:block"
                aria-hidden
              />
            )}
          </li>
        ))}
      </ol>
    </section>
  )
}
