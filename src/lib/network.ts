import { getChain } from '@/onchain-facts'

const ARC_MAINNET_ID = 5042

/** Human label for a chain ID, from the real connected chain. */
export function networkLabel(chainId: number): string {
  if (chainId === ARC_MAINNET_ID) return 'Arc Mainnet'
  return getChain(chainId)?.name ?? `Chain ${chainId}`
}
