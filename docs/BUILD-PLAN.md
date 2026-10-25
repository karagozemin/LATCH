# LATCH — HackMeridian Build Plan

This plan is ordered by demo risk, not by feature count. A stage is only done
when its exit test passes.

## M0 — Protocol proof (complete before product build)

- [x] Validate custom-account auth contexts, nested auth, rollback, recording,
  read-only auth, and SAC re-entry against Soroban host 27.0.1.
- [x] Lock the product scope and 28-hour HackMeridian runbook in the PRD.

## M1 — Secure contract core

- [x] Create the pinned Soroban workspace and production contract skeleton.
- [x] Implement atomic constructor, deposit, direct pay, hold, capture, void,
  expiry, verification, sync, events, limits, and TTL extension.
- [x] Keep `__check_auth` storage-only and restrict it to `pay` and
  `create_hold`.
- [x] Defend reservations against stale mirror state and external SAC clawback
  by checking `min(mirror balance, real balance)` in execution.
- [x] Pass lifecycle, invariant, authorization-context, and attack tests.
- [x] Build an optimized WASM artifact (14,622 bytes; 17,225 bytes before
  `stellar contract optimize`).

**Exit test:** a merchant can reserve, partially capture, and void funds while
every overspend and unauthorized transition is rejected.

## M2 — Testnet proof

- [x] Add deterministic deploy/config scripts for the test asset and LATCH.
- [x] Run simulate → sign → submit transactions against Stellar Testnet.
- [x] Record contract IDs and explorer links in a generated deployment file.
- [x] Prove a full lifecycle from clean identities without mocked auth.

**Exit test:** the exact demo lifecycle completes on Testnet from a fresh clone.

## M3 — Demo product

- [x] Payer mobile view: balance, reserved/available split, active hold timeline.
- [x] Merchant terminal: create/verify/capture/void with clear transaction state.
- [ ] Shared typed contract client and network configuration.
- [x] Add the three-second judge flow and a reset button for repeated demos.
- [x] Add a Freighter-signed Testnet mode that deploys a user-owned LATCH
  account, deposits native XLM, proves overspend rejection, and settles a hold.

**Exit test:** a first-time user completes the scripted flow without CLI help.

## M4 — Submission quality

- [ ] Run contract tests, frontend tests, lint, format, and production builds in CI.
- [ ] Threat-model review and test evidence matrix against the PRD.
- [ ] Rehearse the demo under poor network conditions; capture a backup video.
- [ ] Publish architecture, honest pre-event/build-window disclosure, testnet
  addresses, demo link, and continued-development roadmap.

**Exit test:** repository, live demo, pitch, and fallback recording all tell the
same verifiable story.
