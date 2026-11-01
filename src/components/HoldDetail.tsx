import { useState, type ReactNode } from 'react'
import { useAccount } from 'wagmi'
import { ExternalLink, Loader2, MousePointerClick } from 'lucide-react'
import { LATCH_ADDRESS, LATCH_CHAIN_ID, latchAbi, remainingOf, statusOf, type Hold } from '@/lib/latch'
import { fmtDate, fmtDuration, fmtUsdc } from '@/lib/format'
import { buildTxExplorerUrl } from '@/onchain-facts'
import { parseUsdc } from '@/onchain-money'
import { useTx } from '@/hooks/useTx'
import type { ActivityEvent } from '@/hooks/useActivity'
import { Label, Panel, PanelHeader, Skeleton } from '@/components/ui/Panel'
import { AddressChip } from '@/components/ui/AddressChip'
import { StatusChip } from '@/components/ui/StatusChip'
import { EmptyState } from './EmptyState'
import { TxStatus } from './TxStatus'

interface Props {
  hold: Hold | undefined
  now: number
  isLoading: boolean
  hasHolds: boolean
  events: ActivityEvent[]
  activitySyncing: boolean
  onChanged: () => void
}

const EVENT_LABEL = { reserved: 'Reserved', captured: 'Captured', refunded: 'Refunded' } as const

function Stat({ label, value, tone }: { label: string; value: bigint; tone?: 'teal' }) {
  return (
    <div className="min-w-0">
      <Label>{label}</Label>
      <div className={`mt-1 truncate text-lg font-semibold tabular-nums tracking-tight ${tone === 'teal' ? 'text-teal' : 'text-ink'}`}>
        {fmtUsdc(value)}
      </div>
    </div>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <dt className="text-[13px] text-slate2">{label}</dt>
      <dd className="min-w-0 text-right text-[13px] text-ink">{children}</dd>
    </div>
  )
}

