import { useState } from 'react'
import { useAccount, usePublicClient } from 'wagmi'
import { useQuery } from '@tanstack/react-query'
import { ExternalLink, History, Loader2, Wallet } from 'lucide-react'
import { LATCH_CHAIN_ID } from '@/lib/latch'
import { fmtUsdc, shortAddress } from '@/lib/format'
import { networkLabel } from '@/lib/network'
import { buildTxExplorerUrl } from '@/onchain-facts'
import type { ActivityEvent, ActivityKind, ActivityProgress } from '@/hooks/useActivity'
import { Panel, PanelHeader } from '@/components/ui/Panel'
import { Segmented } from '@/components/ui/Segmented'
import { EmptyState } from './EmptyState'

type Scope = 'mine' | 'all'
const PAGE = 25
const KIND: Record<ActivityKind, { label: string; cls: string }> = {
  reserved: { label: 'Reserved', cls: 'bg-teal/[0.1] text-teal' },
  captured: { label: 'Captured', cls: 'bg-sky/[0.1] text-sky' },
  refunded: { label: 'Refunded', cls: 'bg-edge/[0.12] text-slate2' },
}
const COLS = 'sm:grid-cols-[150px_110px_90px_minmax(0,1fr)_minmax(0,1fr)_88px]'

interface Props {
  events: ActivityEvent[]
  progress: ActivityProgress | null
  error: string | null
  syncing: boolean
}

export function HistoryTable({ events, progress, error, syncing }: Props) {
  const { address, isConnected } = useAccount()
  const client = usePublicClient({ chainId: LATCH_CHAIN_ID })
  const [pickedScope, setPickedScope] = useState<Scope | null>(null)
  const scope: Scope = pickedScope ?? (isConnected ? 'mine' : 'all')
  const me = address?.toLowerCase()

  const visible = events
    .filter((e) => scope === 'all' || e.payer?.toLowerCase() === me || e.recipient?.toLowerCase() === me)
    .slice(0, PAGE)

  const blocks = [...new Set(visible.map((e) => e.blockNumber.toString()))]
  const times = useQuery({
    queryKey: ['latch-block-times', blocks.join(',')],
    enabled: !!client && blocks.length > 0,
    staleTime: Infinity,
    queryFn: async () => {
      const out: Record<string, number> = {}
      await Promise.all(
        blocks.map(async (b) => {
          const block = await client!.getBlock({ blockNumber: BigInt(b) })
          out[b] = Number(block.timestamp)
        }),
      )
      return out
    },
  })

  const pct =
    progress && progress.head > progress.from
      ? Math.min(100, Number(((progress.scanned - progress.from + 1n) * 100n) / (progress.head - progress.from + 1n)))
      : 0

  const body = (() => {
    if (scope === 'mine' && !isConnected) {
      return (
        <EmptyState
          icon={<Wallet className="size-5" strokeWidth={1.5} />}
          title="Connect to see your activity"
          body="Reservations, captures and refunds involving your wallet are listed here. Switch to All to see every event."
        />
      )
    }
    if (visible.length === 0) {
      return (
        <EmptyState
          icon={
            syncing ? <Loader2 className="size-5 animate-spin" strokeWidth={1.5} /> : <History className="size-5" strokeWidth={1.5} />
          }
          title={syncing ? 'Scanning recent blocks…' : 'No transactions in range'}
          body={
            syncing
              ? `Reading Latch events from ${networkLabel(LATCH_CHAIN_ID)}. Results appear as soon as they are found.`
              : 'No reservations, captures or refunds were found in the scanned block range. Create an authorization to see real transactions here.'
          }
        />
      )
    }
    return (
      <>
        <div
          className={`hidden gap-4 border-b border-edge/[0.1] px-6 py-2.5 text-[11px] font-medium uppercase tracking-[0.09em] text-faint sm:grid ${COLS}`}
        >
          <span>Time</span>
          <span>Event</span>
          <span>Hold</span>
          <span className="text-right">Amount (USDC)</span>
          <span>Party</span>
          <span className="text-right">Transaction</span>
        </div>
        <ul className="divide-y divide-edge/[0.08]">
          {visible.map((e) => {
            const t = times.data?.[e.blockNumber.toString()]
            const party = e.kind === 'refunded' ? e.payer : e.recipient
            const k = KIND[e.kind]
            const time = t ? new Date(t * 1000).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : `Block ${e.blockNumber.toString()}`
            const link = (
              <a
                href={buildTxExplorerUrl(LATCH_CHAIN_ID, e.txHash)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs font-medium text-teal hover:underline"
              >
                {e.txHash.slice(0, 8)}… <ExternalLink className="size-3" />
              </a>
            )
            return (
              <li key={`${e.txHash}:${e.logIndex}`} className="px-5 py-3.5 sm:px-6">
                <div className={`hidden items-center gap-4 text-[13px] sm:grid ${COLS}`}>
                  <span className="truncate tabular-nums text-slate2">{time}</span>
                  <span>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${k.cls}`}>{k.label}</span>
                  </span>
                  <span className="font-mono text-slate2">#{e.holdId.toString()}</span>
                  <span className="text-right tabular-nums text-ink">{fmtUsdc(e.amount)}</span>
                  <span className="font-mono text-ink/90">{party ? shortAddress(party) : '—'}</span>
                  <span className="text-right">{link}</span>
                </div>
                <div className="space-y-2 sm:hidden">
                  <div className="flex items-center justify-between">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${k.cls}`}>{k.label}</span>
                    <span className="font-mono text-sm text-slate2">#{e.holdId.toString()}</span>
                  </div>
                  <div className="flex items-center justify-between text-[13px]">
                    <span className="font-semibold tabular-nums text-ink">{fmtUsdc(e.amount)} USDC</span>
                    {link}
                  </div>
                  <div className="text-xs text-slate2">{time}</div>
                </div>
              </li>
            )
          })}
        </ul>
      </>
    )
  })()

  return (
    <Panel>
      <PanelHeader
        title="Transaction History"
        subtitle="Reservations, captures and refunds read from contract events."
        right={
          <Segmented<Scope>
            label="Scope"
            value={scope}
            onChange={setPickedScope}
            options={[
              { value: 'mine', label: 'Mine' },
              { value: 'all', label: 'All' },
            ]}
          />
        }
      />
      {body}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-edge/[0.1] px-5 py-3 text-xs text-faint sm:px-6">
        {error ? (
          <span className="text-danger">{error}</span>
        ) : progress ? (
          <span>
            {syncing
              ? `Scanning blocks ${progress.from.toLocaleString()} to ${progress.head.toLocaleString()} (${pct}%)`
              : `Scanned blocks ${progress.from.toLocaleString()} to ${progress.scanned.toLocaleString()}.`}
            {!syncing && progress.truncated && ' Older events are not listed.'}
          </span>
        ) : (
          <span>Starting scan…</span>
        )}
        {events.length > PAGE && <span>Showing latest {PAGE}</span>}
      </div>
    </Panel>
  )
}
