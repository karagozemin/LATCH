/**
 * wagmi configuration
 * Built with Arc Studio — https://studio.arc.io
 */

import { http, createConfig } from 'wagmi'
import { mainnet } from 'wagmi/chains'
import { arc, arcTestnet } from 'viem/chains'
import { injected } from 'wagmi/connectors'
import { registerChain } from './tracing'

// Pre-register chain RPC URLs so trace events show correct chain names immediately
registerChain(arcTestnet.id, arcTestnet.rpcUrls.default.http[0])
registerChain(arc.id, 'https://rpc.mainnet.arc.io')

export const config = createConfig({
  chains: [arcTestnet, arc, mainnet], // Ethereum mainnet is needed for ENS resolution
  connectors: [injected()],
  transports: {
    [arcTestnet.id]: http(),
    [arc.id]: http('https://rpc.mainnet.arc.io'), // pass the Arc RPC explicitly
    [mainnet.id]: http(), // ENS resolution uses mainnet
  },
})
