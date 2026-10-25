---
title: "LATCH — Engineering Product Requirements Document"
subtitle: "Native Authorization Holds for Stellar Smart Accounts"
author: "Genesis Category · HackMeridian 2026 · Stellar"
date: "v1.1 · LOCKED · 19 October 2026"
---

\newpage

# 0. Document Control

| Field | Value |
|---|---|
| Document | LATCH Engineering PRD |
| Version | 1.1 — LOCKED |
| Lock date | 19 October 2026 |
| Build window | 25–26 October 2026 — official 28-hour build sprint |
| Submission deadline | Monday, 26 October 2026 at 12:00 |
| Venue | Warehouse ONE16, Marvila, Lisbon, Portugal |
| Event | HackMeridian 2026 |
| Category | Genesis — Idea → MVP |
| Prize pool | $30,000 across 6 winners, paid in equivalent XLM value |
| Genesis judging | Problem clarity · MVP quality · Stellar integration · continued development potential |
| Toolchain | `soroban-sdk 27.0.6`, `soroban-env-host 27.0.1` |
| Network | Stellar Testnet |
| Status | Scope frozen. No further ideation. |

**Change policy after lock:** Contract scope is frozen. Only two categories of
change are permitted before or during the build: (a) defects discovered by the
attack test suite, (b) UI polish. Any feature addition requires removing an
equivalent one. This rule exists because the single most common failure mode in
28-hour builds is scope creep after the core demo should already be working.

\newpage

# 1. Executive Summary

## 1.1 One-liner

**LATCH — Native authorization holds for Stellar smart accounts.**

> Cards can reserve money without moving it. Stablecoins couldn't. LATCH turns a
> Stellar account balance into programmable payment capacity: merchants reserve
> funds, capture only what they're owed, and never touch the rest.

## 1.2 What it does, in plain language

You do not pay now. You authorize a maximum. When the work is done, the merchant
takes only the real amount. The remainder was never taken, so there is nothing to
refund.

## 1.3 Why it wins

Five properties, all of which must hold simultaneously:

1. **Ecosystem-verified gap.** SDF's own Q3 2026 RFP defers `auth-capture` and
   explicitly says *"Do not foreclose either."*
2. **No collision.** Distinct from escrow (Trustless Work), from recurring
   payments (Vowena, Beans), from `upto` (x402), and from spending-budget
   policies.
3. **Stellar-native by necessity.** The primitive lives in `__check_auth`. It
   cannot be ported as a generic contract without losing the account-layer
   guarantee.
4. **Jury participates.** The judge holds the phone, gets declined, and watches
   their own balance recover in three seconds.
5. **Fits HackMeridian's 28-hour sprint.** One contract, one asset, one capture,
   two focused frontends.

This maps directly to the Genesis rubric: problem clarity, MVP quality, Stellar
integration, and continued development potential.

## 1.4 Technical readiness at lock time

Eleven protocol-behaviour questions were answered empirically against
`soroban-env-host 27.0.1` — the same host code that runs on Testnet — before a
single line of product code was written. Zero open unknowns remain. See §10.

\newpage

# 2. Problem Statement

## 2.1 The structural gap

Real commerce is not `pay(amount)`. Real payment systems require a lifecycle:

```
Authorize  →  Capture  →  Void  →  Expire
```

The defining characteristic of a large class of real-world payments is that
**the final amount is unknown at the moment authorization is needed, yet the
merchant requires assurance that the funds will exist when the amount becomes
known.**

## 2.2 Affected verticals

| Vertical | Authorization moment | Capture moment | Gap |
|---|---|---|---|
| Hotels | Check-in | Check-out | 1–14 days |
| Car rental | Pickup | Return + damage assessment | 1–30 days |
| Fuel | Pump activation | Pump stop | 2–10 minutes |
| Ride-hailing | Ride start | Ride end | 5–60 minutes |
| Food delivery | Order placed | Order adjusted + delivered | 20–90 minutes |
| E-commerce | Order placed | Fulfilment / shipment | 1–7 days |
| Ticketing | Reservation | Event confirmation | 1–90 days |

In every case the merchant must decide whether to render service **before** the
final amount exists.

## 2.3 Current options on Stellar, and why each fails

### Option A — Pay upfront, refund the difference

```
User → Merchant:  $200
Merchant → User:  $152.70   (later, separate transaction)
```

Failures:

- Merchant takes **custody** of money the payer never intended to spend.
- Requires a **refund transaction** — a second on-chain action, a second fee, and
  a second point of failure.
- Requires the payer to **trust** the merchant to return the remainder.
- Refund latency in the fiat world is 5–7 business days; on-chain it is merchant
  discretion.

This is the model the x402 ecosystem explicitly rejected. See §4.3.

### Option B — SEP-41 allowance (`approve` / `transfer_from`)

```
User: approve(merchant, $200)
Merchant: transfer_from(user, merchant, $47.30)
```

Failures, quoting SDF directly (SCF Handbook §3.4):

> "SEP-41 allowances alone (approve / transfer_from) **cannot enforce the
> recipient binding and single-settlement guarantees** the upto spec requires, so
> a contract-free design must document its weaker trust model explicitly."

Additional failures:

- An allowance is **permission, not capacity.** The payer can spend the same
  balance elsewhere and the allowance silently becomes unfundable.
- Unbounded or stale allowances are the single largest drain vector in on-chain
  finance.
- No expiry semantics.

### Option C — Escrow contract

```
User → Escrow contract:  $200   (funds locked)
Escrow → Merchant:       $47.30 (on release)
Escrow → User:           $152.70
```

Failures:

- Requires **per-deal funding.** Three concurrent merchants require three funded
  escrows and $425 of locked capital against a $500 balance.
- The escrow **takes custody**, which is precisely the objection the x402
  contributors raised.
- Typically includes an approval or dispute round-trip, adding latency and
  counterparty coordination.
- Protocol fees on release (Trustless Work charges 0.3% per release).

## 2.4 The missing primitive

None of the three provides a **reservation**: a commitment that is

- bound to a **specific merchant**,
- capped at a **specific maximum**,
- **time-bounded**,
- **not cancellable** by the payer,
- and **backed by capacity that the payer can no longer spend** —

while moving **zero tokens** until capture.

\newpage

# 3. Ecosystem Positioning

## 3.1 Primary evidence — SCF Handbook §3.4

From `stellar/scf-handbook`, `scf-awards/build-award/rfp-track.md`, x402
Facilitator RFP, published 23 July 2026:

> "`batch-settlement` is named as planned phase two work, not part of this grant,
> since on Stellar it needs **a Soroban escrow contract**, a voucher store,
> double spend prevention, and its own audit. **`auth-capture` is also deferred,
> as `upto` covers the metered case. Do not foreclose either.**"

Three inferences, each load-bearing:

**(a) Deliberate deferral, not oversight.** SDF named the primitive, deferred it,
and instructed bidders not to foreclose it. LATCH is not the discovery of a gap;
it is the closing of a recorded open item.

**(b) SDF does not equate auth-capture with escrow.** The same sentence prescribes
"a Soroban escrow contract" for `batch-settlement` and prescribes nothing for
`auth-capture`. This is the strongest available rebuttal to the escrow objection.

**(c) The stated justification is scoped.** `upto` covers *"the metered case."*
Metered is one case. The guarantee case — a hotel needing certainty at check-in —
is outside that justification.

