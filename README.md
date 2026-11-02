# Latch

Latch is a minimal programmable USDC payment authorization for Arc. A payer reserves USDC for a named recipient with an expiry. The recipient can capture any part of it, in as many steps as they like, before it expires. After expiry the payer reclaims whatever is left. There is no admin, no upgrade path and no fee.

Built with [Arc Studio](https://studio.arc.io)

## Status

- **Arc Mainnet:** deployed independently by the owner, outside Arc Studio. The app is configured to use it by default for production builds.
  - Contract: [`0xd09EAC2f4eF49A5E918bB49884189c37793a7CC2`](https://explorer.arc.io/address/0xd09EAC2f4eF49A5E918bB49884189c37793a7CC2)
  - Deployment tx: [`0xea07…cec6`](https://explorer.arc.io/tx/0xea0747048d177ce7b48830dbcb61b045b1fe63715e3098660bc565d36349cec6), block `29071512`
  - Deployer: [`0xcD14091eE1B8B51B84F0E971AeD62fD87dcF4044`](https://explorer.arc.io/address/0xcD14091eE1B8B51B84F0E971AeD62fD87dcF4044)
  - **Pending:** explorer source verification, and the first mainnet Reserve, Capture and Refund transactions. Neither has been done yet.
- **Arc Testnet:** deployed and tested end to end with two real wallets. Kept as an optional development network (see `docs/DEPLOYMENTS.md`).
- **Review:** automated and AI-assisted review plus unit, fuzz and invariant tests. This is not a third-party audit (see `docs/SECURITY.md`).

Mainnet moves real USDC and transactions cannot be reversed. The app shows an "Arc Mainnet" badge and a real-USDC warning whenever it targets mainnet.

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
- Chains: Arc Mainnet (chain ID 5042, production) and Arc Testnet (chain ID 5042002, development). USDC at `0x3600000000000000000000000000000000000000` (6 decimals) on both

## Development

Prerequisites: [Bun](https://bun.sh) and [Foundry](https://book.getfoundry.sh).

```bash
bun install
cp .env.example .env     # public values only; set VITE_LATCH_NETWORK=testnet for local development
bun run dev              # app on http://localhost:5173
```

Contracts:

```bash
bun run contracts:build  # forge build
bun run contracts:test   # forge test (unit, fuzz, invariants)
```

Checks for the frontend: `bun run check` (lint and typecheck). Production build: `bun run build` (same as `bunx vite build`, output in `dist/`). Styles are compiled by `vite.latch-css.ts` and served as `/latch.css`.

### Environment variables

| Name | Purpose |
| --- | --- |
| `VITE_LATCH_NETWORK` | `mainnet` or `testnet`. Selects which Arc network the app targets. Production builds read `mainnet` from the committed `.env.production`; if it is unset, local development uses `testnet` and a production build shows a configuration error instead of guessing. |
| `VITE_LATCH_ADDRESS_TESTNET` | Address of the Latch contract on Arc Testnet (public). |
| `VITE_LATCH_DEPLOY_BLOCK_TESTNET` | Block that contract was deployed at. Bounds the history scan (public). |
| `VITE_LATCH_ADDRESS_MAINNET` | Address of the Latch deployment on Arc Mainnet (public). |
| `VITE_LATCH_DEPLOY_BLOCK_MAINNET` | Block of the mainnet deployment. Bounds the history scan (public). |
| `RPC_PROXY_BASE_URL`, `RPC_PROXY_TOKEN`, `RPC_PROXY_CHAINS` | Optional outside Arc Studio. Provisioned by Arc Studio for its own tooling; the app does not need them. |

## Repository layout

- `contracts/Latch.sol`: the contract
- `contracts/test/`: Foundry tests (`Latch.t.sol`, `Latch.Revert.t.sol`, `Latch.Fuzz.t.sol`, `Latch.Invariant.t.sol`, shared base and mock token)
- `contracts/script/DeployLatch.s.sol`: Foundry deploy script with chain and USDC pre-flight checks
- `src/`: the web app (dashboard layout in `src/components/layout`, pages composed in `src/App.tsx`)
- `vercel.json`: Vercel settings (see `docs/VERCEL.md`)
- `docs/`: design notes, security review, deployment and demo instructions

## License

MIT. See `LICENSE`.
