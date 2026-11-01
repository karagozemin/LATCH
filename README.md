# Latch

Latch is a minimal programmable USDC payment authorization for Arc. A payer reserves USDC for a named recipient with an expiry. The recipient can capture any part of it, in as many steps as they like, before it expires. After expiry the payer reclaims whatever is left. There is no admin, no upgrade path and no fee.

Built with [Arc Studio](https://studio.arc.io)

## Status

- Contract: deployed and tested on Arc Testnet (see `docs/DEPLOYMENTS.md`).
- Mainnet: not deployed. The project is prepared for an independent Arc Mainnet deployment by you, after your own review (see `docs/DEPLOYMENT.md`). No mainnet address or block number is included or assumed.
- Review: automated and AI-assisted review plus unit, fuzz and invariant tests. This is not a third-party audit (see `docs/SECURITY.md`).

## What you can do

- Reserve USDC for a recipient with an expiry.
- Capture part or all of a hold as the recipient, before it expires.
- Refund the unused balance as the payer, after it expires.
- See every hold, its status, amounts and explorer links in a dashboard with overview totals, a selected-authorization view, and a transaction history.

Demo: reserve 0.02 USDC, capture 0.01 USDC, wait for expiry, refund the remaining 0.01 USDC. See `docs/DEMO.md`.

## Tech stack

- Solidity 0.8.28, OpenZeppelin 5.6.1, Foundry
- React, Vite, TypeScript, Tailwind CSS
- wagmi, viem, ConnectKit
- Chain: Arc Testnet (chain ID 5042002). USDC at `0x3600000000000000000000000000000000000000` (6 decimals)

## Development

Prerequisites: [Bun](https://bun.sh) and [Foundry](https://book.getfoundry.sh).

```bash
bun install
cp .env.example .env     # then set the VITE_LATCH_* values for your network
bun run dev              # app on http://localhost:5173
```

Contracts:

```bash
bun run contracts:build  # forge build
bun run contracts:test   # forge test (unit, fuzz, invariants)
```

Checks for the frontend: `bun run check` (lint and typecheck). Production build: `bunx vite build`. Styles are compiled by `vite.latch-css.ts` and served as `/latch.css`.

### Environment variables

| Name | Purpose |
| --- | --- |
| `VITE_LATCH_NETWORK` | `testnet` (default) or `mainnet`. Selects which Arc network the app targets. |
| `VITE_LATCH_ADDRESS_TESTNET` | Address of the Latch contract on Arc Testnet (public). |
| `VITE_LATCH_DEPLOY_BLOCK_TESTNET` | Block that contract was deployed at. Bounds the history scan (public). |
| `VITE_LATCH_ADDRESS_MAINNET` | Address of your own Latch deployment on Arc Mainnet. Leave empty until you have deployed it (public). |
| `VITE_LATCH_DEPLOY_BLOCK_MAINNET` | Block of your mainnet deployment (public). |
| `RPC_PROXY_BASE_URL`, `RPC_PROXY_TOKEN`, `RPC_PROXY_CHAINS` | Optional outside Arc Studio. Provisioned by Arc Studio for its own tooling; the app does not need them. |

## Repository layout

- `contracts/Latch.sol`: the contract
- `contracts/test/`: Foundry tests (`Latch.t.sol`, `Latch.Revert.t.sol`, `Latch.Fuzz.t.sol`, `Latch.Invariant.t.sol`, shared base and mock token)
- `contracts/script/DeployLatch.s.sol`: Foundry deploy script with chain and USDC pre-flight checks
- `src/`: the web app (dashboard layout in `src/components/layout`, pages composed in `src/App.tsx`)
- `docs/`: design notes, security review, deployment and demo instructions

## License

MIT. See `LICENSE`.
