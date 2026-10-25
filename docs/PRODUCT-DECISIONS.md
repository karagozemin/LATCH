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
