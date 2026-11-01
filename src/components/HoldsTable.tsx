import { useState } from 'react'
import { useAccount } from 'wagmi'
import { ArrowRight, Inbox, Wallet } from 'lucide-react'
import { LATCH_CHAIN_ID, remainingOf, statusOf, type Hold } from '@/lib/latch'
import { fmtDate, fmtDuration, fmtUsdc, shortAddress } from '@/lib/format'
import { networkLabel } from '@/lib/network'
import { Panel, PanelHeader, Skeleton } from '@/components/ui/Panel'
import { Segmented } from '@/components/ui/Segmented'
import { StatusChip } from '@/components/ui/StatusChip'
import { CopyButton } from '@/components/ui/CopyButton'
import { EmptyState } from './EmptyState'

type Scope = 'mine' | 'all'

interface Props {
  title: string
  subtitle: string
  holds: Hold[]
  total: number
  now: number
  isLoading: boolean
  isError: boolean
  selectedId: bigint | undefined
  onSelect: (id: bigint) => void
  /** Only show holds that still hold funds (Active, or Expired with a remainder). */
  openOnly?: boolean
  onCreate: () => void
}

const COLS = 'md:grid-cols-[56px_minmax(0,1.3fr)_repeat(3,minmax(0,1fr))_minmax(0,1.3fr)_132px_92px]'