## 3.2 Secondary evidence — the composability request

Same section, addressed to bidders:

> "Describe how it composes with **Stellar smart account spending policies** to
> keep an agent inside a budget."

SDF is asking bidders to *describe* this composition. LATCH *builds* the
account-layer half of it.

## 3.3 Tertiary evidence — the ecosystem's own dead end

`stellar/x402-stellar` Issue #72, *"Design Discussion: exact and upto for
Stellar."* The question: what happens to the unused portion of an authorized
ceiling?

**bomanaps, 7 August 2026:**
> "`settle()` atomically pulls the max into the contract, pays the actual, and
> refunds the rest in the same invocation — no allowance ever exists."

**Iam0TI, 15 August 2026 — rejects it:**
> "maxAmount is an authorization ceiling, not an amount the payer intends to
> spend, so I'd rather avoid temporarily pulling the full ceiling into the
> settlement contract just to refund the unused portion... keeping the contract
> from **unnecessarily taking custody of the full ceiling**."

**pedro-pelicioni, 15 August 2026 — withdraws his own preference:**
> "pulling the full ceiling into the contract to refund the remainder means the
> contract takes custody of money the payer never intended to spend, just to hand
> most of it back. That is worse than the expiry problem I was trying to avoid.
> **I withdraw the preference.**"

The thread converged on eliminating Option A, leaving allowances — which SDF's own
RFP declares insufficient. **The third option was not considered.**

LATCH is that third option: *do not move it, and do not approve it. Reserve it in
the payer's own account.*

## 3.4 Strategic narrative alignment

| SDF 2026 theme | LATCH contribution |
|---|---|
| Everyday financial services | Hotels, mobility, fuel, delivery — the actual long tail of commerce |
| Invisible blockchain | Payer taps once; no gas, no seed phrase visible in the flow |
| Real-world settlement volume | Removes the last structural blocker to merchant adoption |
| Composability | Reservation is a primitive other protocols consume via `verify_hold` |

\newpage

# 4. Prior Art and Differentiation

## 4.1 Comparison matrix

| | Tokens move at authorization | Concurrent claims on one balance | Merchant binding | Capacity guarantee | Payer can cancel | Custody |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| Pay + refund | Yes | N/A | Yes | Yes | No | Merchant |
| SEP-41 `approve` | No | Yes* | **No** | **No** | Yes | None |
| Escrow (Trustless Work) | **Yes** | **No** | Yes | Yes | Varies | Contract |
| x402 `upto` | No | **No** | Yes | **No** | Yes | None |
| Spending-budget policy | No | **No** | **No** | **No** | Yes | None |
| **LATCH** | **No** | **Yes** | **Yes** | **Yes** | **No** | **None** |

\* Multiple allowances are possible but none is backed; they can all fail.

## 4.2 Against escrow

Trustless Work's own Terms of Service describe milestone-based, non-custodial
escrows where funds sit in Soroban escrow contracts through a
funding → approval → release → dispute lifecycle, with a 0.3% protocol fee per
release. Their published use cases include security deposits — the same surface
as a hotel hold.

Three separations:

1. **No funding.** Zero tokens move until capture.
2. **No approval round-trip.** The merchant captures unilaterally, because the
   ceiling was bound at authorization time.
3. **Parallel, not per-deal.** One balance carries multiple simultaneous claims.

**Never say:** *"escrow structurally cannot do this."* A sufficiently complex
omnibus escrow can emulate it.

**Say:** *"This isn't a merchant-funded escrow. Reservation is a property of the
payer's own account balance."*

## 4.3 Against x402 `upto`

