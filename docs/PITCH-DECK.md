# LATCH pitch deck

## 1 — Funds that keep their promise

Card-like authorization holds for Stellar smart accounts, without merchant
custody.

Visual: one line — **50 balance → 45 reserved → 5 still spendable**.

## 2 — The payment rail only knows “send”

Hotels, rentals, fuel, delivery, and ticketing often know the final amount only
later. Today token payments require prepayment, bespoke escrow, or balance risk.

Visual: `prepay maximum / escrow / trust` crossed out.

## 3 — A hold is a promise, not a transfer

The payer authorizes merchant, ceiling, expiry, and reference. Zero moves. The
merchant verifies the promise against current backing.

Visual: payer account with two merchant-bound reservations.

## 4 — The account is the rail

Freighter signs an exact SEP-53 authorization payload. The LATCH custom account
defaults to deny, preserves reserved capacity, and lets the Stellar Asset
Contract move only available funds.

Visual: owner → LATCH policy → hold registry → SAC.

## 5 — Three facts, not an error toast

Before: 5 available. Attempt: 10 rejected by typed contract simulation. After:
balance 50 and available 5, unchanged.

Visual: the three-fact decline panel plus public Testnet proof links.

## 6 — Capture only reality

The hotel reserved 30 and captures 8.40. LATCH releases 21.60 atomically while
the fuel merchant's separate 15 remains guaranteed. Releasing fuel restores
final available capacity to 37.60.

Visual: capture breakdown sheet.

## 7 — Built to survive technical judging

15 production tests, 14 protocol spike tests, generated typed client, ABI drift
gate, 12 frontend tests, lint, audits, optimized WASM, public Testnet lifecycle,
and 30/30 automated replay rehearsals.

Visual: green CI plus contract explorer.

## 8 — From demo to payment primitive

Next: partial capture, allowance reservations for x402 `upto`, multi-asset
accounts, merchant SDKs, and an OpenZeppelin-compatible policy module.

Close: **“The merchant gets certainty, not custody.”**
