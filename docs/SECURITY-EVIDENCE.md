# Security evidence matrix

This matrix connects the claims shown in the judge demo to executable evidence.
The canonical tests live in `contracts/latch/src/test.rs`; CI also executes five
isolated protocol-behavior spike crates against `soroban-env-host 27.0.1`.

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
| Failed nested execution mutates accounting | Soroban transaction rollback restores state when the outer operation fails. | `spike-s3`; `spike-reentry` |
| Recording-mode simulation omits required state | Mirror writes happen in function bodies, while `__check_auth` remains storage-read-only. | `spike-s6` |

## CI gate

Every push runs formatting, Clippy with warnings denied, the 14-test production
suite, all five spike suites, an optimized WASM build, the typed client build,
the demo typecheck/build, and a committed-bundle consistency check.

The Testnet lifecycle evidence is generated separately by
`npm run testnet:bootstrap` and recorded in `deployments/testnet.json` with exact
contract IDs, final balances, and Stellar Expert transaction links.
