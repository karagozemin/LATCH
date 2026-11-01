import { BookOpen, ExternalLink, Globe, Droplets } from 'lucide-react'
import type { View } from '@/hooks/useView'
import { LATCH_ADDRESS, LATCH_CHAIN_ID } from '@/lib/latch'
import { buildAddressExplorerUrl, requireChain } from '@/onchain-facts'
import { CopyButton } from '@/components/ui/CopyButton'
import { shortAddress } from '@/lib/format'
import { NAV } from './nav'
import { Wordmark } from './Wordmark'

const LINKS = [
  { label: 'Arc documentation', href: 'https://docs.arc.io', icon: BookOpen },
  { label: 'Circle developer docs', href: 'https://developers.circle.com', icon: BookOpen },
  { label: 'Testnet faucet', href: 'https://faucet.circle.com', icon: Droplets },
]

export function Sidebar({ view, onNavigate }: { view: View; onNavigate: (v: View) => void }) {
  const explorer = requireChain(LATCH_CHAIN_ID).explorerBase

  return (
    <aside data-sidebar className="sticky top-0 hidden h-dvh w-[240px] shrink-0 flex-col border-r border-edge/[0.1] bg-canvas px-3 py-5 lg:flex">
      <div className="px-3 pb-7">
        <Wordmark />
      </div>

      <nav className="space-y-0.5" aria-label="Primary">
        {NAV.map((item) => {
          const active = item.view === view
          const Icon = item.icon
          return (
            <button
              key={item.view}
              onClick={() => onNavigate(item.view)}
              aria-current={active ? 'page' : undefined}
              className={`group relative flex h-9 w-full items-center gap-2.5 rounded-lg px-3 text-[13px] font-medium transition-colors ${
                active ? 'bg-panel text-ink' : 'text-slate2 hover:bg-panel/60 hover:text-ink'
              }`}
            >
              {active && <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-teal" />}
              <Icon className={`size-4 ${active ? 'text-teal' : 'text-faint group-hover:text-slate2'}`} strokeWidth={1.75} />
              {item.label}
            </button>
          )
        })}
      </nav>

      <div className="mt-auto space-y-5">
        <div>
          <p className="px-3 pb-2 text-[11px] font-medium uppercase tracking-[0.09em] text-faint">Network</p>
          <a
            href={explorer}
            target="_blank"
            rel="noopener noreferrer"
            className="flex h-9 items-center gap-2.5 rounded-lg px-3 text-[13px] text-slate2 transition-colors hover:bg-panel/60 hover:text-ink"
          >
            <Globe className="size-4 text-faint" strokeWidth={1.75} />
            <span className="flex-1">Arc Testnet explorer</span>
            <ExternalLink className="size-3 text-faint" />
          </a>
          {LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-9 items-center gap-2.5 rounded-lg px-3 text-[13px] text-slate2 transition-colors hover:bg-panel/60 hover:text-ink"
            >
              <l.icon className="size-4 text-faint" strokeWidth={1.75} />
              <span className="flex-1">{l.label}</span>
              <ExternalLink className="size-3 text-faint" />
            </a>
          ))}
        </div>

        {LATCH_ADDRESS && (
          <div className="rounded-xl border border-edge/[0.12] bg-panel px-3 py-2.5">
            <p className="text-[11px] font-medium uppercase tracking-[0.09em] text-faint">Contract</p>
            <div className="mt-1 flex items-center justify-between">
              <a
                href={buildAddressExplorerUrl(LATCH_CHAIN_ID, LATCH_ADDRESS)}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-xs text-ink/90 hover:text-teal"
              >
                {shortAddress(LATCH_ADDRESS)}
              </a>
              <CopyButton value={LATCH_ADDRESS} label="Copy contract address" />
            </div>
            <p className="mt-1 text-[11px] text-faint">Immutable. No admin keys.</p>
          </div>
        )}
      </div>
    </aside>
  )
}
