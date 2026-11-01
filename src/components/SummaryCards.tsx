import { useMemo } from 'react'
import { useAccount } from 'wagmi'
import { ArrowDownToLine, Lock, Undo2, type LucideIcon } from 'lucide-react'
import { fmtUsdc } from '@/lib/format'
import { networkLabel } from '@/lib/network'
import { LATCH_CHAIN_ID, remainingOf, statusOf, type Hold } from '@/lib/latch'
import { Label, Panel, Skeleton } from '@/components/ui/Panel'

interface Props {
  holds: Hold[]
  total: number
  now: number
  isLoading: boolean
  isError: boolean
}

interface CardProps {
  label: string
  icon: LucideIcon
  value: bigint | null
  note: string
  state: 'loading' | 'error' | 'disconnected' | 'ready'
  accent?: boolean
}

function Card({ label, icon: Icon, value, note, state, accent }: CardProps) {
  return (
    <Panel className="p-5">
      <div className="flex items-center justify-between">
        <Label>{label}</Label>
        <Icon className={`size-4 ${accent ? 'text-teal' : 'text-faint'}`} strokeWidth={1.75} />
      </div>
      <div className="mt-4 flex min-h-9 items-baseline gap-1.5">
        {state === 'loading' ? (
          <Skeleton className="h-8 w-32" />
        ) : state === 'ready' && value !== null ? (
          <>
            <span className="text-[32px] font-semibold leading-none tracking-[-0.03em] tabular-nums text-ink">
              {fmtUsdc(value)}
            </span>
            <span className="text-sm font-medium text-faint">USDC</span>
          </>
        ) : (
          <span className="text-[32px] font-semibold leading-none text-faint">—</span>
        )}
      </div>
      <p className="mt-3 text-xs text-pretty text-slate2">
        {state === 'disconnected'
          ? 'Connect a wallet to see your totals.'
          : state === 'error'
            ? 'Unavailable right now. Retrying.'
            : state === 'loading'
              ? `Reading from ${networkLabel(LATCH_CHAIN_ID)}…`
              : note}
      </p>
    </Panel>
  )
}

/** Totals for holds the connected wallet created, computed from live contract reads. */
export function SummaryCards({ holds, total, now, isLoading, isError }: Props) {
  const { address, isConnected } = useAccount()

  const sums = useMemo(() => {
    const me = address?.toLowerCase()
    let reserved = 0n
    let captured = 0n
    let refundable = 0n
    let count = 0
    for (const h of holds) {
      if (h.payer.toLowerCase() !== me) continue
      count++
      reserved += h.deposited
      captured += h.captured
      if (statusOf(h, now) === 'expired') refundable += remainingOf(h)
    }
    return { reserved, captured, refundable, count }
  }, [holds, address, now])

  const state: CardProps['state'] = !isConnected
    ? 'disconnected'
    : isLoading
      ? 'loading'
      : isError
        ? 'error'
        : 'ready'

  const scope =
    sums.count === 0
      ? 'You have not created any authorizations yet.'
      : `Across ${sums.count} authorization${sums.count === 1 ? '' : 's'} you created${total > holds.length ? ' (latest 60 read)' : ''}.`

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Card label="Total Reserved" icon={Lock} value={sums.reserved} state={state} note={scope} />
      <Card
        label="Total Captured"
        icon={ArrowDownToLine}
        value={sums.captured}
        state={state}
        note="Already paid out to recipients."
      />
      <Card
        label="Available to Refund"
        icon={Undo2}
        value={sums.refundable}
        state={state}
        accent
        note={sums.refundable > 0n ? 'Expired holds you can refund now.' : 'Nothing is refundable yet. Holds unlock after expiry.'}
      />
    </div>
  )
}
