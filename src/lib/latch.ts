import { arc, arcTestnet } from 'viem/chains'
import { isAddress, parseAbiItem, type Address } from 'viem'
import { getUsdc } from '@/onchain-facts'

/**
 * Network selection. The app targets ONE Arc network, chosen by VITE_LATCH_NETWORK:
 *   testnet (default) -> Arc Testnet, chain ID 5042002
 *   mainnet           -> Arc Mainnet, chain ID 5042
 * Each network has its own contract address and deployment block, so a mainnet build can never
 * silently fall back to the testnet contract (and vice versa).
 */
const env = import.meta.env
const rawNetwork = ((env.VITE_LATCH_NETWORK as string | undefined) ?? 'testnet').trim().toLowerCase()

export const LATCH_IS_MAINNET = rawNetwork === 'mainnet'
export const LATCH_CHAIN_ID: typeof arc.id | typeof arcTestnet.id = LATCH_IS_MAINNET ? arc.id : arcTestnet.id

const ADDRESS_ENV_KEY = LATCH_IS_MAINNET ? 'VITE_LATCH_ADDRESS_MAINNET' : 'VITE_LATCH_ADDRESS_TESTNET'
const BLOCK_ENV_KEY = LATCH_IS_MAINNET ? 'VITE_LATCH_DEPLOY_BLOCK_MAINNET' : 'VITE_LATCH_DEPLOY_BLOCK_TESTNET'
export const LATCH_ADDRESS_ENV_KEY: string = ADDRESS_ENV_KEY

/** The Arc Testnet deployment. Used only to refuse it as a mainnet address. */
const KNOWN_TESTNET_ADDRESS = '0xdb90ccaee5b1c63139de9d01fd93b8c0c3665a3b'

const rawAddress = ((LATCH_IS_MAINNET ? env.VITE_LATCH_ADDRESS_MAINNET : env.VITE_LATCH_ADDRESS_TESTNET) as
  | string
  | undefined)?.trim()
const rawDeployBlock = ((LATCH_IS_MAINNET ? env.VITE_LATCH_DEPLOY_BLOCK_MAINNET : env.VITE_LATCH_DEPLOY_BLOCK_TESTNET) as
  | string
  | undefined)?.trim()

function configError(): string | undefined {
  if (rawNetwork !== 'testnet' && rawNetwork !== 'mainnet') {
    return `VITE_LATCH_NETWORK must be "testnet" or "mainnet" (got "${rawNetwork}").`
  }
  if (rawAddress && !isAddress(rawAddress)) return `${ADDRESS_ENV_KEY} is not a valid address.`
  if (LATCH_IS_MAINNET && rawAddress?.toLowerCase() === KNOWN_TESTNET_ADDRESS) {
    return `${ADDRESS_ENV_KEY} is the Arc Testnet contract. Use the address of your Arc Mainnet deployment.`
  }
  if (rawDeployBlock && !/^\d+$/.test(rawDeployBlock)) return `${BLOCK_ENV_KEY} must be a block number.`
  return undefined
}

/** Set when the environment is inconsistent. The app refuses to talk to any contract in that case. */
export const LATCH_CONFIG_ERROR: string | undefined = configError()

export const LATCH_ADDRESS: Address | undefined =
  !LATCH_CONFIG_ERROR && rawAddress && isAddress(rawAddress) ? rawAddress : undefined

/** Block the contract was deployed at. Bounds the activity scan; never scan from genesis. */
export const LATCH_DEPLOY_BLOCK: bigint | undefined =
  !LATCH_CONFIG_ERROR && rawDeployBlock ? BigInt(rawDeployBlock) : undefined

export const latchEvents = [
  parseAbiItem(
    'event HoldCreated(uint256 indexed holdId, address indexed payer, address indexed recipient, uint256 amount, uint256 expiry)',
  ),
  parseAbiItem('event Captured(uint256 indexed holdId, address indexed recipient, uint256 amount, uint256 remaining)'),
  parseAbiItem('event Refunded(uint256 indexed holdId, address indexed payer, uint256 amount)'),
] as const

const usdc = getUsdc(LATCH_CHAIN_ID)
if (!usdc) throw new Error(`USDC fact missing for chain ${LATCH_CHAIN_ID}`)
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
