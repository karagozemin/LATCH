# LATCH

Native authorization holds for Stellar smart accounts.

LATCH turns a Stellar account balance into programmable payment capacity:
merchants can reserve funds, capture only the final amount owed, and release the
remainder without taking custody of it first.

This repository is being prepared for the **Genesis** category at
[HackMeridian 2026](https://www.hackmeridian.com/) in Lisbon.

## Current status

The repository contains the locked product requirements document, five Soroban
protocol-behavior spikes, a production contract, a typed client, a deterministic
Testnet lifecycle, and the interactive judge demo.
Pre-event work is kept explicit: the spikes and contract hardening establish the
technical foundation; the HackMeridian build sprint produces the submitted MVP.

- [`LATCH-PRD.md`](./LATCH-PRD.md) — product, contract, security, test, and demo specification
- [`docs/BUILD-PLAN.md`](./docs/BUILD-PLAN.md) — milestone plan and objective exit tests
- [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) — components, transaction lifecycle, and trust boundaries
- [`docs/SECURITY-EVIDENCE.md`](./docs/SECURITY-EVIDENCE.md) — threat-to-control-to-test evidence matrix
- [`docs/DEMO-RUNBOOK.md`](./docs/DEMO-RUNBOOK.md) — 60-second pitch, live flow, and failure ladder
- [`docs/PRODUCT-DECISIONS.md`](./docs/PRODUCT-DECISIONS.md) — shipped signing, asset, and canonical-number decisions
- [`docs/SUBMISSION-PACK.md`](./docs/SUBMISSION-PACK.md) — submission copy and 90-second video script
- [`docs/PITCH-DECK.md`](./docs/PITCH-DECK.md) — eight-slide judge narrative
- [`docs/JUDGE-QA.md`](./docs/JUDGE-QA.md) — technical and product Q&A cards
- [`docs/REHEARSAL-LOG.md`](./docs/REHEARSAL-LOG.md) — automated and manual rehearsal evidence
- `contracts/latch` — LATCH custom-account contract
- `sites/latch-demo` — responsive payer + merchant judge demo
- `spike-reentry` — SAC re-entry behavior inside `__check_auth`
- `spike-s1` — invoker-contract authorization for nested self-transfers
- `spike-s2` — relay/intermediary authorization contexts
- `spike-s3` — sibling authorization ordering, rollback, and recording mode
- `spike-s6` — read-only `__check_auth` with body-written balance accounting

## What is verifiably working

| Proof | Current artifact |
|---|---|
| Production contract | 15 focused lifecycle, authorization, event, attack, and invariant tests |
| Host assumptions | Five isolated Soroban behavior spike suites |
| Real network lifecycle | Deposit → hold → owner-signed pay → merchant capture on Stellar Testnet |
| Public contract | [`CCWSZPG5…NP7LC`](https://stellar.expert/explorer/testnet/contract/CCWSZPG5PLKCKKUBDN6WI6XHPYZJIQVGZSBGYF27PSS5GWH4HYENP7LC) |
| Judge product | [Private hosted demo](https://latch-meridian-demo.lemonyswan1024.chatgpt.site) with deterministic replay and Freighter mode |
| Reproducibility | CI builds the contract, client, site, all tests, and the optimized WASM on every push |

## Architecture in one minute

```text
Freighter owner signature
          │
          ▼
LATCH custom account ── verify_hold ──► merchant
          │   available = min(mirror, real) - active reservations
          ▼
Stellar Asset Contract ── transfer only after policy checks pass
```

Creating a hold records a merchant-bound ceiling and expiry inside the payer's
own account; it does not transfer tokens. `__check_auth` defaults to deny and
accepts only exact `pay` and `create_hold` call shapes. Capture authenticates the
bound merchant, settles at most the ceiling, and releases the unused reservation
atomically. See the full [architecture and trust boundaries](./docs/ARCHITECTURE.md).

## Run the spike tests

```sh
for crate in spike-reentry spike-s1 spike-s2 spike-s3 spike-s6; do
  cargo test --manifest-path "$crate/Cargo.toml" --all-features
done
```

The spike projects use `soroban-sdk 27.0.6` and exercise behavior against
`soroban-env-host 27.0.1`.

The production suite currently has 15 focused tests covering lifecycle,
authorization policy, merchant binding, expiry, reservation bounds, external
clawback/backing loss, sync, event evidence, and bounded state retention. The
optimized WASM is 15,156 bytes (17,814 bytes before Stellar CLI optimization).

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

The M3 interface has two modes. **Replay** runs the canonical two-merchant LUSD
story: holds of 30 + 15, a rejected 10-unit spend with before/after chain reads,
a safe 4-unit payment, an 8.40 capture, and release of the second hold. Every
successful transition links to its public transaction. **Live wallet** is the
stage-safe fallback: Freighter deploys a fresh user-owned LATCH account,
deposits 50 Testnet XLM, and proves the same policy boundary with one wallet and
one hold. The contract still enforces merchant-bound settlement.

Freighter must be set to Testnet. The app can fund a new Testnet address through
Friendbot, stores only the resulting public contract ID in browser storage, and
never receives or persists a private key. Owner approvals use a domain-separated
SEP-53 message signature so Freighter signs with the controlling G-account while
the LATCH C-account verifies the exact Soroban authorization payload on-chain.

```sh
npm ci --prefix sites/latch-demo
npm run build:site
```

```sh
python3 -m http.server 4173 -d sites/latch-demo/dist
```

The hosted preview is private by default at
https://latch-meridian-demo.lemonyswan1024.chatgpt.site.

## Honest limitations

- Genesis v1 supports one configured asset and one terminal capture per hold.
- A LATCH account permits at most 16 active holds and a seven-day hold duration.
- Issuer clawback or freeze authority is outside the payer policy; LATCH detects
  backing loss and stops reporting the hold as guaranteed.
- Contract-account muxed transfers are not yet supported by every exchange and
  wallet integration.
- The live judge flow uses one Freighter wallet as payer and merchant to reduce
  stage risk; the contract still binds settlement to the recorded merchant.

## Continued-development roadmap

1. Model token allowances as reservations so x402 `upto` payments retain a
   balance guarantee.
2. Package the reservation rule as an OpenZeppelin smart-account policy module.
3. Add partial capture, residual reservation accounting, and multi-asset holds.
4. Ship merchant SDKs around `verify_hold` for POS, anchor, and facilitator
   integrations.
