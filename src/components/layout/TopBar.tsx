import { ConnectKitButton } from 'connectkit'
import { AlertTriangle, LogOut } from 'lucide-react'
import { useAccount, useDisconnect, useSwitchChain } from 'wagmi'
import { LATCH_CHAIN_ID } from '@/lib/latch'
import { networkLabel } from '@/lib/network'
import { shortAddress } from '@/lib/format'
import { CopyButton } from '@/components/ui/CopyButton'
import { Wordmark } from './Wordmark'

function NetworkBadge() {
  const { isConnected, chainId } = useAccount()
  const { switchChain, isPending } = useSwitchChain()

  if (!isConnected || chainId === undefined) {
    return (
      <span
        className="inline-flex h-8 items-center gap-2 rounded-full border border-edge/[0.15] px-3 text-xs font-medium text-slate2"
        title="The network this app is configured for"
      >
        <span className="size-1.5 rounded-full border border-slate2" />
        {networkLabel(LATCH_CHAIN_ID)}
      </span>
    )
  }

  if (chainId === LATCH_CHAIN_ID) {
    return (
      <span className="inline-flex h-8 items-center gap-2 rounded-full border border-teal/25 bg-teal/[0.08] px-3 text-xs font-medium text-teal">
        <span className="relative flex size-1.5">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-teal opacity-60" />
          <span className="relative inline-flex size-1.5 rounded-full bg-teal" />
        </span>
        {networkLabel(chainId)}
      </span>
    )
  }

  return (
    <button
      onClick={() => switchChain({ chainId: LATCH_CHAIN_ID })}
      disabled={isPending}
      className="inline-flex h-8 items-center gap-2 rounded-full border border-warn/35 bg-warn/[0.08] px-3 text-xs font-medium text-warn transition-colors hover:bg-warn/[0.14] disabled:opacity-60"
      title={`Switch your wallet to ${networkLabel(LATCH_CHAIN_ID)}`}
    >
      <AlertTriangle className="size-3.5" />
      <span className="hidden sm:inline">{networkLabel(chainId)} · </span>
      Switch to {networkLabel(LATCH_CHAIN_ID)}
    </button>
  )
}

function WalletControl() {
  const { address, isConnected, isConnecting, isReconnecting } = useAccount()
  const { disconnect } = useDisconnect()

  if (isConnected && address) {
    return (
      <div className="flex items-center gap-1.5">
        <div className="flex h-8 items-center gap-2 rounded-full border border-edge/[0.15] bg-panel pl-3 pr-1">
          <span className="size-1.5 rounded-full bg-teal" aria-hidden />
          <span className="hidden text-[11px] font-medium uppercase tracking-wide text-faint sm:inline">Connected</span>
          <span className="font-mono text-xs text-ink">{shortAddress(address)}</span>
          <CopyButton value={address} label="Copy wallet address" />
        </div>
        <button
          onClick={() => disconnect()}
          aria-label="Disconnect wallet"
          title="Disconnect"
          className="inline-flex size-8 items-center justify-center rounded-full border border-edge/[0.15] text-slate2 transition-colors hover:border-danger/40 hover:text-danger"
        >
          <LogOut className="size-3.5" />
        </button>
      </div>
    )
  }

  return (
    <ConnectKitButton.Custom>
      {({ show }) => (
        <button
          onClick={show}
          disabled={isConnecting || isReconnecting}
          className="inline-flex h-8 items-center rounded-full bg-teal px-4 text-xs font-semibold text-teal-ink transition-colors hover:bg-teal-strong disabled:opacity-60"
        >
          {isConnecting || isReconnecting ? 'Connecting…' : 'Connect wallet'}
        </button>
      )}
    </ConnectKitButton.Custom>
  )
}

export function TopBar({ title }: { title: string }) {
  return (
    <header className="sticky top-0 z-30 border-b border-edge/[0.1] bg-canvas/85 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-[1240px] items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
        <div className="flex min-w-0 items-center gap-4">
          <Wordmark className="lg:hidden" />
          <h1 className="hidden truncate text-[15px] font-semibold tracking-tight text-ink lg:block">{title}</h1>
        </div>
        <div className="flex items-center gap-2">
          <NetworkBadge />
          <WalletControl />
        </div>
      </div>
    </header>
  )
}
