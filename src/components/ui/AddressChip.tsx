import { ExternalLink } from 'lucide-react'
import { LATCH_CHAIN_ID } from '@/lib/latch'
import { shortAddress } from '@/lib/format'
import { buildAddressExplorerUrl } from '@/onchain-facts'
import { CopyButton } from './CopyButton'

interface Props {
  address: string
  you?: boolean
  full?: boolean
}

/** Address with copy and explorer link. */
export function AddressChip({ address, you = false, full = false }: Props) {
  return (
    <span className="inline-flex items-center gap-1 align-middle">
      <span className="font-mono text-[13px] text-ink/90" title={address}>
        {full ? address : shortAddress(address)}
      </span>
      {you && (
        <span className="rounded bg-teal/[0.12] px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-teal">
          you
        </span>
      )}
      <CopyButton value={address} label="Copy address" />
      <a
        href={buildAddressExplorerUrl(LATCH_CHAIN_ID, address)}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="View address on explorer"
        title="View on explorer"
        className="inline-flex size-6 shrink-0 items-center justify-center rounded-md text-faint transition-colors hover:bg-edge/[0.12] hover:text-ink"
      >
        <ExternalLink className="size-3.5" />
      </a>
    </span>
  )
}
