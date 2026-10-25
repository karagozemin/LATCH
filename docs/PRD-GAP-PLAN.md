# PRD completion plan

This is the execution order for closing every known gap between the locked PRD,
the repository, and the judge experience. Order is dependency-driven: public
contract and ABI changes happen before client generation; client integration
happens before UX and automated browser coverage; recording happens only after
the UI is frozen.

## Completion definition

PRD completion means all automated acceptance checks pass, the Testnet proof was
regenerated from the final WASM, the hosted demo uses the shared client and final
contract, and the only manual artifacts—rehearsal and recording—are captured
from that same frozen build.

## P0 — Truth freeze and decision record

- [x] Inventory every known implementation/PRD delta.
- [x] Record the working Freighter SEP-53 flow as the superseding signing
  decision; do not reintroduce private-key handling merely to match old copy.
- [x] Define dual demo assets honestly: deterministic LUSD proof plus user-owned
  native-XLM live mode.
- [x] Make the canonical judge amounts and spoken script identical across PRD,
  replay, live flow, runbook, and backup video.

**Exit:** no repository document contradicts the shipped product.

## P1 — Contract ABI and event parity

- [x] Add PRD-required accounting facts to events: deposit `new_mirror`, pay
  `new_available`, capture `released`, and sync `old_mirror/new_mirror`.
- [x] Add direct event-payload tests.
- [x] Run format, Clippy, 14+ production tests, five host spike suites, and WASM
  release build.
- [x] Optimize the final WASM, regenerate the typed client, and rerun the clean
  Testnet lifecycle.
- [x] Refresh every contract ID, WASM hash, transaction hash, and explorer link.

**Exit:** final ABI, client, Testnet deployment, docs, and demo constants agree.

## P2 — Shared client and network configuration

- [x] Replace the demo's ad-hoc dynamic contract client with `latch-client`.
- [x] Centralize Testnet RPC, passphrase, contract, WASM, and explorer settings.
- [x] Add a repeatable client-generation command and CI drift check.
- [x] Remove duplicated contract/network constants from UI code.

**Exit:** one generated ABI and one network configuration drive scripts and UI.

## P3 — On-chain guarantee and decline evidence

- [x] Poll `verify_hold` for active holds and render `FUNDS RESERVED` versus
  `NOT BACKED` from its `guaranteed` value.
- [x] Implement the PRD's three-fact decline proof: pre-attempt available,
  rejected attempt/evidence, and unchanged post-attempt balance.
- [x] Preserve safe retry semantics and distinguish simulation rejection from a
  submitted failed transaction.
- [x] Surface exact explorer evidence without interpreting opaque host errors as
  contract reasons.

**Exit:** every safety claim visible to a judge is backed by an on-chain read or
transaction artifact.

## P4 — Canonical two-party demo UX

- [x] Merchant creates amount, expiry, and reference; UI produces a hold request
  payload/QR.
- [x] Payer opens/scans the request and explicitly authorizes or declines it.
- [x] Render multiple concurrent holds and reference-derived authorization IDs.
- [x] Match the canonical lifecycle: holds 30 + 15, available 5, rejected spend
  10, safe spend 4, capture 8.40, release the second hold.
- [x] Add the capture sheet: paid, released, and available-before/after.
- [x] Keep the short one-wallet live fallback, but label it clearly as stage-safe
  mode rather than the final two-party integration.

**Exit:** first-time payer and merchant roles complete the PRD script without CLI
help, and the 12-second replay tells the same numerical story.

## P5 — Frontend automation and CI truth

- [x] Extract/test deterministic state and amount transitions.
- [x] Test replay controls, live-mode state restoration, guarantee badge,
  decline evidence, retry safety, and responsive critical controls.
- [x] Add frontend test and lint commands to CI; do not mark them complete until
  those commands execute on GitHub Actions.
- [x] Keep the committed production bundle drift check.

**Exit:** the BUILD-PLAN CI checkbox is supported by actual frontend tests, not
only typechecking and bundling.

## P5.5 — Merchant product proof

External judge review correctly identified the remaining gap between a secure
contract proof and a merchant-ready product proof.

- [x] Model payer and merchant as separate roles in the request/QR experience.
- [x] Prove owner, payer, and merchant separation with isolated Testnet
  identities in the reproducible bootstrap flow.
- [x] Expose amount, asset, merchant, expiry, reference, authorization ID,
  hold status, capture, and release in the judge interface.
- [ ] Run the live browser flow across two separate wallet identities/profiles:
  merchant request → payer hold → merchant verify → merchant capture/release.
- [ ] Add a small merchant integration layer over the generated ABI client with
  request, verification, capture, release, and status helpers.
- [ ] Add indexer/event-backed merchant history using only the contract's real
  event names: `HoldCreated`, `HoldCaptured`, and `HoldVoided`.
- [ ] Extend the proof manifest with the active `verify_hold` snapshot before
  terminal settlement and explicit merchant post-capture balance.

**Exit:** a judge can see not only a secure primitive but also how a merchant
integrates, verifies, and settles it without reading the raw contract ABI.

## P6 — Submission freeze and manual evidence

- [ ] Run thirty complete rehearsals, including throttled/failed-network cases.
- [ ] Record and verify the 90-second backup video from the final hosted build.
- [x] Produce the pitch deck, submission answers, QR/link sheet, and final Q&A
  cards from the same claims and numbers.
- [x] Perform a clean-machine clone/build/demo rehearsal and archive its logs.
- [ ] Freeze release commit, deployment URL, video, and Testnet proof manifest.

**Exit:** repository, live demo, pitch, submission, and fallback recording tell
one verifiable story.

## Known deltas captured by this plan

- Live wallet intentionally remains the labeled one-wallet stage fallback; the
  canonical replay and public proof use the full two-merchant lifecycle.
- Manual poor-network rehearsals, backup video, team/contact fields, track
  confirmation, and judge access are not yet final.

## Closed deltas

- The generated ABI client now drives the demo through a self-contained vendored
  package produced from `packages/latch-client`.
- Testnet network, contract, WASM, and proof constants are generated from one
  checked-in network definition and deployment manifest.
- Contract events now expose the PRD accounting fields and have direct payload
  assertions in the production test suite.
- QR request/approval, concurrent holds, guarantee polling, three-fact decline
  evidence, and the capture breakdown now ship in the judge UI.
- The Freighter/XLM live fallback and deterministic LUSD proof are documented as
  deliberate, non-interchangeable modes.
