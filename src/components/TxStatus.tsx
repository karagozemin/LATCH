import { AlertCircle, CheckCircle2, ExternalLink, Loader2 } from 'lucide-react'
import { buildTxExplorerUrl } from '@/onchain-facts'
import { LATCH_CHAIN_ID } from '@/lib/latch'
import type { TxPhase } from '@/hooks/useTx'

interface Props {
  phase: TxPhase
  hash?: string
  error: string | null
  successLabel: string
  pendingLabel?: string
}

/** Inline receipt for a single transaction. Shows only states the wallet and chain have reported. */
export function TxStatus({ phase, hash, error, successLabel, pendingLabel = 'Transaction' }: Props) {
  if (phase === 'idle') return null
  if (phase === 'error' && !error) return null

  const link = hash ? (
    <a
      href={buildTxExplorerUrl(LATCH_CHAIN_ID, hash)}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-teal underline-offset-2 hover:underline"
    >
      View on explorer <ExternalLink className="size-3" />
    </a>
  ) : null

  const tone =
    phase === 'success'
      ? 'border-teal/25 bg-teal/[0.06]'
      : phase === 'error'
        ? 'border-danger/30 bg-danger/[0.07]'
        : 'border-edge/[0.15] bg-canvas'

  return (
    <div
      role="status"
      className={`flex animate-fade-up items-start justify-between gap-3 rounded-xl border px-3.5 py-3 text-[13px] ${tone}`}
    >
      <div className="flex min-w-0 items-start gap-2.5">
        {phase === 'success' ? (
          <CheckCircle2 className="mt-px size-4 shrink-0 text-teal" />
        ) : phase === 'error' ? (
          <AlertCircle className="mt-px size-4 shrink-0 text-danger" />
        ) : (
          <Loader2 className="mt-px size-4 shrink-0 animate-spin text-teal" />
        )}
        <div className="min-w-0">
          <div className="font-medium text-ink">
            {phase === 'signing' && `${pendingLabel}: confirm in your wallet`}
            {phase === 'confirming' && `${pendingLabel}: waiting for confirmation`}
            {phase === 'success' && successLabel}
            {phase === 'error' && `${pendingLabel} failed`}
          </div>
          {phase === 'error' && error && <div className="mt-0.5 text-slate2">{error}</div>}
          {phase === 'signing' && <div className="mt-0.5 text-slate2">Nothing is sent until you approve.</div>}
        </div>
      </div>
      {link}
    </div>
  )
}