export function HoldsTable({
  title,
  subtitle,
  holds,
  total,
  now,
  isLoading,
  isError,
  selectedId,
  onSelect,
  openOnly = false,
  onCreate,
}: Props) {
  const { address, isConnected } = useAccount()
  const [pickedScope, setPickedScope] = useState<Scope | null>(null)
  const scope: Scope = pickedScope ?? (isConnected ? 'mine' : 'all')
  const me = address?.toLowerCase()

  const visible = holds.filter((h) => {
    if (openOnly) {
      const s = statusOf(h, now)
      if (s !== 'active' && !(s === 'expired' && remainingOf(h) > 0n)) return false
    }
    return scope === 'all' || h.payer.toLowerCase() === me || h.recipient.toLowerCase() === me
  })

  const actionFor = (h: Hold): string => {
    const s = statusOf(h, now)
    const isRecipient = h.recipient.toLowerCase() === me
    const isPayer = h.payer.toLowerCase() === me
    if (isRecipient && s === 'active') return 'Capture'
    if (isPayer && s === 'expired') return 'Refund'
    return 'View'
  }

  const body = (() => {
    if (isError) {
      return (
        <EmptyState
          icon={<Inbox className="size-5" strokeWidth={1.5} />}
          title="Could not load authorizations"
          body={`Reading from ${networkLabel(LATCH_CHAIN_ID)} failed. This view retries automatically every few seconds.`}
        />
      )
    }
    if (isLoading) {
      return (
        <div className="space-y-3 p-5">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      )
    }
    if (scope === 'mine' && !isConnected) {
      return (
        <EmptyState
          icon={<Wallet className="size-5" strokeWidth={1.5} />}
          title="Connect to see your authorizations"
          body="Holds you created, or that were made out to you, appear here once your wallet is connected. You can also switch to All to browse every hold."
        />
      )
    }
    if (visible.length === 0) {
      const none = total === 0
      return (
        <EmptyState
          icon={<Inbox className="size-5" strokeWidth={1.5} />}
          title={
            none
              ? 'No authorizations yet'
              : openOnly
                ? 'No open authorizations'
                : scope === 'mine'
                  ? 'No authorizations for your wallet'
                  : 'Nothing to show'
          }
          body={
            none
              ? 'Reserve USDC for a recipient to create the first authorization. It will appear here with live amounts and status.'
              : scope === 'mine'
                ? 'Create an authorization, or ask a payer to reserve USDC for your address. Switch to All to see every hold on the contract.'
                : 'Everything on the contract is already settled.'
          }
          action={
            <button
              onClick={onCreate}
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-teal px-4 text-[13px] font-semibold text-teal-ink transition-colors hover:bg-teal-strong"
            >
              Create authorization <ArrowRight className="size-3.5" />
            </button>
          }
        />
      )
    }
    return (
      <>
        <div
          className={`hidden gap-4 border-b border-edge/[0.1] px-6 py-2.5 text-[11px] font-medium uppercase tracking-[0.09em] text-faint md:grid ${COLS}`}
        >
          <span>ID</span>
          <span>Recipient</span>
          <span className="text-right">Reserved</span>
          <span className="text-right">Captured</span>
          <span className="text-right">Remaining</span>
          <span>Expiry</span>
          <span>Status</span>
          <span className="text-right">Action</span>
        </div>
        <ul className="divide-y divide-edge/[0.08]">
          {visible.map((h) => {
            const status = statusOf(h, now)
            const selected = selectedId === h.id
            const action = actionFor(h)
            const secondsLeft = Number(h.expiry) - now
            const left = remainingOf(h)
            const actionBtn = (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onSelect(h.id)
                }}
                className={`h-8 rounded-lg px-3 text-xs font-semibold transition-colors ${
                  action === 'View'
                    ? 'border border-edge/[0.18] text-slate2 hover:border-edge/35 hover:text-ink'
                    : 'bg-teal text-teal-ink hover:bg-teal-strong'
                }`}
              >
                {action}
              </button>
            )
            return (
              <li
                key={h.id.toString()}
                onClick={() => onSelect(h.id)}
                className={`relative cursor-pointer px-5 py-3.5 transition-colors sm:px-6 ${
                  selected ? 'bg-teal/[0.05]' : 'hover:bg-edge/[0.05]'
                }`}
              >
                {selected && <span className="absolute inset-y-0 left-0 w-0.5 bg-teal" />}

                <div className={`hidden items-center gap-4 text-[13px] md:grid ${COLS}`}>
                  <span className="font-mono text-slate2">#{h.id.toString()}</span>
                  <span className="flex items-center gap-1 font-mono text-ink/90">
                    {shortAddress(h.recipient)}
                    <CopyButton value={h.recipient} label="Copy recipient address" />
                  </span>
                  <span className="text-right tabular-nums text-ink">{fmtUsdc(h.deposited)}</span>
                  <span className="text-right tabular-nums text-ink">{fmtUsdc(h.captured)}</span>
                  <span className={`text-right tabular-nums ${left > 0n ? 'text-ink' : 'text-faint'}`}>{fmtUsdc(left)}</span>
                  <span className="min-w-0">
                    <span className="block truncate tabular-nums text-ink/90">{fmtDate(h.expiry)}</span>
                    {status === 'active' && <span className="text-xs text-slate2">in {fmtDuration(secondsLeft)}</span>}
                  </span>
                  <span>
                    <StatusChip status={status} />
                  </span>
                  <span className="text-right">{actionBtn}</span>
                </div>

                <div className="space-y-3 md:hidden">
                  <div className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-2">
                      <span className="font-mono text-sm text-slate2">#{h.id.toString()}</span>
                      <span className="font-mono text-[13px] text-ink/90">{shortAddress(h.recipient)}</span>
                    </span>
                    <StatusChip status={status} />
                  </div>
                  <div className="grid grid-cols-3 gap-3 text-[13px]">
                    <div>
                      <div className="text-[11px] uppercase tracking-wide text-faint">Reserved</div>
                      <div className="tabular-nums text-ink">{fmtUsdc(h.deposited)}</div>
                    </div>
                    <div>
                      <div className="text-[11px] uppercase tracking-wide text-faint">Captured</div>
                      <div className="tabular-nums text-ink">{fmtUsdc(h.captured)}</div>
                    </div>
                    <div>
                      <div className="text-[11px] uppercase tracking-wide text-faint">Remaining</div>
                      <div className="tabular-nums text-ink">{fmtUsdc(left)}</div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs text-slate2">
                      {status === 'active' ? `Expires in ${fmtDuration(secondsLeft)}` : fmtDate(h.expiry)}
                    </span>
                    {actionBtn}
                  </div>
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
        title={title}
        subtitle={subtitle}
        right={
          <Segmented<Scope>
            label="Scope"
            value={scope}
            onChange={setPickedScope}
            options={[
              { value: 'mine', label: 'Mine' },
              { value: 'all', label: `All (${total})` },
            ]}
          />
        }
      />
      {body}
      {!isLoading && !isError && total > holds.length && (
        <p className="border-t border-edge/[0.1] px-6 py-3 text-xs text-faint">
          Showing the latest {holds.length} of {total} authorizations.
        </p>
      )}
    </Panel>
  )
}
