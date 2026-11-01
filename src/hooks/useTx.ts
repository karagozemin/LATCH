import { useEffect, useRef } from 'react'
import { useAccount, useSwitchChain, useWaitForTransactionReceipt, useWriteContract } from 'wagmi'
import { LATCH_CHAIN_ID } from '@/lib/latch'
import { describeError } from '@/lib/format'

export type TxPhase = 'idle' | 'signing' | 'confirming' | 'success' | 'error'

type Write = ReturnType<typeof useWriteContract>['writeContractAsync']

/**
 * One onchain write with honest phases: wallet signature, confirmation, result.
 * Switches to Arc Testnet first when the wallet is on another chain.
 */
export function useTx(onConfirmed?: () => void) {
  const { chainId } = useAccount()
  const { switchChainAsync } = useSwitchChain()
  const { writeContractAsync, data: hash, isPending, error: writeError, reset } = useWriteContract()
  const receipt = useWaitForTransactionReceipt({ hash, chainId: LATCH_CHAIN_ID })

  const confirmedRef = useRef<string | undefined>(undefined)
  const cb = useRef(onConfirmed)
  useEffect(() => {
    cb.current = onConfirmed
  })

  const reverted = receipt.data?.status === 'reverted'
  const succeeded = receipt.data?.status === 'success'

  useEffect(() => {
    if (succeeded && hash && confirmedRef.current !== hash) {
      confirmedRef.current = hash
      cb.current?.()
    }
  }, [succeeded, hash])

  let phase: TxPhase = 'idle'
  if (isPending) phase = 'signing'
  else if (hash && !receipt.data && !receipt.error) phase = 'confirming'
  else if (succeeded) phase = 'success'
  else if (reverted || writeError || receipt.error) phase = 'error'

  const error = reverted
    ? 'The transaction was reverted onchain.'
    : describeError(writeError ?? receipt.error)

  const run = async (fn: (write: Write) => unknown) => {
    try {
      if (chainId !== LATCH_CHAIN_ID) await switchChainAsync({ chainId: LATCH_CHAIN_ID })
      await fn(writeContractAsync)
    } catch {
      // surfaced through writeError
    }
  }

  return { run, phase, hash, error, reset, busy: phase === 'signing' || phase === 'confirming' }
}
