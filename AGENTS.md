# Latch

> Built with Arc Studio - money-powered apps in minutes

This is the **project memory** - what Arc Studio remembers about building this app. It helps future agents (or humans) understand and extend the project.

---

## What This App Does

Latch is a minimal programmable USDC payment authorization on Arc. A payer reserves USDC for a recipient with an expiry; the recipient can capture it in partial steps before expiry; the payer refunds the remainder after expiry. Immutable contract, no admin, no fees.

## Deployments

- Arc Testnet (5042002): `0xdb90ccaee5b1c63139de9d01fd93b8c0c3665a3b`, tx `0xdcab033de2bbd2733dfa0873b9ad6541861fdcb464d99bbd4093a85a874a5fb0`. Frontend reads it from `VITE_LATCH_ADDRESS_TESTNET` in `.env` (network chosen by `VITE_LATCH_NETWORK`, default testnet).
- Arc Mainnet (5042): `0xd09EAC2f4eF49A5E918bB49884189c37793a7CC2`, tx `0xea0747048d177ce7b48830dbcb61b045b1fe63715e3098660bc565d36349cec6`, block `29071512`, deployer `0xcD14091eE1B8B51B84F0E971AeD62fD87dcF4044`. Deployed by the owner outside Studio. Production builds target it via the committed `.env.production`; the local `.env` stays on testnet for development. Source verification and the first mainnet Reserve/Capture/Refund are still PENDING: never claim them or invent transaction hashes. Studio must not make mainnet RPC calls or sign anything.

## Decisions

- Hold IDs start at 1. Capture is strictly before expiry; refund is at or after expiry, payer only.
- Frontend reads holds directly from the contract (latest 60), no indexer. Transaction history scans events in 5,000-block chunks (measured RPC limit), starting at the network's `VITE_LATCH_DEPLOY_BLOCK_*` value or head minus 100,000 blocks, whichever is later.
- Styling pipeline: Tailwind is compiled by `tooling/vite-latch-css.ts` from `src/index.css` and loaded as a real `<link rel="stylesheet" href="/latch.css">` in `index.html` (emitted as `dist/latch.css` on build). Do NOT import `src/index.css` from JS: Vite's JS-injected CSS was lost on HMR and on module errors. Sidebar and mobile nav carry `data-sidebar` / `data-mobile-nav`, which a tiny inline rule in `index.html` also uses to guarantee they never show together.
- UI: dark fintech theme (canvas #080D16, panel #111B2A, teal #3FE0C0), Geist fonts, tokens in `tooling/tailwind.config.js`.
- Frontend ABI is hand-written in `src/lib/latch.ts`; keep it in sync with `contracts/Latch.sol`.

## Tech Stack

- Frontend: React 18, Vite, TypeScript, Tailwind CSS
- Web3: wagmi v2, viem v2, ConnectKit
- Contracts: Solidity 0.8.28 + Foundry. Sources in `contracts/`, unit tests in `contracts/test/*.t.sol`. Build with `bun run contracts:build` (`forge build`), test with `bun run contracts:test` (`forge test`).
- Wallet: injected (MetaMask, etc.)
- Chain: Arc Testnet (Chain ID: 5042002, imported from `viem/chains`)
- Token: USDC (6 decimals) (Address: 0x3600000000000000000000000000000000000000, Chain: Arc Testnet)
- Toasts: Sonner

## Key Files

- `src/LandingPage.tsx` - Public landing page at `/`
- `src/DashboardRoot.tsx`, `src/App.tsx` - Lazy-loaded dashboard provider shell and composition root at `/app`
- `src/components/` - dashboard: `layout/` (Sidebar, TopBar, MobileNav), Hero, SummaryCards, CreateAuthorization, HoldDetail, HoldsTable, HistoryTable, TxStatus, `ui/` primitives
- `src/hooks/` - useHolds (contract reads), useActivity (bounded event scan), useTx (write + confirmation phases), useView (`?view=` routing)
- `src/lib/latch.ts` - ABI, address, hold helpers
- `contracts/Latch.sol`, `contracts/test/` - contract and Foundry tests
- `docs/` - `ARCHITECTURE.md`, `guides/` (DEMO, DEPLOYMENT, VERCEL), `reference/` (DEPLOYMENTS, SECURITY). Keep README links and these paths in sync when moving docs.
- `src/config.ts` - wagmi config (chains, connectors, transports)

## Share links

- Starter apps already ship `getShareBase`, `buildShareLink` and `installShareSync` in `src/lib/share.ts`; import them instead of rewriting them.
- Keep shareable state in the URL path or query, not in the `#fragment`.
- Never put a secret (private key, claim secret, seed phrase, session token, API key) in the URL path or query, encoded or not: every in-app path and query is mirrored to the visitor's studio.arc.io address bar and browser history and reaches servers. A bearer claim secret goes only in the `#fragment` appended to the share link (`` `${await buildShareLink('/claim')}#${secret}` ``) and is read from `location.hash` on load. A link to the app's own share URL shown inside the app must be copy-only or open in a new tab with `target="_blank" rel="noopener noreferrer"`.
- Build every link a user copies or sends with `buildShareLink()` from `src/lib/share.ts`.
- Keep the `installShareSync()` call in `src/main.tsx` when editing it; it keeps the Studio address bar in step with in-app navigation.
- Navigate inside the app with relative links.

## To Run

```bash
bun install
bun run dev
```
