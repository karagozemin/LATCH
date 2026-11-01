import { arcTestnet } from 'viem/chains'
import { isAddress, parseAbiItem, type Address } from 'viem'
import { getUsdc } from '@/onchain-facts'

export const LATCH_CHAIN_ID = arcTestnet.id

const rawAddress = import.meta.env.VITE_LATCH_ADDRESS as string | undefined
export const LATCH_ADDRESS: Address | undefined =
  rawAddress && isAddress(rawAddress) ? rawAddress : undefined

const rawDeployBlock = import.meta.env.VITE_LATCH_DEPLOY_BLOCK as string | undefined
/** Block the contract was deployed at. Bounds the activity scan; never scan from genesis. */
export const LATCH_DEPLOY_BLOCK: bigint | undefined =
  rawDeployBlock && /^\d+$/.test(rawDeployBlock) ? BigInt(rawDeployBlock) : undefined

export const latchEvents = [
  parseAbiItem(
    'event HoldCreated(uint256 indexed holdId, address indexed payer, address indexed recipient, uint256 amount, uint256 expiry)',
  ),
  parseAbiItem('event Captured(uint256 indexed holdId, address indexed recipient, uint256 amount, uint256 remaining)'),
  parseAbiItem('event Refunded(uint256 indexed holdId, address indexed payer, uint256 amount)'),
] as const

const usdc = getUsdc(LATCH_CHAIN_ID)
if (!usdc) throw new Error('USDC fact missing for Arc Testnet')
export const USDC_ADDRESS = usdc.address as Address

export const latchAbi = [
  {
    type: 'function',
    name: 'createHold',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'recipient', type: 'address' },
      { name: 'amount', type: 'uint256' },
      { name: 'expiry', type: 'uint256' },
    ],
    outputs: [{ name: 'holdId', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'capture',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'holdId', type: 'uint256' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'refundExpired',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'holdId', type: 'uint256' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'holdCount',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'remaining',
    stateMutability: 'view',
    inputs: [{ name: 'holdId', type: 'uint256' }],
    outputs: [{ name: 'amount', type: 'uint256' }],
  },
  { type: 'error', name: 'InvalidRecipient', inputs: [] },
  { type: 'error', name: 'ZeroAmount', inputs: [] },
  { type: 'error', name: 'InvalidExpiry', inputs: [{ name: 'expiry', type: 'uint256' }] },
  { type: 'error', name: 'UnknownHold', inputs: [{ name: 'holdId', type: 'uint256' }] },
  { type: 'error', name: 'NotRecipient', inputs: [] },
  { type: 'error', name: 'NotPayer', inputs: [] },
  { type: 'error', name: 'HoldNotActive', inputs: [{ name: 'holdId', type: 'uint256' }] },
  { type: 'error', name: 'HoldExpired', inputs: [{ name: 'expiry', type: 'uint256' }] },
  { type: 'error', name: 'HoldNotExpired', inputs: [{ name: 'expiry', type: 'uint256' }] },
  {
    type: 'error',
    name: 'AmountExceedsRemaining',
    inputs: [
      { name: 'requested', type: 'uint256' },
      { name: 'available', type: 'uint256' },
    ],
  },
  { type: 'error', name: 'NothingToRefund', inputs: [] },
  {
    type: 'error',
    name: 'UnexpectedDepositBalance',
    inputs: [
      { name: 'beforeBalance', type: 'uint256' },
      { name: 'afterBalance', type: 'uint256' },
      { name: 'expectedAmount', type: 'uint256' },
    ],
  },
  {
    type: 'function',
    name: 'getHold',
    stateMutability: 'view',
    inputs: [{ name: 'holdId', type: 'uint256' }],
    outputs: [
      {
        name: 'hold',
        type: 'tuple',
        components: [
          { name: 'payer', type: 'address' },
          { name: 'recipient', type: 'address' },
          { name: 'deposited', type: 'uint256' },
          { name: 'captured', type: 'uint256' },
          { name: 'refunded', type: 'uint256' },
          { name: 'expiry', type: 'uint256' },
          { name: 'status', type: 'uint8' },
        ],
      },
    ],
  },
] as const

export type HoldStatus = 'active' | 'expired' | 'captured' | 'refunded'

export interface Hold {
  id: bigint
  payer: Address
  recipient: Address
  deposited: bigint
  captured: bigint
  refunded: bigint
  expiry: bigint
  /** Onchain status enum: 0 Active, 1 Captured, 2 Refunded. */
  rawStatus: number
}

export const remainingOf = (h: Hold): bigint => h.deposited - h.captured - h.refunded

/** Display status. "expired" means still Active onchain but past its expiry with funds left. */
export function statusOf(h: Hold, nowSec: number): HoldStatus {
  if (h.rawStatus === 1) return 'captured'
  if (h.rawStatus === 2) return 'refunded'
  return BigInt(nowSec) >= h.expiry ? 'expired' : 'active'
}
