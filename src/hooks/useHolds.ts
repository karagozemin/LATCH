import { useEffect, useMemo, useState } from 'react'
import { useReadContract, useReadContracts } from 'wagmi'
import type { Address } from 'viem'
import { LATCH_ADDRESS, LATCH_CHAIN_ID, latchAbi, type Hold } from '@/lib/latch'

interface RawHold {
  payer: Address
  recipient: Address
  deposited: bigint
  captured: bigint
  refunded: bigint
  expiry: bigint
  status: number
}

const MAX_HOLDS = 60
const POLL_MS = 5000

/** Ticks once a second so countdowns and statuses stay current. */
export function useNow(): number {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000))
  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000)
    return () => clearInterval(t)
  }, [])
  return now
}

/** Reads the latest holds straight from the contract (newest first). */
export function useHolds() {
  const count = useReadContract({
    address: LATCH_ADDRESS,
    abi: latchAbi,
    functionName: 'holdCount',
    chainId: LATCH_CHAIN_ID,
    query: { enabled: !!LATCH_ADDRESS, refetchInterval: POLL_MS },
  })

  const total = Number(count.data ?? 0n)
  const ids = useMemo(() => {
    const first = Math.max(1, total - MAX_HOLDS + 1)
    const out: number[] = []
    for (let i = total; i >= first; i--) out.push(i)
    return out
  }, [total])

  const reads = useReadContracts({
    contracts: ids.map((id) => ({
      address: LATCH_ADDRESS,
      abi: latchAbi,
      functionName: 'getHold' as const,
      args: [BigInt(id)] as const,
      chainId: LATCH_CHAIN_ID,
    })),
    query: { enabled: !!LATCH_ADDRESS && ids.length > 0, refetchInterval: POLL_MS },
  })

  const holds: Hold[] = useMemo(() => {
    const out: Hold[] = []
    reads.data?.forEach((r, i) => {
      if (r.status !== 'success') return
      const h = r.result as RawHold
      out.push({
        id: BigInt(ids[i]),
        payer: h.payer,
        recipient: h.recipient,
        deposited: h.deposited,
        captured: h.captured,
        refunded: h.refunded,
        expiry: h.expiry,
        rawStatus: h.status,
      })
    })
    return out
  }, [reads.data, ids])

  const refetch = () => {
    void count.refetch()
    void reads.refetch()
  }

  return {
    holds,
    total,
    isLoading: count.isLoading || (ids.length > 0 && reads.isLoading),
    isError: count.isError || reads.isError,
    refetch,
  }
}
