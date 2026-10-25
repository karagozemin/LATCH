# Judge Q&A cards

## Why is this not escrow?

Creating a hold transfers zero tokens and creates no pooled custodian. Funds
remain in the payer's account; the account's authorization policy restricts how
much can leave while promises are active.

## What stops the owner bypassing a hold?

`__check_auth` defaults to deny. It accepts only exact `pay` and `create_hold`
self-call shapes and rejects direct token operations, unknown functions,
contract creation, and relay contexts. The production and spike suites exercise
those boundaries.

## Can the same balance back two merchants?

Yes, up to total capacity. The canonical proof reserves 30 and 15 against 50,
leaving 5 available. Every new hold and payment rechecks aggregate reservations.

## What if backing disappears through clawback or freeze?

Execution uses the lower of mirrored and real token balance. `verify_hold`
returns `guaranteed: false` when backing is insufficient, and the UI changes to
`NOT BACKED` instead of preserving a stale promise.

## Why a custom account instead of a standalone hold contract?

A standalone registry cannot stop the payer from transferring the same balance
elsewhere. The account authorization boundary sees outgoing operations and can
enforce the reservation before token movement.

## Why Stellar specifically?

Soroban custom accounts make authorization programmable, and SAC transfers can
settle atomically after that policy passes. LATCH demonstrates a capability at
the account layer rather than deploying generic escrow on another chain.

## Does live mode really use two wallets?

Yes. The merchant profile creates a request link, a distinct payer wallet opens
the hold, and a settlement link returns the contract and hold ID. Before the
merchant can act, the UI requires the bound merchant G-address and matches the
merchant, ceiling, expiry, and request hash against `verify_hold`. A shorter
one-wallet route exists only as a labeled stage-recovery option.

## Why is the rejected payment not linked to an explorer transaction?

It is intentionally rejected during Soroban simulation before signing or
submission, so there is no transaction hash and no fee. The UI labels that fact
and proves unchanged state with independent before/after reads.

## How do you avoid replaying a QR request?

The QR's authorization ID commits to merchant, amount, expiry, reference,
network, and asset, and is stored as the hold's on-chain reference. On-chain
authorization binds the exact call and the account assigns each accepted hold a
unique ID. Production integration should also track consumed request IDs and
expire request URLs server-side.

## What is the biggest remaining technical limitation?

One terminal capture per hold. Partial capture with residual reservation
accounting is intentionally deferred so the Genesis invariant remains small and
auditable.

## What was built before the event?

Answer from the frozen baseline and event commit log only. Do not improvise.
State pre-event architecture/protocol work and event-window product delta
separately.