`upto` implementations (tolgayayci's working testnet build; PR #3134) share a
shape: the client signs once, and `settle()` performs
`approve` → `transfer_from` → optional `revoke` atomically inside a single
transaction.

The consequence: **between signing and settlement, nothing is reserved on-chain.**
The ceiling exists only inside a signature. If the payer spends the balance in
that window, settlement fails — after the merchant has already rendered service.

For a 200-millisecond metered API call, that window is negligible. For a
three-day hotel stay, it is the entire product.

**Line:** *"`upto` binds a ceiling to a signature. LATCH binds a ceiling to a
balance."*

## 4.4 Against spending-budget policies

OpenZeppelin ships a `spending_limit` policy (rolling window + cap), and
tolgayayci's x402 work uses a spending-budget policy on an audited OZ account with
on-chain refusal of over-budget payments, with working testnet transactions.

The distinction is categorical:

| | Spending budget | Reservation |
|---|---|---|
| Question answered | *"May I spend?"* | *"Will it be there?"* |
| Beneficiary | None — it is a cap on the payer | A specific merchant |
| Concurrency | One ceiling | Many, simultaneously |
| Prevents spending elsewhere | No | Yes |
| Category | Wallet safety | Payment rail |

**Line:** *"You cannot hold two budgets against the same balance. You can hold two
reservations."*

## 4.5 Against Vowena / Beans (recurring payments)

Different primitive entirely. Recurring answers *"pull repeatedly on a schedule."*
LATCH answers *"guarantee once, capture once, amount unknown at authorization."*
Documented here only to preempt the association.

\newpage

# 5. Core Invariant

## 5.1 Statement

```
BACKING    =  min(MIRROR_BALANCE, REAL_SAC_BALANCE)
AVAILABLE  =  max(0, BACKING − Σ(active, non-expired holds))

For every outflow:      outflow      ≤  AVAILABLE
For every new hold:     max_amount   ≤  AVAILABLE
```

No operation may reduce the account balance below total active reservations. This
applies to the owner, to session keys, to intermediary contracts, and to any
future signer. There is no override.

## 5.2 Guarantee semantics — precise wording

LATCH provides a **payer-side guarantee**: the payer can no longer spend through
the reservation.

LATCH does **not** provide an issuer-side guarantee. Asset-level controls
(`clawback`, `authorization_revocable`, freeze) sit above the account and are
outside its control. This is identical to a bank hold, which does not survive an
account freeze.

**UI must render:** `FUNDS RESERVED` or `PAYER-SIDE GUARANTEE`.
**UI must never render:** `GUARANTEED FUNDS`.
**Spoken pitch may say:** *"The payer can no longer spend through this
reservation."*

`verify_hold()` returns `guaranteed: false` whenever
`real_balance < total_reserved`, so the account reports the truth rather than a
stale claim.

\newpage

# 6. System Architecture

## 6.1 Component overview

```
┌─────────────────┐        ┌─────────────────┐
│   Payer App     │        │ Merchant Panel  │
│   (mobile)      │        │   (tablet)      │
└────────┬────────┘        └────────┬────────┘
         │  simulate / sign / submit │
         └───────────┬───────────────┘
                     ▼
            ┌─────────────────┐
            │  Stellar RPC    │
            │  (Testnet)      │
            └────────┬────────┘
                     ▼
        ┌────────────────────────────┐
        │   LATCH Contract Account   │
        │  ┌──────────────────────┐  │
        │  │ __check_auth         │  │  ← read-only policy
        │  │  · default deny      │  │
        │  │  · 2 call shapes     │  │
        │  └──────────────────────┘  │
        │  ┌──────────────────────┐  │
        │  │ State                │  │
        │  │  · mirror balance    │  │
        │  │  · holds map         │  │
        │  └──────────────────────┘  │
        └────────────┬───────────────┘
                     │ transfer (capture only)
                     ▼
            ┌─────────────────┐
            │   SAC (token)   │
            └─────────────────┘
```

## 6.2 Why an internal balance mirror exists

`__check_auth` **cannot** call `token.balance()`. Soroban prohibits contract
re-entrancy, and the call chain

```
SAC.transfer()  →  LATCH.__check_auth()  →  SAC.balance()
```

re-enters the SAC frame and aborts the transaction with
`"Contract re-entry is not allowed"` / `Error(Context, InvalidAction)`.

This was verified empirically (spike-reentry, §10) and confirmed in host source:
`call_n_internal` runs guest-initiated calls under
`ContractReentryMode::Prohibited`, and `Frame::StellarAssetContract` carries a
`contract_id`, so it participates in the re-entry scan.

Consequence: **all authorization state must be internal.** The mirror is not an
optimization; it is a requirement imposed by the runtime.

The same constraint is why the official Complex Account example reads its spend
limit exclusively from instance storage, and why LayerZero's Stellar endpoint uses
the abstract account pattern — as stated in the SCF RFP: *"uses the Abstract
Account pattern for DVN and Executor contracts to work within Soroban's
reentrancy prohibition."*

## 6.3 Why the mirror is written in function bodies, not in `__check_auth`

Recording mode — the mode used by transaction simulation — **does not invoke**
`__check_auth`. `require_auth` routes to `require_auth_recording`, which records
authorization without validating it.

If the mirror write lived inside `__check_auth`, the written key would be absent
from the simulated footprint. On enforcing submit, `__check_auth` would attempt a
write to a key outside the declared `readWrite` set, and the transaction would
fail — in front of the jury, on the button press.

Verified (spike-s4):

```
RECORDING: __check_auth count = 0, mirror unchanged
ENFORCING: __check_auth count = 1, mirror written
```

Moving the write into `pay()` / `capture()` / `deposit()` bodies resolves this
completely. Function bodies **do** execute in recording mode, so the mirror key
enters the footprint naturally.

Verified (spike-s6a):

```
RECORDING: __check_auth count = 0, mirror 1000 → 950   ← body wrote it
```

**Result: single-round `simulate → sign → submit`.** Two-round enforcing
simulation is not required.

Double-spend protection is preserved because the host invokes `__check_auth` at
each `require_auth`, so ordering holds:

```
pay#1  → __check_auth reads mirror=8, 5≤8 ✓ → body writes mirror=3
pay#2  → __check_auth reads mirror=3, 5>3 ✗ → REJECT
```

Verified (spike-s6d).

\newpage

# 7. Contract Specification

## 7.1 Storage layout

```rust
#[contracttype]
pub enum DataKey {
    Owner,        // BytesN<32>       ed25519 public key
    Token,        // Address          the single SAC this account holds
    Mirror,       // i128             internal balance accounting
    Holds,        // Map<u64, Hold>   SINGLE storage entry
    NextHoldId,   // u64
}
```

`Holds` is deliberately a single `Map` entry rather than one key per hold. Soroban
enforces a per-transaction read limit (200 entries); one entry keeps `available()`
at a single read regardless of hold count.

## 7.2 Types

```rust
#[contracttype]
#[derive(Clone, PartialEq)]
pub enum HoldStatus {
    Active,
    Captured,
    Voided,
    Expired,
}

#[contracttype]
#[derive(Clone)]
pub struct Hold {
    pub id:             u64,
    pub merchant:       Address,
    pub max_amount:     i128,
    pub expires_ledger: u32,
    pub reference:      BytesN<32>,
    pub status:         HoldStatus,
    pub captured_amount: i128,
}

#[contracttype]
pub struct HoldVerification {
    pub active:         bool,
    pub merchant:       Address,
    pub max_amount:     i128,
    pub expires_ledger: u32,
    pub reference:      BytesN<32>,
    pub guaranteed:     bool,
}
```

## 7.3 Constants

```rust
const MAX_ACTIVE_HOLDS:  u32 = 16;
const MAX_HOLD_LEDGERS:  u32 = 120_960;   // ≈ 7 days at 5s/ledger
const MAX_STORED_HOLDS:  u32 = 64;
```

`MAX_HOLD_LEDGERS` is a payer protection: a merchant cannot reserve capacity
indefinitely. The account itself caps hold duration.

## 7.4 Function specifications

### `__constructor`

```rust
pub fn __constructor(env: Env, owner: BytesN<32>, token: Address)
```

| | |
|---|---|
| Auth | None — atomic Soroban constructor |
| Guards | The host runs it exactly once at deployment |
| State | Writes `Owner`, `Token`, `Mirror = 0`, `Holds = {}`, `NextHoldId = 1` |
| Events | `latch_init(owner, token)` |

No re-initialization. No admin. No upgrade function.

---

### `deposit`

```rust
pub fn deposit(env: Env, from: Address, amount: i128)
```

| | |
|---|---|
| Auth | `from.require_auth()` — a classic Stellar G-account |
| Guards | `amount > 0` |
| Effects | `token.transfer(from → self, amount)`; `mirror += amount` |
| Events | `latch_deposit(from, amount, new_mirror)` |

**Critical design note:** `from` is a G-account, not the LATCH account. This call
therefore **never reaches `__check_auth`**, adds no whitelist branch, and creates
no re-entrancy path. Mirror and real balance stay atomically consistent in one
invocation — no `sync()` needed.

---

### `pay` — the single outflow path

```rust
pub fn pay(env: Env, to: MuxedAddress, amount: i128)
```

| | |
|---|---|
| Auth | `env.current_contract_address().require_auth()` → invokes `__check_auth` |
| Guards | `amount > 0`; `amount ≤ available()` (defence in depth — `__check_auth` also enforces) |
| Effects | `mirror -= amount`; `token.transfer(self → to, amount)` |
| Events | `latch_pay(to, amount, new_available)` |

`withdraw` does not exist as a separate function. The UI exposes a *Withdraw*
button that calls `pay(owner_g_account, amount)`. One outflow path, one accounting
point, one attack surface.

The nested `token.transfer(from = self)` uses invoker-contract auth and therefore
does **not** appear in `auth_contexts` and does **not** re-invoke `__check_auth`.
Verified (spike-s1b).

---

### `create_hold`

```rust
pub fn create_hold(
    env: Env,
    merchant: Address,
    max_amount: i128,
    expires_ledger: u32,
    reference: BytesN<32>,
) -> u64
```

| | |
|---|---|
| Auth | `env.current_contract_address().require_auth()` |
| Guards | `max_amount > 0` |
| | `expires_ledger > current_ledger` |
| | `expires_ledger − current_ledger ≤ MAX_HOLD_LEDGERS` |
| | `max_amount ≤ available()` |
| | `active_hold_count() < MAX_ACTIVE_HOLDS` |
| Effects | Inserts `Hold { status: Active }`; increments `NextHoldId` |
| **Token transfers** | **ZERO** |
| Events | `latch_hold_created(id, merchant, max_amount, expires_ledger)` |

The defining property of this function: it changes what the payer can spend while
moving nothing.

---

### `capture`

```rust
pub fn capture(env: Env, hold_id: u64, amount: i128)
```

| | |
|---|---|
| Auth | `merchant.require_auth()` — the merchant bound at hold creation |
| Guards | Hold exists |
| | `hold.status == Active` |
| | caller `== hold.merchant` |
| | `current_ledger ≤ hold.expires_ledger` |
| | `0 ≤ amount ≤ hold.max_amount` |
| | post-capture backing remains ≥ reservations belonging to other holds |
| Effects | `mirror -= amount`; `token.transfer(self → merchant, amount)`; `status = Captured` |
| Events | `latch_captured(id, amount, released = max_amount − amount)` |

**Single capture.** The hold terminates on first capture. The unused portion is
not refunded — it was never taken. It simply stops being reserved, and
`available()` rises in the same ledger.

`amount == 0` is equivalent to `void` and follows the same code path rather than
producing a distinct error.

The self-transfer inside `capture` does **not** invoke `__check_auth` (invoker
auth), so the reservation check does not block the merchant from collecting.
Verified (spike-s1a). No `CAPTURE_IN_PROGRESS` flag is required.

---

### `void`

```rust
pub fn void(env: Env, hold_id: u64)
```

| | |
|---|---|
| Auth | `merchant.require_auth()` |
| Guards | Hold exists; `status == Active`; caller `== hold.merchant` |
| Effects | `status = Voided` |
| Token transfers | Zero |
| Events | `latch_voided(id)` |

The payer has no equivalent. This asymmetry is the source of the guarantee's
economic meaning.

---

### `sync`

```rust
pub fn sync(env: Env)
```

| | |
|---|---|
| Auth | **None** — permissionless |
| Effects | `mirror = token.balance(self)` — unconditional |
| Events | `latch_synced(old_mirror, new_mirror)` |

Unconditional in both directions. An earlier design synced upward only; that was
wrong because **clawback** reduces the real balance and would leave the mirror
overstating capacity forever.

Griefing is not possible: setting the mirror equal to the true balance never
reduces anyone's funds; it corrects accounting. If the corrected balance falls
below total reservations, `verify_hold` immediately reports `guaranteed: false` —
which is the honest state.

---

### `available` (view)

```rust
pub fn available(env: Env) -> i128
```

```
backing   = min(mirror, token.balance(self))
available = max(0, backing − Σ { h.max_amount
                               | h.status == Active
                               ∧ current_ledger ≤ h.expires_ledger })
```

**Lazy expiry.** Expired holds are excluded from the sum at read time. No keeper,
no cron, no scheduled transaction. The real balance check prevents an issuer
clawback or stale mirror from creating spendable capacity. Once the bounded
64-record map fills, terminal/expired records are compacted; events retain the
historical audit trail.

---

### `verify_hold` (view) — the merchant's authorization code

```rust
pub fn verify_hold(env: Env, hold_id: u64) -> HoldVerification
```

```
guaranteed = hold.status == Active
           ∧ current_ledger ≤ hold.expires_ledger
           ∧ token.balance(self) ≥ total_reserved
```

Note that `verify_hold` is a view function invoked outside any auth frame, so it
**may** call `token.balance()` — the re-entrancy restriction applies only inside
`__check_auth`.

This function is the product's second half. A hotel must confirm the guarantee
before rendering service; a card terminal calls this an authorization code. It is
also the integration surface for anchors, POS providers, and x402 facilitators
after the hackathon.

\newpage

# 8. Authorization Policy

## 8.1 Design principle: default deny

The account authorizes **exactly two call shapes**. Everything else is rejected,
including calls to the token contract itself, including calls routed through
intermediary contracts, including contract creation.

## 8.2 Implementation

```rust
#[contractimpl]
impl CustomAccountInterface for Latch {
    type Signature = Signature;
    type Error     = LatchError;

    fn __check_auth(
        env:       Env,
        payload:   Hash<32>,
        signature: Signature,
        contexts:  Vec<Context>,
    ) -> Result<(), LatchError> {

        // 1 — authenticate
        let owner: BytesN<32> = env.storage().instance()
            .get(&DataKey::Owner).unwrap();
        env.crypto().ed25519_verify(&owner, &payload.into(), &signature.sig);

        // 2 — read available (STORAGE ONLY — never call the token contract)
        let available = available_internal(&env);

        // 3 — accumulate outflow across ALL contexts, write nothing
        let mut outflow: i128 = 0;

        for ctx in contexts.iter() {
            match ctx {
                Context::Contract(c) if c.contract == self_addr(&env) => {
                    if c.fn_name == symbol_short!("pay") {
                        outflow += arg_i128(&c, 1);
                    } else if c.fn_name == Symbol::new(&env, "create_hold") {
                        // no token flow at authorization time
                    } else {
                        return Err(LatchError::ForbiddenSelfCall);
                    }
                }

                Context::Contract(c) if c.contract == token_addr(&env) => {
                    return Err(LatchError::DirectTokenCallsDisabled);
                }

                _ => return Err(LatchError::ForbiddenOperation),
            }
        }

        // 4 — single check, after the loop
        if outflow > available {
            return Err(LatchError::ReservedBalanceViolation);
        }

        Ok(())   // ★ NO WRITES
    }
}
```

## 8.3 Why the accumulator lives outside the loop

A per-iteration check would admit this defect:

```rust
for ctx in contexts {
    let outflow = amount(ctx);            // reset each iteration
    if outflow > available { return Err(..) }
    write(available - outflow);           // last writer wins
}
```

With `available = $5` and two `$5` transfers, each passes individually and $10
leaves the account.

Empirically, sibling token transfers produce **two separate auth entries** rather
than one tree with two sub-invocations (verified, spike-s3-0), so this shape does
not arise for SEP-41 transfers. The accumulator is nonetheless correct-by-design
and costs nothing.

## 8.4 Why direct token calls are fully blocked

Blocking only `approve` / `transfer_from` / `burn_from` — while permitting raw
`transfer` — leaves an asymmetry. Since `__check_auth` no longer writes the
mirror, two raw transfer entries in one transaction would each read the same
stale value.

Blocking the token contract entirely eliminates the vector at its source:

- The whitelist reduces to two self-branches.
- The Relay/intermediary vector (spike-s2) closes with the same rule.
- Every outflow is forced through `pay()`, which is the one function that
  decrements the reservation ledger.

Verified (spike-s6c): a token-transfer context returns
`DirectTokenCallsDisabled`.

## 8.5 Authorization surface summary

| Context | Result |
|---|---|
| `self.pay(to, amount)` | Allowed; amount added to `outflow` |
| `self.create_hold(...)` | Allowed; no token flow |
| Any other `self.*` | `ForbiddenSelfCall` |
| `token.transfer` | `DirectTokenCallsDisabled` |
| `token.approve` / `transfer_from` / `burn` / `burn_from` | `DirectTokenCallsDisabled` |
| Any third contract | `ForbiddenOperation` |
| `CreateContractHostFn` / `CreateContractWithCtorHostFn` | `ForbiddenOperation` |

**Statement for Q&A:**
> "A LATCH account authorizes exactly two call shapes: `pay` and `create_hold`.
> It cannot be made to call the token contract directly — not by the owner, not
> through an intermediary. Every outflow goes through one function, and that
> function is the one that decrements the reservation ledger."

\newpage

# 9. Error Taxonomy

```rust
#[contracterror]
#[derive(Copy, Clone, PartialEq)]
#[repr(u32)]
pub enum LatchError {
    ForbiddenSelfCall         = 1,
    DirectTokenCallsDisabled  = 2,
    ForbiddenOperation        = 3,
    ReservedBalanceViolation  = 4,
    HoldNotFound              = 5,
    HoldNotActive             = 6,
    ExceedsHoldMaximum        = 7,
    HoldExpired               = 8,
    InsufficientAvailable     = 9,
    TooManyHolds              = 10,
    HoldDurationTooLong       = 11,
    InvalidAmount             = 12,
    InvalidExpiration         = 13,
    BalanceBackingLost        = 14,
    ArithmeticOverflow        = 15,
}
```

| # | Error | Raised by |
|---|---|---|
| 1 | `ForbiddenSelfCall` | `__check_auth` — non-whitelisted self function |
| 2 | `DirectTokenCallsDisabled` | `__check_auth` — any token-contract context |
| 3 | `ForbiddenOperation` | `__check_auth` — third contract or contract creation |
| 4 | `ReservedBalanceViolation` | auth/body — `outflow > available` |
| 5 | `HoldNotFound` | hold lookup after invalid ID or history compaction |
| 6 | `HoldNotActive` | `capture` / `void` on a terminal hold |
| 7 | `ExceedsHoldMaximum` | `capture` with `amount > max_amount` |
| 8 | `HoldExpired` | `capture` after `expires_ledger` |
| 9 | `InsufficientAvailable` | `create_hold` exceeding available capacity |
| 10 | `TooManyHolds` | `create_hold` at 16 active holds |
| 11 | `HoldDurationTooLong` | `create_hold` beyond `MAX_HOLD_LEDGERS` |
| 12 | `InvalidAmount` | non-positive payment/hold or negative capture |
| 13 | `InvalidExpiration` | hold expiry at/before the current ledger |
| 14 | `BalanceBackingLost` | capture would impair another active reservation |
| 15 | `ArithmeticOverflow` | checked arithmetic failure |

## 9.1 Error opacity — a documented limitation

Errors 1–4 originate inside `__check_auth`. They are asserted individually in the
test suite via `env.try_invoke_contract_check_auth::<LatchError>(...)`, which
returns the specific code.

Invalid Ed25519 signatures are different: in SDK 27 `ed25519_verify` aborts with
a host crypto error instead of returning a contract-defined error. Tests assert
that host boundary explicitly; the contract does not claim an unreachable
`InvalidSignature` variant.

**End-to-end, they do not reach the client.** A failed submit surfaces as
`Error(Context, InvalidAction)` — a generic authorization failure. Verified in
spike-s2.

Diagnostic events do carry the detail in local test environments, but public RPC
diagnostic availability is node-configuration dependent and must not be a
demo dependency.

**Product consequence:** the UI derives decline reasons from **on-chain reads**,
never from error strings. See §11.4.

**README wording:**
> "Twelve error paths, each asserted at the `__check_auth` boundary with a
> distinct code via `try_invoke_contract_check_auth`. End-to-end these surface as
> a generic auth failure, which is why the UI derives decline reasons from
> on-chain reads rather than error strings."

\newpage

# 10. Empirical Protocol Research

All experiments executed against `soroban-env-host 27.0.1` — the same host code
that runs on Testnet — prior to any product implementation.

## 10.1 Results

| ID | Question | Method | Result |
|---|---|---|---|
| **R0** | Can `__check_auth` call `token.balance()`? | Contract account + SAC transfer; control test without the call | **No.** `Error(Context, InvalidAction)`; diagnostic buffer contains `"Contract re-entry is not allowed"`. Control test fails differently → causation isolated. |
| **S1a** | Does `capture`'s self-transfer invoke `__check_auth`? | `available` forced to 0, capture attempted | **No.** Invoker-contract auth; `__check_auth` counter = 0; capture succeeds. |
| **S1b** | Does a nested self-transfer appear in `auth_contexts`? | `pay` → nested transfer, contexts dumped | **No.** `contexts = [pay]`, length 1. No double-count. |
| **S2** | Can an intermediary contract bypass the invariant? | 15-line `Relay.forward` calling `token.transfer(from = latch)` | **Scenario A.** `contexts = [transfer]`, length 1; relay root absent. Default-deny catches it. Over-available attempt reverts, balances unchanged. |
| **S3-0** | Can one auth entry carry two sibling transfers? | Single-tree entry vs two entries | **Single tree rejected.** Siblings require two separate entries. |
| **S3a** | Does the second `__check_auth` see the first write? | `mirror = 8`, two `$5` transfers | **Yes.** First writes 8→3; second reads 3, rejects. Isolated by a control run at `mirror = 1000` that passes. |
| **S3b** | Does the mirror roll back when the outer transfer fails? | Inflated mirror, real balance 10, transfer 50 | **Yes.** `__check_auth` passed and wrote 950; outer transfer failed; mirror restored to 1000. |
| **S4** | Does a `__check_auth` write enter the simulated footprint? | Recording vs enforcing counters | **No.** Recording: count 0, mirror unchanged. Enforcing: count 1, mirror written. → architecture changed. |
| **S6a** | Does a function-body write enter the footprint? | Mirror write moved into `pay()` body | **Yes.** Recording: `__check_auth` count 0, mirror 1000→950. → single-round simulation sufficient. |
| **S6c** | Does the token context close cleanly? | `try_invoke_contract_check_auth` with a token context | **Yes.** Returns `DirectTokenCallsDisabled`. |
| **S6d** | Is double-spend still blocked with body writes? | `mirror = 8`, two `$5` `pay` calls | **Yes.** First body writes 3; second `__check_auth` reads 3, rejects; full revert. |

## 10.2 Architectural decisions traced to evidence

| Decision | Driven by |
|---|---|
| Internal balance mirror | R0 — `__check_auth` cannot read the token |
| Mirror written in bodies, not `__check_auth` | S4 + S6a — footprint correctness |
| No `CAPTURE_IN_PROGRESS` flag | S1a — capture does not self-trigger |
| Accumulator outside the loop | S3-0 — correct-by-design |
| Default-deny including all token contexts | S2 + S6c — closes the intermediary vector |
| Single-round simulate/sign/submit | S6a |
| `sync()` unconditional | Clawback reasoning (no spike; design decision) |

## 10.3 Repository policy for spikes

Spike projects (`spike-reentry`, `spike-s1`, `spike-s2`, `spike-s3`, `spike-s6`)
are **protocol-behaviour experiments, not product code**. They contain no LATCH
state machine, no holds, no product logic.

They will **not** be committed to the hackathon repository. Their results are
cited in the README as engineering rationale.

\newpage

# 11. Frontend Specification

## 11.1 Design principle

The product must feel like a payment terminal, not a smart-contract dashboard.
Reference points: Stripe Terminal, Square, Apple Wallet. Not Etherscan.

The single most important visual is the **Reserved / Available bar**. It carries
the entire product thesis in one element: *my capacity dropped, but no money
moved.*

## 11.2 Payer app — mobile-first

### Home

```
┌─────────────────────────────────────┐
│                                     │
│            BALANCE                  │
│            $50.00                   │
│                                     │
│   ████████████████████░░░░░░░░░░    │
│   Reserved $45      Available $5    │
│                                     │
│   ┌───────────────────────────────┐ │
│   │ 🏨  Lisbon Riverside Hotel    │ │
│   │     Reserved  $30.00          │ │
│   │     Expires   18:42           │ │
│   │     AUTH #A7F2                │ │
│   ├───────────────────────────────┤ │
│   │ ⛽  Marvila Fuel               │ │
│   │     Reserved  $15.00          │ │
│   │     Expires   19:10           │ │
│   │     AUTH #B3C9                │ │
│   └───────────────────────────────┘ │
│                                     │
│      [  Send  ]    [ Withdraw ]     │
│                                     │
└─────────────────────────────────────┘
```

Behaviour:

- The bar animates when a hold is created or captured. Duration 400 ms, ease-out.
- Balance never changes at hold creation — only the bar segments move. This is
  the point.
- `AUTH #XXXX` derives from the first two bytes of `reference`.

### Hold approval (after QR scan)

```
┌─────────────────────────────────────┐
│                                     │
│       Lisbon Riverside Hotel        │
│          wants to reserve           │
│                                     │
│             $30.00                  │
│                                     │
│   ⓘ  Nothing is transferred now.    │
│      You'll only pay what you owe.  │
│                                     │
│   Expires in 60 minutes             │
│                                     │
│      [  Authorize hold  ]           │
│      [  Decline  ]                  │
│                                     │
└─────────────────────────────────────┘
```

### Capture notification

On capture, the payer device shows a transient sheet:

```
     ✓  Lisbon Riverside Hotel

        Paid       $8.40
        Released   $21.60

        Available  $5.00 → $26.60
```

The `Released` line is deliberately worded as *released*, not *refunded*, and the
tooltip reads: *"This was never transferred — it simply stopped being reserved."*

## 11.3 Merchant panel — tablet / desktop

```
┌──────────── NEW HOLD ─────────────────┐
│                                       │
│   Max amount   [  30.00  ]  USDC      │
│   Expires in   [  60  ]  minutes      │
│   Reference    [  Room 214        ]   │
│                                       │
│           [  Generate QR  ]           │
│                                       │
└───────────────────────────────────────┘

┌──────────── ACTIVE HOLDS ─────────────┐
│                                       │
│   AUTH #A7F2      ✅ FUNDS RESERVED   │
│   up to $30.00 · expires 18:42        │
│   Room 214                            │
│                                       │
│   Capture [  8.40  ]  [ Capture ]     │
│                       [ Void    ]     │
│                                       │
└───────────────────────────────────────┘
```

The `✅ FUNDS RESERVED` badge is driven by `verify_hold().guaranteed`, polled
every 3 seconds. If it returns `false`, the badge becomes `⚠️ NOT BACKED` in
amber. This is the honest-reporting behaviour described in §5.2 and is a
deliberate answer to the clawback question.

## 11.4 Decline UX — three on-chain reads

The chain returns a generic error (§9.1). The UI must therefore **never** claim a
reason. It shows three independent chain facts:

```
┌───────────────────────────────────────┐
│                                       │
│   1   available()      →   $5.00      │
│                                       │
│   2   transfer $10     →   ✕ FAILED   │
│       tx 9f3a…c21b     [ view ]       │
│                                       │
│   3   balance()        →   unchanged  │
│                                       │
└───────────────────────────────────────┘
```

Spoken line during the demo:

> "I'm not telling you it was declined. The chain is. It reports five dollars
> available, it refuses the ten dollar transfer, and the balance is unchanged.
> Here's the failed transaction hash."

This is stronger than an error string: three independent reads, none of which is
the presenter's interpretation, and none of which depends on diagnostic-event
availability.

## 11.5 Client integration decisions

| Decision | Rationale |
|---|---|
| **Own signing flow.** No Freighter, no third-party wallet. | Contract-account client support is explicitly "under development"; the `@x402/stellar` `authorizeEntry` override bug (x402#3018) sits in exactly this surface. |
| **Single-round** `simulate → authorizeEntry → submit` | S6a — body writes place the mirror key in the footprint. |
| **Resource fee × 2–3 constant multiplier** | No fee tuning on stage under any circumstance. |
| **Self-issued test asset**, not real Testnet USDC | Full control of issuer flags; no exposure to `authorization_required` or clawback surprises. |
| **Merchant trustlines pre-established** | A capture failing on a missing trustline would kill the single most important moment of the demo. |
| **`seed-demo.sh`** resets all state in one command | Testnet reset contingency. |

\newpage

# 12. Test Plan

## 12.1 Attack suite — the twelve

Each asserted with its specific error code. Auth-layer tests use
`env.try_invoke_contract_check_auth::<LatchError>(...)`, since `__check_auth` is a
reserved name and cannot be invoked directly.

| # | Test | Expected |
|---|---|---|
| 1 | Wrong signer attempts `pay` | host crypto verification error |
| 2 | Owner attempts an unlisted self function | `ForbiddenSelfCall` |
| 3 | Owner signs a raw `token.transfer` | `DirectTokenCallsDisabled` |
| 4 | Owner signs `token.approve` | `DirectTokenCallsDisabled` |
| 5 | Transfer routed through a Relay contract | `DirectTokenCallsDisabled` |
| 6 | Auth context containing contract creation | `ForbiddenOperation` |
| 7 | `pay` exceeding available | `ReservedBalanceViolation` |
| 8 | Two `pay` entries in one tx exceeding available in aggregate | `ReservedBalanceViolation` on the second |
| 9 | `capture` above `max_amount` | `ExceedsHoldMaximum` |
| 10 | `capture` after expiry | `HoldExpired` |
| 11 | `capture` by a non-bound address | authorization failure; state unchanged |
| 12 | `create_hold` at 16 active holds | `TooManyHolds` |

## 12.2 Invariant properties

| Property | Assertion |
|---|---|
| P1 | For all reachable states: `mirror ≥ Σ active holds` **or** `verify_hold().guaranteed == false` |
| P2 | Sum of tokens transferred out ≤ sum of deposits |
| P3 | No hold transitions out of a terminal state |
| P4 | An expired hold contributes zero to `total_reserved` |
| P5 | A failed outer transfer leaves the mirror unchanged (S3b) |
| P6 | `capture` is possible even when `available == 0` (S1a) |

## 12.3 Lifecycle happy path

```
deposit 50            → mirror 50,  available 50
create_hold A, 30     → available 20, transfers 0
create_hold B, 15     → available  5, transfers 0
pay 10                → REJECTED, balances unchanged
pay  4                → available  1, mirror 46
capture A, 8.40       → merchant +8.40, mirror 37.60, available 22.60
void B                → available 37.60
advance past expiry   → (no-op; B already terminal)
```

## 12.4 README claim

> "The production contract suite covers the lifecycle, authorization boundary,
> reservation invariants, clawback/backing loss, expiry, bounds, and state
> compaction against `soroban-env-host 27.0.1`."

\newpage

# 13. Demo Script — 3:30 target

| # | Time | Action | On screen |
|---|---|---|---|
| 0 | 0:20 | **Hook.** *"How many people in this room have had a hotel or a car rental freeze a few hundred euros on their card, and it took a week to come back? Raise your hand."* Then: *"That money was never spent. It was never theirs. It sat there frozen, because the payment network has no way to say maybe."* | Title slide only |
| 1 | 0:40 | Judge scans QR → authorizes Hotel hold $30 | `Reserved $30 · Available $20` + **`$0.00 transferred`** + explorer showing the balance intact |
| 2 | 0:30 | While speaking, fuel station places a $15 hold | `Reserved $45 · Available $5` — **two merchants, one balance.** No other team can show this. |
| 3 | 0:50 | **"Now try to send ten dollars of your own money."** | Three reads: `available $5` → `✕ FAILED` + tx hash → `balance unchanged` |
| 4 | 0:40 | Hotel issues the real bill: `Capture $8.40` | `$8.40 → merchant` · `Available $5 → $26.60` · judge's phone buzzes |
| 5 | 0:30 | Close + verticals | 🏨 🚗 ⛽ 🚕 🍔 📦 🎟️ |

**Running in the background on a second screen** (consumes no stage time):
over-capture rejection, expiry auto-release.

**Closing line:**

> "Card networks can reserve money without taking it. Stablecoins couldn't. Here
> the reservation lives in the payer's own account, the merchant never takes
> custody, and the release takes three seconds — not seven days."

**Optional strengthener if a technical judge is present:**

> "SDF's own Q3 RFP defers auth-capture and says: *do not foreclose either.* That
> line is about payment schemes for agents. We asked the same question one layer
> down — at the account itself — and built it for people."

## 13.1 Rehearsal requirement

Thirty full run-throughs before the demo. Non-negotiable. The demo is the product.

Contingency: a pre-recorded 90-second screen capture of the full flow, ready to
play if the network is unavailable. Never shown unless required.

\newpage

# 14. Q&A Playbook

| Question | Answer — one breath |
|---|---|
| **How is this different from escrow?** | "This isn't a merchant-funded escrow. Reservation is a property of the payer's own account balance. Nothing is funded, nothing is released — nothing moved." |
| **Doesn't `upto` already do this?** | "`upto` binds a ceiling to a signature. LATCH binds a ceiling to a balance. In `upto`, nothing is reserved on-chain between signing and settlement — if the payer spends the money first, settlement fails and the merchant already delivered. Fine for a 200-millisecond API call. Not fine for a three-day hotel stay." |
| **Isn't this just a spending policy?** | "A budget answers *may I spend* — it's a ceiling on the payer. A reservation answers *will it be there* — it's a commitment to a specific merchant. You cannot hold two budgets against the same balance. You can hold two reservations." |
| **What about clawback?** | "The hold guarantees the merchant against the *payer*, not the issuer. A bank hold doesn't survive an account freeze either. And `verify_hold` stops reporting the hold as backed — the account doesn't pretend." |
| **Why block `approve` entirely?** | "An unbounded allowance is the one thing that can hollow out a hold. SDF's own RFP says allowances can't enforce recipient binding or single-settlement guarantees." |
| **Then it can't be an x402 payer?** | "Not in v1, deliberately. v2 is allowance-as-reservation: an `approve` consumes available balance and registers as a reservation with the spender as beneficiary. That's exactly the composition SDF's Q3 RFP asks bidders to describe." |
| **Can the owner delete a hold?** | "There is no upgrade function, and `__check_auth` authorizes exactly two call shapes. There is no signing path — owner, session key, or intermediary — that reaches around an active hold." |
| **Exchange support?** | "Contract-account payments go through the SAC as muxed transfers, which exchanges don't support today. It's in the limitations section." |
| **Why Stellar?** | "Because on Stellar an account *is* a contract that defines its own authorization rules. A LATCH account isn't a third-party escrow holding your money — it's your account enforcing its own reserved-balance rule. That's why this primitive belongs at the account layer, not bolted on top of it." |
| **Why not use OpenZeppelin's smart account?** | "That's where this belongs long-term — the logic maps directly onto `install` / `enforce` / `uninstall`. In HackMeridian's 28-hour sprint we built the primitive; upstreaming it as a policy module is the next milestone." |
| **What if the payer just never deposits?** | "Then `verify_hold` reports `guaranteed: false` and the merchant doesn't render service. The badge is the whole point of the merchant panel." |
| **Why single capture?** | "Scope. Partial capture is a v2 feature and needs its own accounting for the residual reservation. v1 terminates the hold on first capture and releases the rest in the same ledger." |

\newpage

# 15. Scope

## 15.1 In scope

- One Soroban contract account, single asset
- `__constructor` · `deposit` · `pay` · `create_hold` · `capture` · `void` · `sync` ·
  `available` · `verify_hold`
- `__check_auth` default-deny policy, two authorized call shapes
- Lazy expiry, max 16 active holds, max 7-day hold duration
- Focused lifecycle, authorization, attack, and invariant tests; host-level
  signature failures are distinguished from contract error codes
- Payer mobile web app with Reserved/Available bar
- Merchant panel with QR generation and `FUNDS RESERVED` badge
- Three-read decline panel with explorer links
- Real Stellar Testnet transactions throughout
- README with engineering notes and limitations

## 15.2 Out of scope — non-negotiable

AI · agents · x402 integration · ZK · oracles · bridges · cross-chain · token
issuance · DAO · marketplace · multi-asset · partial capture · passkeys ·
full OpenZeppelin smart-account framework integration · Protocol 28 features ·
upgrade functions · admin roles · dispute resolution · fee mechanism

Each of these has been considered and deliberately rejected. Adding any one of
them requires removing something from §15.1.

\newpage

# 16. HackMeridian 28-Hour Execution Plan

| Hours | Workstream | Deliverable |
|---|---|---|
| 0–1 | Setup | Repo, `soroban-sdk 27.0.6` pinned, Testnet identities, self-issued asset, merchant trustlines, `seed-demo.sh` |
| 1–4 | Contract core | Storage, types, `__constructor`, `deposit`, `available_internal` |
| 4–7 | Authorization | `__check_auth` with default deny; first three attack tests green |
| 7–10 | Holds | `create_hold`, `verify_hold`, lazy expiry |
| 10–13 | Settlement | `pay`, `capture`, `void`, `sync` |
| 13–16 | **Attack suite** | All twelve tests green with distinct codes |
| 16–17 | Deploy | Testnet deploy, end-to-end flow via CLI, tx hashes captured |
| 17–21 | Payer app | Home, Reserved/Available bar, hold approval, capture notification |
| 21–24 | Merchant panel | Create hold, QR, active holds, `FUNDS RESERVED` badge, capture/void |
| 24–25 | Decline panel | Three-read UI, explorer integration, failed-tx display |
| 25–26.5 | **Rehearsal** | Full run-throughs; final demo video recorded |
| 26.5–27.5 | Submission | README, pitch deck, demo video, GitHub and submission answers |
| 27.5–28 | Buffer | Reserved for submission failure only; no new features |

## 16.1 Hard gates

- **Hour 16:** if the attack suite is not green, stop all frontend work.
- **Hour 18:** the contract freezes. No contract changes after this point under
  any circumstance.
- **Hour 25:** feature work stops. Only rehearsal and submission materials.
- **Monday 12:00:** HackMeridian submission deadline. No late submission.

\newpage

# 17. Repository Structure

```
latch/
├── README.md
├── contracts/
│   └── latch/
│       ├── Cargo.toml
│       └── src/
│           ├── lib.rs          # contract + __check_auth
│           ├── types.rs        # Hold, HoldStatus, HoldVerification, DataKey
│           ├── errors.rs       # LatchError
│           ├── events.rs       # typed contract events
│           └── test.rs         # lifecycle, attack, and invariant suite
├── apps/
│   ├── payer/                  # mobile-first web app
│   └── merchant/               # tablet panel
├── scripts/
│   ├── deploy.sh
│   ├── issue-asset.sh
│   ├── setup-trustlines.sh
│   └── seed-demo.sh            # one command, full demo state
└── docs/
    └── PRD.md                  # this document
```

## 17.1 README section order

1. One-liner and demo GIF
2. The problem — authorize before you know the amount
3. Why Stellar — the account *is* the policy
4. How it works — state machine diagram
5. Authorization policy — exactly two call shapes
6. **Engineering notes** — re-entrancy → mirror; footprint → body write; error
   opacity → on-chain reads
7. Security invariants and the test table
8. **Limitations** — muxed transfers unsupported by exchanges, single asset,
   single capture, contract-account tooling is dev-preview
9. Roadmap — allowance-as-reservation, OZ policy module, POS integration

## 17.2 Key README paragraph

> The internal balance mirror exists because Soroban prohibits re-entrancy:
> `__check_auth` cannot call back into the token contract. We verified this
> against `soroban-env-host 27.0.1` before building — the same constraint that
> leads LayerZero's Stellar endpoint to use the abstract account pattern for its
> DVN and Executor contracts. The mirror write lives in function bodies rather
> than in `__check_auth` because recording-mode simulation does not invoke
> `__check_auth`, so a write placed there would be absent from the transaction
> footprint and would fail on submit.

\newpage

# 18. Risk Register

| # | Risk | Probability | Impact | Mitigation |
|---|---|---|---|---|
| R1 | Contract-account client tooling instability | Medium | **Fatal** | Own signing flow; fee × 2–3; recorded fallback video |
| R2 | Missing merchant trustline on capture | Low | **Fatal** | `setup-trustlines.sh` pre-run; verified in rehearsal |
| R3 | Testnet reset before or during the event | Low | **Fatal** | `seed-demo.sh` reconstructs all state in one command |
| R4 | Error opacity read as "the UI is making it up" | Medium | High | Three on-chain reads; explicitly narrated |
| R5 | The `upto` implementer is in the room | Medium | Medium | Q&A cards 2 and 3 memorised verbatim |
| R6 | Escrow objection from a technical judge | High | Medium | §4.2 wording; never claim escrow "cannot" |
| R7 | Scope creep past hour 25 | Medium | High | Hard gates in §16.1 |
| R8 | Judge's phone fails during the live demo | Low | High | Second pre-provisioned device on standby |
| R9 | Network unavailable at the venue | Low | **Fatal** | Fallback video; local RPC as last resort |
| R10 | Another team ships an auth-hold product | Low | High | Differentiate on account layer + concurrent holds + `verify_hold` |

\newpage

# 19. Post-Hackathon Roadmap

## v1 — Genesis (this build)

Native authorization holds. Single asset, single capture, default-deny policy.

## v2 — Allowance-as-reservation

An `approve` consumes available balance and registers as a system-held
reservation with the spender as beneficiary. This makes a LATCH account capable of
acting as an x402 `upto` payer **without the guarantee leaking** — the composition
SDF's Q3 RFP asks bidders to describe.

## v3 — OpenZeppelin policy module

Upstream the reservation logic as a stateful policy implementing
`install` / `enforce` / `uninstall`, bound to context rules. Note: stateful
policies must segregate storage by both smart-account address and context-rule ID.

## v4 — Ecosystem integration

`verify_hold` as the integration surface for anchors, POS providers, and
facilitators. Multi-asset. Partial capture with residual reservation accounting.

## Funding narrative

**InstAward pitch, one sentence:**

> "SDF deferred `auth-capture` and said *do not foreclose it*. We built the
> account-layer implementation and shipped it working on Testnet during
> HackMeridian's 28-hour Genesis sprint."

**SCF Build pitch:** reservation as shared payment infrastructure — merchant
integrations, an SDK, and an audited policy module.

\newpage

# Appendix A — Sources

| Ref | Source | Used for |
|---|---|---|
| A1 | `stellar/scf-handbook` — `scf-awards/build-award/rfp-track.md` §3.4 | `auth-capture` deferral; allowance insufficiency; smart-account composability request; re-entrancy note re LayerZero |
| A2 | `stellar/x402-stellar` Issue #71 | `upto` implementation shape; smart-account payer testing |
| A3 | `stellar/x402-stellar` Issue #72 | Ecosystem rejection of custody-based ceiling handling |
| A4 | Stellar Docs — *Implement a contract account with multisig and custom authorization policies* | `__check_auth` structure; `auth_context` scanning; `try_invoke_contract_check_auth`; dev-preview caution |
| A5 | Stellar Docs — *Contract Accounts* / *Advanced contract account patterns* | Contract accounts holding assets; muxed transfer limitation |
| A6 | OpenZeppelin Stellar Contracts — *Policies* | Signer/policy architecture; `spending_limit`; stateful storage segregation |
| A7 | Trustless Work — Terms of Service | Escrow lifecycle and fee model, for differentiation |
| A8 | `soroban-env-host 27.0.1` source — `host/frame.rs`, `auth.rs` | Re-entrancy prohibition; `auth_contexts` construction; recording vs enforcing modes |

# Appendix B — Terminology

| Term | Definition |
|---|---|
| **Hold** | A merchant-bound, capped, time-bounded reservation against a payer's balance. Moves no tokens. |
| **Capture** | The merchant collecting an amount at or below the hold maximum. The first and only token transfer. |
| **Void** | Merchant-initiated release of a hold without capture. |
| **Available** | Mirror balance minus the sum of active, non-expired holds. |
| **Mirror** | Internal balance accounting, required because `__check_auth` cannot read the token contract. |
| **Lazy expiry** | Expired holds are excluded at read time; no keeper process exists. |
| **Payer-side guarantee** | The payer cannot spend through the reservation. Does not bind the asset issuer. |
| **Default deny** | The authorization policy rejects every call shape except an explicit whitelist. |

# Appendix C — Locked Specification Summary

```
✓ single asset                ✓ no owner cancellation of holds
✓ single capture              ✓ no admin bypass, no upgrade function
✓ no allowances (v1)          ✓ merchant-authenticated capture
✓ lazy expiry                 ✓ max 16 active holds
✓ verify_hold / auth code     ✓ max hold duration ~7 days

★ __check_auth: READ ONLY — never writes, never calls the token contract
★ mirror written in pay() / capture() / deposit() bodies
★ whitelist: self { pay, create_hold } — nothing else
★ direct token calls: fully blocked → DirectTokenCallsDisabled
★ single outflow path: pay(to, amount); withdraw is a UI alias
★ deposit(from, amount): G-account auth, mirror atomic, no __check_auth
★ sync(): permissionless, unconditional, mirror = real balance
★ verify_hold: guaranteed = false when real < total_reserved
★ soroban-sdk 27.0.6 pinned
★ frontend: single-round simulate → sign → submit
★ UI language: "FUNDS RESERVED", never "GUARANTEED FUNDS"
★ decline UX: three on-chain reads, never error strings
```

---

**END OF DOCUMENT — LATCH Engineering PRD v1.1 — LOCKED 19 October 2026**
