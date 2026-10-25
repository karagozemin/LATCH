# Security evidence matrix

This matrix connects every security claim shown in the judge demo to a contract
control and an executable artifact. The canonical tests live in
[`contracts/latch/src/test.rs`](../contracts/latch/src/test.rs); CI also executes
five isolated protocol-behavior spike crates against `soroban-env-host 27.0.1`.

| Threat or invariant | Contract control | Executable evidence |
|---|---|---|
| Reserved capacity is double-spent | `pay` compares aggregate outgoing value with effective available capacity. | `full_hold_lifecycle_preserves_capacity`; `check_auth_accepts_exact_self_calls_and_sums_payments` |
| Owner bypasses policy with direct token calls or a relay | `__check_auth` defaults to deny and recognizes only exact self `pay` / `create_hold` contexts. | `check_auth_rejects_token_third_party_and_unknown_self_calls`; `spike-s2`; `spike-s3` |
| Wrong merchant captures a hold | Capture and void require authentication from the merchant stored in the hold. | `only_the_bound_merchant_can_capture` |
| Merchant captures above the ceiling | Capture rejects an amount greater than `maximum`. | `invalid_amounts_and_hold_bounds_are_rejected` |
| Capture harms another merchant's reservation | Settlement checks remaining backing against reservations for every other active hold. | `capture_preserves_backing_for_other_holds` |
| Issuer clawback makes a hold appear safe | Execution uses `min(mirror, real)` and verification reports `guaranteed: false` after backing loss. | `clawback_cannot_spend_reserved_capacity`; `verification_reports_backing_loss_without_hiding_active_status` |
| Expired or terminal hold is reused | Expiry is evaluated against the ledger; terminal transitions cannot run twice. | `expiry_releases_capacity_without_a_write`; `terminal_holds_cannot_transition_twice` |
| State grows without bound | Active holds are capped and terminal history is compacted before new holds are admitted. | `active_hold_count_is_bounded`; `terminal_history_is_compacted_when_the_bounded_map_fills` |
| Invalid owner signature reaches contract policy | Host crypto verification rejects the signature before successful authorization. | `invalid_signature_is_rejected_by_the_host_crypto_boundary` |
| External inflow desynchronizes accounting | Anyone may reconcile a positive real-balance delta through `sync`. | `permissionless_sync_reconciles_external_inflow` |
| Accounting claims cannot be reconstructed from events | Deposit, pay, capture, and sync events include their post-state or released-capacity facts. | `accounting_events_include_prd_evidence_fields` |
| Failed nested execution mutates accounting | Soroban transaction rollback restores state when the outer operation fails. | `spike-s3`; `spike-reentry` |
| Recording-mode simulation omits required state | Mirror writes happen in function bodies, while `__check_auth` remains storage-read-only. | `spike-s6` |

## Public network evidence

The checked-in [`Testnet proof manifest`](../deployments/testnet.json) records a
fresh deployment with distinct owner, payer, and two merchant identities. Its
canonical lifecycle provides public positive-path evidence for:

- two merchant-bound holds of 30 and 15 against one 50 LUSD balance;
- a safe 4 LUSD owner payment that preserves both reservations;
- an 8.40 LUSD merchant capture that releases the unused 21.60 ceiling;
- release of the second 15 LUSD hold;
- final equality of mirror and real balance at 37.60 LUSD.

The 10 LUSD overspend is negative-path evidence. It is rejected during typed
simulation, so there is intentionally no failed transaction hash. The manifest
records the same real balance and available capacity before and after the
attempt. Wrong-merchant, replay, invalid-signature, clawback, and storage-limit
cases are likewise best represented by deterministic tests rather than by
publishing intentionally failing transactions.

## Claim boundaries

| Claim | Boundary |
|---|---|
| Reserved capacity is payer-side backed | Issuer freeze, clawback, and asset authorization remain outside the account policy. |
| Merchant can rely on `verify_hold` | A fresh RPC read is required; network unavailability delays verification and settlement. |
| Capture is merchant-bound | LATCH does not establish the merchant's real-world identity or adjudicate fulfillment. |
| Owner authorization is key-safe in the app | Freighter and the browser remain part of the client trust boundary. |
| Tests cover the documented threat model | The prototype has not undergone an independent production security audit. |
| Testnet proof is reproducible | Testnet evidence is not a Mainnet deployment or production-readiness claim. |

## CI gate

Every push runs formatting, Clippy with warnings denied, the 15-test production
suite, all five spike suites, an optimized WASM build, the typed client build,
the demo typecheck/build, and a committed-bundle consistency check.

The Testnet lifecycle evidence is generated separately by
`npm run testnet:bootstrap` and recorded in `deployments/testnet.json` with exact
contract IDs, final balances, and Stellar Expert transaction links.
