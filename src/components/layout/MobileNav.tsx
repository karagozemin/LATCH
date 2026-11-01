import type { View } from '@/hooks/useView'
import { NAV } from './nav'

/** Scrollable pill navigation shown below the top bar on screens without the sidebar. */
export function MobileNav({ view, onNavigate }: { view: View; onNavigate: (v: View) => void }) {
  return (
    <nav
      data-mobile-nav
      className="no-scrollbar sticky top-14 z-20 flex gap-1.5 overflow-x-auto border-b border-edge/[0.1] bg-canvas/90 px-4 py-2 backdrop-blur-md sm:px-6 lg:hidden"
      aria-label="Primary"
    >
      {NAV.map((item) => {
        const active = item.view === view
        const Icon = item.icon
        return (
          <button
            key={item.view}
            onClick={() => onNavigate(item.view)}
            aria-current={active ? 'page' : undefined}
            className={`flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors ${
              active ? 'border-teal/30 bg-teal/[0.08] text-teal' : 'border-edge/[0.13] text-slate2 hover:text-ink'
            }`}
          >
            <Icon className="size-3.5" strokeWidth={1.75} />
            {item.label}
          </button>
        )
      })}
    </nav>
  )
}
