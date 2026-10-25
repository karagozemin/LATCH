# LATCH

Native authorization holds for Stellar smart accounts.

LATCH turns a Stellar account balance into programmable payment capacity:
merchants can reserve funds, capture only the final amount owed, and release the
remainder without taking custody of it first.

This repository is being prepared for the **Genesis** category at
[HackMeridian 2026](https://www.hackmeridian.com/) in Lisbon.

## Current status

The repository contains the locked product requirements document, five Soroban
protocol-behavior spikes, and the first production contract implementation.
Pre-event work is kept explicit: the spikes and contract hardening establish the
technical foundation; the HackMeridian build sprint produces the submitted MVP.

- [`LATCH-PRD.md`](./LATCH-PRD.md) — product, contract, security, test, and demo specification
- [`docs/BUILD-PLAN.md`](./docs/BUILD-PLAN.md) — milestone plan and objective exit tests
- `contracts/latch` — LATCH custom-account contract
- `sites/latch-demo` — responsive payer + merchant judge demo
- `spike-reentry` — SAC re-entry behavior inside `__check_auth`
- `spike-s1` — invoker-contract authorization for nested self-transfers
- `spike-s2` — relay/intermediary authorization contexts
- `spike-s3` — sibling authorization ordering, rollback, and recording mode
- `spike-s6` — read-only `__check_auth` with body-written balance accounting

## Run the spike tests

```sh
for crate in spike-reentry spike-s1 spike-s2 spike-s3 spike-s6; do
  cargo test --manifest-path "$crate/Cargo.toml" --all-features
done
```

The spike projects use `soroban-sdk 27.0.6` and exercise behavior against
`soroban-env-host 27.0.1`.

The production suite currently has 14 focused tests covering lifecycle,
authorization policy, merchant binding, expiry, reservation bounds, external
clawback/backing loss, sync, and bounded state retention. The optimized WASM is
14,622 bytes (17,225 bytes before Stellar CLI optimization).

## Build the contract

```sh
cargo test --workspace --all-features
cargo build --package latch-contract --target wasm32v1-none --release
```

## Prove the lifecycle on Testnet

Requires Node.js 22.12+, npm, Rust, and Stellar CLI 27. The script creates five
isolated local `latch-*` identities, funds them on Testnet, deploys a fresh
LATCH contract, and executes deposit → hold → owner-signed pay → capture.
Secrets remain in the local Stellar CLI config and are never written to this
repository.

```sh
npm install
npm run testnet:bootstrap
```

The public contract IDs, final balances, and Stellar Expert transaction links
are written to `deployments/testnet.json`.

## Open the judge demo

The M3 interface has two modes. **Replay** runs the deterministic 12-second LUSD
story and links every successful transition to its public transaction. **Live
wallet** connects Freighter, deploys a fresh user-owned LATCH account, deposits
50 Testnet XLM, signs a 30 XLM hold, proves a 25 XLM overspend is rejected, then
pays and captures on-chain. The live judge flow uses one wallet for both roles
to keep setup reliable; the contract still enforces merchant-bound settlement.

Freighter must be set to Testnet. The app can fund a new Testnet address through
Friendbot, stores only the resulting public contract ID in browser storage, and
never receives or persists a private key.

```sh
npm ci --prefix sites/latch-demo
npm run build:site
```

```sh
python3 -m http.server 4173 -d sites/latch-demo/dist
```

The hosted preview is private by default at
https://latch-meridian-demo.lemonyswan1024.chatgpt.site.
