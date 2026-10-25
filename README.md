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
23,746 bytes (31,995 bytes before optimization).

## Build the contract

```sh
cargo test --workspace --all-features
cargo build --package latch-contract --target wasm32v1-none --release
```
