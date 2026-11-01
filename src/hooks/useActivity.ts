import { useEffect, useRef, useState } from 'react'
import { usePublicClient } from 'wagmi'
import type { Address, Hash } from 'viem'
import { LATCH_ADDRESS, LATCH_CHAIN_ID, LATCH_DEPLOY_BLOCK, latchEvents } from '@/lib/latch'

export type ActivityKind = 'reserved' | 'captured' | 'refunded'

export interface ActivityEvent {
  kind: ActivityKind
  holdId: bigint
  amount: bigint
  payer?: Address
  recipient?: Address
  blockNumber: bigint
  logIndex: number
  txHash: Hash
}

export interface ActivityProgress {
  /** First block included in the scan. */
  from: bigint
  /** Last block scanned so far. */
  scanned: bigint
  head: bigint
  /** True when the scan starts after the deployment block, so older events are not listed. */
  truncated: boolean
}

// Measured against the Arc Testnet RPC: 5,000-block ranges succeed, 10,000 is rejected.
const CHUNK = 5_000n
// Bounded lookback so a cold start never crawls the whole chain.
const LOOKBACK = 100_000n
const POLL_MS = 8_000

const key = (e: ActivityEvent) => `${e.txHash}:${e.logIndex}`

/** Reads Latch events from the chain, bounded to the deployment block and a recent lookback. */
export function useActivity() {
  const client = usePublicClient({ chainId: LATCH_CHAIN_ID })
  const [events, setEvents] = useState<ActivityEvent[]>([])
  const [progress, setProgress] = useState<ActivityProgress | null>(null)
  const [error, setError] = useState<string | null>(null)
  const scannedRef = useRef<bigint | null>(null)
  const fromRef = useRef<bigint>(0n)

  useEffect(() => {
    if (!client || !LATCH_ADDRESS) return
    const address = LATCH_ADDRESS
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined

    const tick = async () => {
      try {
        const head = await client.getBlockNumber()
        if (scannedRef.current === null) {
          const floor = head > LOOKBACK ? head - LOOKBACK : 0n
          const from = LATCH_DEPLOY_BLOCK !== undefined && LATCH_DEPLOY_BLOCK > floor ? LATCH_DEPLOY_BLOCK : floor
          fromRef.current = from
          scannedRef.current = from - 1n
        }
        let start = scannedRef.current + 1n
        while (start <= head && !cancelled) {
          const end = start + CHUNK - 1n > head ? head : start + CHUNK - 1n
          const logs = await client.getLogs({ address, events: latchEvents, fromBlock: start, toBlock: end })
          if (cancelled) return
          const fresh: ActivityEvent[] = []
          for (const log of logs) {
            if (log.blockNumber === null || log.logIndex === null || log.transactionHash === null) continue
            const { holdId, amount } = log.args
            if (holdId === undefined || amount === undefined) continue
            const base = { holdId, amount, blockNumber: log.blockNumber, logIndex: log.logIndex, txHash: log.transactionHash }
            if (log.eventName === 'HoldCreated') {
              fresh.push({ ...base, kind: 'reserved', payer: log.args.payer, recipient: log.args.recipient })
            } else if (log.eventName === 'Captured') {
              fresh.push({ ...base, kind: 'captured', recipient: log.args.recipient })
            } else {
              fresh.push({ ...base, kind: 'refunded', payer: log.args.payer })
            }
          }
          if (fresh.length > 0) {
            setEvents((prev) => {
              const seen = new Set(prev.map(key))
              const merged = [...prev, ...fresh.filter((e) => !seen.has(key(e)))]
              merged.sort((a, b) =>
                a.blockNumber === b.blockNumber ? b.logIndex - a.logIndex : a.blockNumber > b.blockNumber ? -1 : 1,
              )
              return merged
            })
          }
          scannedRef.current = end
          start = end + 1n
          setProgress({
            from: fromRef.current,
            scanned: end,
            head,
            truncated: LATCH_DEPLOY_BLOCK === undefined || fromRef.current > LATCH_DEPLOY_BLOCK,
          })
        }
        if (!cancelled) setError(null)
      } catch {
        if (!cancelled) setError('Could not read activity from Arc Testnet. Retrying.')
      } finally {
        if (!cancelled) timer = setTimeout(() => void tick(), POLL_MS)
      }
    }

    void tick()
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [client])

  const syncing = progress === null || progress.scanned < progress.head
  return { events, progress, error, syncing }
}
