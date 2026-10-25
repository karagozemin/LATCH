# Product decisions

This record resolves implementation choices that changed after the PRD was
locked. It is authoritative when older PRD prose conflicts with the shipped
demo.

## D1 — Owner authorization

**Decision:** live mode uses Freighter plus a domain-separated SEP-53 message
signature for each LATCH authorization entry.

The browser asks Freighter to sign the exact Soroban authorization payload. The
LATCH custom account verifies that signature on-chain. Private keys never enter
the application, repository, browser storage, or hosted Site. This supersedes
the PRD's pre-build proposal to own signing keys in the demo client.

## D2 — Demo assets

**Decision:** the product has two deliberately distinct proof modes.

- Replay uses the deterministic self-issued LUSD Testnet lifecycle recorded in
  `deployments/testnet.json`, with exact explorer links.
- Live wallet uses native Testnet XLM in a fresh, user-owned LATCH account so a
  judge needs only Freighter and no trustline setup.

The UI must always label the active asset and must not imply that replayed LUSD
transactions came from the connected wallet.

## D3 — Canonical judge lifecycle

All final judge materials use this exact accounting story:

```text
deposit 50.00
hold A 30.00       -> reserved 30.00, available 20.00
hold B 15.00       -> reserved 45.00, available  5.00
attempt pay 10.00  -> rejected, balance and available unchanged
pay 4.00           -> balance 46.00, reserved 45.00, available 1.00
capture A 8.40     -> balance 37.60, reserved 15.00, available 22.60
release B 15.00    -> balance 37.60, reserved  0.00, available 37.60
```

The one-wallet live path remains a stage-safe fallback. The canonical replay
and final two-party UX must use the full two-hold lifecycle above.

## D4 — One-shot settlement

**Decision:** a v1 hold has exactly one terminal settlement: capture once for an
amount at or below the ceiling, or release once without payment.

A capture below the maximum releases the unused reservation in the same
transaction. Repeated partial capture is deliberately excluded. Supporting it
would require residual reservation state, additional replay rules, rounding
semantics, and clearer merchant-facing completion behavior. One-shot settlement
keeps the authorization and accounting surface small enough to test and explain
completely in the MVP.

## D5 — Merchant release and deterministic expiry

**Decision:** the payer cannot cancel an active hold in v1. The bound merchant
may release it, or ledger expiry removes it from reserved capacity.

Payer cancellation creates a race with merchant fulfillment: a payer could
revoke capacity after a merchant has relied on a valid reservation but before
capture. Resolving that race requires delivery evidence or dispute semantics,
which are outside this prototype. Merchant release plus deterministic expiry is
the narrowest rule that preserves the promise being demonstrated.

## D6 — Judge narrative

**Decision:** the primary product story is a hotel-style authorization where the
final charge is unknown at check-in. The secondary fuel reservation exists to
prove concurrent merchant claims against one balance; it is not a second product
story.

Final materials should lead with this single flow instead of claiming to solve
every merchant vertical. Wallet, anchor, POS, and issuer adapters remain outside
the Testnet MVP.
