import { BaseError, ContractFunctionRevertedError, UserRejectedRequestError } from 'viem'
import { formatUnitsFixed } from '@/onchain-money'
import { USDC_DECIMALS } from '@/onchain-facts'

export const shortAddress = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`

/** USDC with at least 2 and at most 6 fraction digits, trailing zeros trimmed down to 2. */
export function fmtUsdc(raw: bigint): string {
  const full = formatUnitsFixed(raw, USDC_DECIMALS, USDC_DECIMALS)
  const [whole, frac = ''] = full.split('.')
  const trimmed = frac.replace(/0+$/, '').padEnd(2, '0')
  return `${Number(whole).toLocaleString('en-US')}.${trimmed}`
}

export function fmtDuration(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec))
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${sec}s`
  return `${sec}s`
}

export function fmtDate(sec: bigint): string {
  return new Date(Number(sec) * 1000).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

const REVERT_COPY: Record<string, string> = {
  InvalidRecipient: 'Recipient cannot be the zero address or your own wallet.',
  ZeroAmount: 'Amount must be greater than zero.',
  InvalidExpiry: 'Expiry must be in the future.',
  UnknownHold: 'That hold does not exist.',
  NotRecipient: 'Only the designated recipient can capture.',
  NotPayer: 'Only the payer can refund.',
  HoldNotActive: 'This hold is already settled.',
  HoldExpired: 'This hold has expired, so it can no longer be captured.',
  HoldNotExpired: 'This hold has not expired yet, so it cannot be refunded.',
  AmountExceedsRemaining: 'Amount exceeds what remains in this hold.',
  NothingToRefund: 'Nothing left to refund.',
  UnexpectedDepositBalance: 'The deposit did not arrive in full, so it was rolled back.',
}

/** Returns null when the user simply cancelled in their wallet. */
export function describeError(err: unknown): string | null {
  if (!err) return null
  if (err instanceof BaseError) {
    if (err.walk((e) => e instanceof UserRejectedRequestError)) return null
    const reverted = err.walk((e) => e instanceof ContractFunctionRevertedError)
    if (reverted instanceof ContractFunctionRevertedError) {
      const name = reverted.data?.errorName
      if (name && REVERT_COPY[name]) return REVERT_COPY[name]
    }
    const msg = err.shortMessage.toLowerCase()
    if (msg.includes('user rejected') || msg.includes('user denied')) return null
    if (msg.includes('insufficient funds') || msg.includes('exceeds balance')) {
      return 'Insufficient USDC for this amount plus gas.'
    }
    return err.shortMessage
  }
  if (err instanceof Error && err.message.toLowerCase().includes('user rejected')) return null
  return 'Something went wrong. Please try again.'
}
