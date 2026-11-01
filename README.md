# Latch

Latch is a minimal programmable USDC payment authorization for Arc. A payer reserves USDC for a named recipient with an expiry. The recipient can capture any part of it, in as many steps as they like, before it expires. After expiry the payer reclaims whatever is left. There is no admin, no upgrade path and no fee.

Built with [Arc Studio](https://studio.arc.io)

## Status

- Contract: deployed and tested on Arc Testnet (see `docs/DEPLOYMENTS.md`).
- Mainnet: not deployed. The project is prepared for an independent mainnet deployment after your own review (see `docs/DEPLOYMENT.md`).
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
cp .env.example .env     # then set VITE_LATCH_ADDRESS and VITE_LATCH_DEPLOY_BLOCK
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
| `VITE_LATCH_ADDRESS` | Address of the deployed Latch contract the app talks to (public). |
| `VITE_LATCH_DEPLOY_BLOCK` | Block the contract was deployed at. Bounds the transaction-history scan (public). |
| `RPC_PROXY_BASE_URL`, `RPC_PROXY_TOKEN`, `RPC_PROXY_CHAINS` | Optional outside Arc Studio. Provisioned by Arc Studio for its own tooling; the app does not need them. |

## Repository layout

- `contracts/Latch.sol`: the contract
- `contracts/test/`: Foundry tests (`Latch.t.sol`, `Latch.Revert.t.sol`, `Latch.Fuzz.t.sol`, `Latch.Invariant.t.sol`, shared base and mock token)
- `contracts/script/DeployLatch.s.sol`: Foundry deploy script
- `src/`: the web app (dashboard layout in `src/components/layout`, pages composed in `src/App.tsx`)
- `docs/`: design notes, security review, deployment and demo instructions

## License

MIT. See `LICENSE`.