export function HoldDetail({ hold, now, isLoading, hasHolds, events, activitySyncing, onChanged }: Props) {
  const { address, isConnected, chainId } = useAccount()
  const [capAmount, setCapAmount] = useState('')
  const captureTx = useTx(() => {
    setCapAmount('')
    onChanged()
  })
  const refundTx = useTx(onChanged)

  if (isLoading && !hold) {
    return (
      <Panel id="hold-detail">
        <PanelHeader title="Authorization Details" />
        <div className="space-y-4 p-6">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      </Panel>
    )
  }

  if (!hold) {
    return (
      <Panel id="hold-detail">
        <PanelHeader title="Authorization Details" subtitle="Select an authorization to inspect it." />
        <EmptyState
          icon={<MousePointerClick className="size-5" strokeWidth={1.5} />}
          title={hasHolds ? 'Nothing selected' : 'No authorization to show'}
          body={
            hasHolds
              ? 'Choose a row in the table to see its amounts, permissions and available actions.'
              : 'Once an authorization exists, its real amounts, status and actions appear here.'
          }
        />
      </Panel>
    )
  }

  const me = address?.toLowerCase()
  const isRecipient = me === hold.recipient.toLowerCase()
  const isPayer = me === hold.payer.toLowerCase()
  const status = statusOf(hold, now)
  const left = remainingOf(hold)
  const secondsLeft = Number(hold.expiry) - now
  const wrongChain = isConnected && chainId !== LATCH_CHAIN_ID

  let capRaw: bigint | null = null
  try {
    const v = capAmount === '' ? left : parseUsdc(capAmount)
    capRaw = v > 0n ? v : null
  } catch {
    capRaw = null
  }
  const capInvalid = capRaw === null || capRaw > left

  const canCapture = isRecipient && status === 'active'
  const canRefund = isPayer && status === 'expired' && left > 0n

  const pct = (n: bigint) => (hold.deposited > 0n ? Number((n * 10000n) / hold.deposited) / 100 : 0)
  const capturedPct = pct(hold.captured)
  const refundedPct = pct(hold.refunded)

  const capture = () => {
    if (capRaw === null || !LATCH_ADDRESS) return
    const latch = LATCH_ADDRESS
    const amt = capRaw
    void captureTx.run((write) =>
      write({ address: latch, abi: latchAbi, functionName: 'capture', args: [hold.id, amt], chainId: LATCH_CHAIN_ID }),
    )
  }
  const refund = () => {
    if (!LATCH_ADDRESS) return
    const latch = LATCH_ADDRESS
    void refundTx.run((write) =>
      write({ address: latch, abi: latchAbi, functionName: 'refundExpired', args: [hold.id], chainId: LATCH_CHAIN_ID }),
    )
  }

  const note = (() => {
    if (!isConnected) return 'Connect a wallet to act on this authorization.'
    if (status === 'captured') return 'Fully captured. This authorization is settled.'
    if (status === 'refunded') return 'Refunded to the payer. This authorization is settled.'
    if (!isPayer && !isRecipient) return 'Your wallet is not a party to this authorization. View only.'
    if (isRecipient && status === 'expired') return 'The capture window has closed. The payer can now refund the remainder.'
    if (isPayer && status === 'active') return `You can refund the unused balance after ${fmtDate(hold.expiry)}.`
    return null
  })()

  const related = events.filter((e) => e.holdId === hold.id)
  const primary =
    'flex h-10 items-center justify-center gap-2 rounded-xl bg-teal px-5 text-sm font-semibold text-teal-ink transition-colors hover:bg-teal-strong disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-teal'

  return (
    <Panel id="hold-detail">
      <PanelHeader
        title={`Authorization #${hold.id.toString()}`}
        subtitle="Live from the Latch contract on Arc Testnet."
        right={<StatusChip status={status} />}
      />

      <div className="space-y-5 px-5 py-5 sm:px-6">
        <div>
          <div className="grid grid-cols-3 gap-4">
            <Stat label="Deposited" value={hold.deposited} />
            <Stat label="Captured" value={hold.captured} />
            <Stat
              label={hold.refunded > 0n ? 'Refunded' : 'Remaining'}
              value={hold.refunded > 0n ? hold.refunded : left}
              tone={hold.refunded === 0n && left > 0n ? 'teal' : undefined}
            />
          </div>
          <div
            className="mt-4 flex h-1.5 w-full overflow-hidden rounded-full bg-edge/[0.12]"
            role="progressbar"
            aria-valuenow={Math.round(capturedPct)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Captured share of the deposit"
          >
            <div className="h-full bg-teal transition-[width] duration-500" style={{ width: `${capturedPct}%` }} />
            <div className="h-full bg-slate2/60 transition-[width] duration-500" style={{ width: `${refundedPct}%` }} />
          </div>
          <div className="mt-2 flex justify-between text-xs text-slate2">
            <span className="tabular-nums">{capturedPct.toFixed(capturedPct % 1 === 0 ? 0 : 1)}% captured</span>
            <span>USDC</span>
          </div>
        </div>

        <dl className="divide-y divide-edge/[0.1] border-y border-edge/[0.1]">
          <Row label="Payer">
            <AddressChip address={hold.payer} you={isPayer} />
          </Row>
          <Row label="Recipient">
            <AddressChip address={hold.recipient} you={isRecipient} />
          </Row>
          <Row label="Expiry">
            <span className="tabular-nums">{fmtDate(hold.expiry)}</span>
            <span className="block text-xs text-slate2">
              {status === 'active' ? `in ${fmtDuration(secondsLeft)}` : `${fmtDuration(-secondsLeft)} ago`}
            </span>
          </Row>
        </dl>

        {canCapture && (
          <div className="space-y-2">
            <Label>Capture</Label>
            <div className="flex gap-2">
              <div className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-xl border border-edge/[0.15] bg-canvas px-3 transition-colors focus-within:border-teal/60">
                <input
                  inputMode="decimal"
                  value={capAmount}
                  onChange={(e) => {
                    const v = e.target.value.replace(/,/g, '.')
                    if (v === '' || /^\d*\.?\d{0,6}$/.test(v)) setCapAmount(v)
                  }}
                  placeholder={fmtUsdc(left)}
                  aria-label="Amount to capture"
                  className="min-w-0 flex-1 bg-transparent text-sm tabular-nums text-ink outline-none placeholder:text-faint"
                />
                <button
                  type="button"
                  onClick={() => setCapAmount(fmtUsdc(left).replace(/,/g, ''))}
                  className="text-xs font-medium text-teal hover:underline"
                >
                  Max
                </button>
              </div>
              <button disabled={capInvalid || captureTx.busy} onClick={capture} className={primary}>
                {captureTx.busy ? <Loader2 className="size-4 animate-spin" /> : 'Capture'}
              </button>
            </div>
            <p className="text-xs text-faint">
              {capAmount !== '' && capInvalid
                ? `Enter an amount between 0 and ${fmtUsdc(left)} USDC.`
                : `Leave empty to capture all ${fmtUsdc(left)} USDC remaining.`}
            </p>
          </div>
        )}

        {canRefund && (
          <button disabled={refundTx.busy} onClick={refund} className={`${primary} w-full`}>
            {refundTx.busy ? <Loader2 className="size-4 animate-spin" /> : `Refund ${fmtUsdc(left)} USDC`}
          </button>
        )}

        {wrongChain && (canCapture || canRefund) && (
          <p className="text-xs text-warn">Your wallet will be asked to switch to Arc Testnet first.</p>
        )}
        {note && <p className="text-[13px] text-pretty text-slate2">{note}</p>}

        <div className="space-y-2">
          <TxStatus
            phase={captureTx.phase}
            hash={captureTx.hash}
            error={captureTx.error}
            pendingLabel="Capture"
            successLabel="Capture confirmed."
          />
          <TxStatus
            phase={refundTx.phase}
            hash={refundTx.hash}
            error={refundTx.error}
            pendingLabel="Refund"
            successLabel="Refund confirmed."
          />
        </div>

        <div>
          <Label>Onchain activity</Label>
          {related.length > 0 ? (
            <ul className="mt-2 divide-y divide-edge/[0.1] rounded-xl border border-edge/[0.12]">
              {related.map((e) => (
                <li key={`${e.txHash}:${e.logIndex}`} className="flex items-center justify-between gap-3 px-3.5 py-2.5 text-[13px]">
                  <span className="text-ink">{EVENT_LABEL[e.kind]}</span>
                  <span className="tabular-nums text-slate2">{fmtUsdc(e.amount)} USDC</span>
                  <a
                    href={buildTxExplorerUrl(LATCH_CHAIN_ID, e.txHash)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-medium text-teal hover:underline"
                  >
                    Tx <ExternalLink className="size-3" />
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-xs text-faint">
              {activitySyncing ? 'Scanning recent blocks for this authorization…' : 'No events found in the scanned block range.'}
            </p>
          )}
        </div>
      </div>
    </Panel>
  )
}
