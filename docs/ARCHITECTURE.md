# LATCH architecture

LATCH is a Stellar contract account that owns its balance and defines the
authorization policy for spending it. A hold changes the account's available
capacity; it does not transfer funds to the merchant.

```text
Freighter owner
      │ SEP-53 signature over the exact Soroban auth payload
      ▼
LATCH custom account ─────── verify_hold(id) ──────► Merchant
      │                         active / guaranteed / maximum / expiry
      │ __check_auth permits only exact pay or create_hold call shapes
      ▼
Stellar Asset Contract
      │
      └── transfer only after available-capacity and merchant checks pass
```

## State and trust boundaries

| Boundary | What LATCH guarantees | What remains trusted or external |
|---|---|---|
| Owner → account | A valid owner signature is bound to the exact authorization payload. | Freighter and the owner's key custody. |
| Account → token | `pay` cannot consume reserved capacity; direct token calls are denied by the account policy. | Stellar host authentication and SAC correctness. |
| Hold → merchant | Only the bound merchant can capture or void; capture cannot exceed the maximum. | The merchant decides the final amount within that ceiling. |
| Mirror → backing | Execution uses the lower of mirrored and real token balance; `verify_hold` reports backing loss honestly. | Issuer clawback or freeze powers remain issuer risk. |

## Transaction lifecycle

1. `deposit` transfers the asset into the payer-owned LATCH account and updates
   its internal balance mirror.
2. `create_hold` records merchant, maximum, expiry, and reference. No token
   transfer occurs.
3. `pay` is authorized only when aggregate outgoing value fits the balance left
   after all active reservations.
4. `capture` authenticates the bound merchant, settles at most the maximum, and
   terminates the hold in the same transaction.
5. `void` terminates the hold without a transfer. Expired holds stop consuming
   capacity lazily when state is read.

## Why the balance mirror exists

Soroban forbids re-entry into the token contract from `__check_auth`, so the
policy cannot query the SAC balance while authorizing a spend. LATCH maintains a
mirror in ordinary contract functions and checks it against the real SAC balance
during execution. The five protocol spike crates in this repository validate
the host behavior that this design depends on.

## Current scope

Genesis v1 supports one asset per account, one terminal capture per hold, at
most 16 active holds, a maximum seven-day duration, and no upgrade entrypoint.
Contract-account muxed transfers are not yet accepted by every exchange or
wallet integration.
