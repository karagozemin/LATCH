# LATCH submission pack

## Submission fields

**Project:** LATCH  
**Category:** Genesis — organizer confirmation required; see eligibility note  
**Thematic track:** Stellar Unlocked  
**Tagline:** Funds that keep their promise.  
**Repository:** https://github.com/karagozemin/Latch  
**Demo:** public Vercel URL to add after the release freeze
**Testnet contract:** https://stellar.expert/explorer/testnet/contract/CCPQ2PBP7CYUP5FPKHJPOBGGI6WQZ7VOWKJY4HYWO2FTRU2TMGJ4JPWU

Team names, contact details, and the final video URL must be added by the team
before submission.

## One-line description

LATCH gives Stellar smart accounts card-like authorization holds: a merchant
can verify reserved payment capacity, capture only the final bill, and release
the rest without taking custody first.

## Problem

Hotels, fuel stations, rentals, delivery apps, and many other merchants need to
know that a customer can pay before the final amount is known. Card networks
solve this with authorization holds. Token payments usually force a bad choice:
transfer the maximum up front, escrow it, or trust that the balance will still
exist later. That creates custody, fragmented liquidity, refund friction, and a
poor payer experience.

## Solution

LATCH makes the payer's Stellar contract account enforce one shared capacity
rule. A hold records merchant, maximum, expiry, and reference but transfers
nothing. Direct payments cannot consume reserved capacity. The bound merchant
can later capture at most the ceiling or release it. `verify_hold` reports both
activity and current backing, so the UI never calls an under-backed promise a
guarantee.

## Why Stellar

- Soroban custom-account authorization places the policy at the payer boundary.
- Stellar Asset Contracts provide atomic token movement after policy checks.
- Cheap, fast Testnet transactions make merchant verification and settlement
  practical at checkout speed.
- The product exposes Stellar's account programmability rather than wrapping a
  generic escrow contract around the same flow.

## What is verifiably built

- Production Soroban contract with 15 lifecycle, authorization, attack,
  invariant, and event-payload tests.
- Five isolated host-behavior spike suites covering 14 protocol assumptions.
- Full public Testnet lifecycle: deposit 50; holds 30 + 15; reject 10 with
  unchanged before/after reads; pay 4; capture 8.40; release 15.
- Freighter SEP-53 live mode with no application-held private key.
- Merchant request builder with amount, expiry, reference, QR, payload hash,
  payer authorize, and payer decline.
- Two-profile return handoff with bound-merchant wallet matching and fresh
  on-chain verification of merchant, ceiling, expiry, and request hash before
  capture or release unlocks.
- CI gates for format, Clippy, tests, optimized WASM, generated ABI drift,
  frontend lint, 15 frontend tests, builds, audits, and committed bundle drift.

## Canonical 90-second video script

1. **0–10s — Pain:** “A hotel can freeze your money without charging it.
   Stablecoin payments still make you prepay or escrow. LATCH adds the missing
   promise layer.”
2. **10–25s — Architecture:** Show owner → LATCH account → hold registry → SAC.
   “The payer keeps custody; the account enforces capacity.”
3. **25–40s — Two holds:** Authorize 30 and 15. Show `reserved 45 / available
   5 / transferred 0`.
4. **40–55s — Safety proof:** Attempt 10. Show before available 5, typed
   simulation rejection, and unchanged balance/available after.
5. **55–70s — Useful balance:** Pay 4 successfully; both holds stay intact.
6. **70–82s — Settlement:** Capture 8.40; show 21.60 released and the second
   15 still reserved. Release the second hold; available becomes 37.60.
7. **82–90s — Proof and close:** Open a Testnet link. “The merchant gets
   certainty, not custody. Release takes seconds, not seven days.”

## Honest limitations

- Genesis v1 supports one configured asset and one terminal capture per hold.
- The live UI implements a two-profile link/QR handoff, but the complete
  merchant → payer → merchant Freighter rehearsal must still be archived before
  release. A one-wallet route remains only for stage recovery.
- Issuer clawback/freeze remains issuer risk; LATCH detects backing loss and
  stops reporting a guarantee.
- The public Vercel deployment is intentionally deferred until the release
  build is frozen.

## Eligibility and disclosure note

The official site describes Genesis as “new idea, early prototype, or problem
worth solving → working product” and Scale as moving an existing product toward
production. LATCH is currently an early prototype but has meaningful pre-event
implementation. Before selecting Genesis, obtain organizer confirmation and
freeze a pre-event baseline commit. The final submission must list exactly what
was built during the 25–26 October hacking window; never imply that pre-event
work was produced during those 28 hours.
