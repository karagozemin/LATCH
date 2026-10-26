# LATCH — Stellar Developer Friction Log

LATCH is a payer-controlled Soroban smart account that provides card-style
payment authorization without escrow. We built and tested the contract,
Freighter signing flow, two-wallet web experience, and reproducible Testnet
lifecycle during HackMeridian.

## Stack used

- Stellar CLI 27
- Soroban Rust SDK 27.0.6
- Stellar JavaScript SDK 17.2.1
- Freighter API 6.0.1
- Stellar RPC and Horizon
- Stellar Asset Contracts and `CustomAccountInterface`
- Stellar Expert
- Stellar developer documentation
- Raven MCP for source-grounded documentation and ecosystem research
- OpenAI Codex for implementation, debugging, tests, review, and documentation

## Friction 1: ambiguous RPC outcomes

**Impact:** Medium

During Testnet account setup, an RPC request could surface a connection error
even though the funding operation had already succeeded. Retrying then returned
an "account already funded" response. The application had to treat the first
error as an unknown outcome, re-read account state, and continue if the desired
postcondition already existed.

**What helped:** Reading the account again through RPC/Horizon and making setup
steps idempotent.

**What would improve it:** SDK-level helpers and error types that clearly
distinguish rejected, timed-out, submitted-but-unconfirmed, and confirmed
transactions. Official examples should demonstrate post-error reconciliation,
not only the success path.

## Friction 2: custom-account signing from Freighter

**Impact:** High

The hardest integration boundary was authorizing a Soroban contract account
from a normal Freighter G-address. Freighter does not sign a C-address CAP-71
authorization preimage as though the contract were the selected G-address.
LATCH therefore signs a domain-separated SEP-53 message containing the exact
authorization payload, verifies the Ed25519 signature in `__check_auth`, and
preserves binding to the network, nonce, contract, invocation, and expiration
ledger.

**What helped:** Soroban custom-account documentation, Freighter's message
signing API, host-behavior spike tests, and inspection of simulated
authorization entries.

**What would improve it:** One official browser-to-contract reference project
showing the complete flow: build the invocation, simulate, obtain a wallet
signature, attach custom-account credentials, resimulate, submit, and recover
from an expired or rejected authorization. A maintained SDK helper for this
flow would remove substantial integration risk.

## Friction 3: `__check_auth` cannot read live token backing

**Impact:** High, but deterministic once understood

Soroban prevents re-entering the token contract from `__check_auth`. LATCH
could not query the live Stellar Asset Contract balance while evaluating the
account's authorization policy. We split the guarantee across two boundaries:
custom authorization validates the signed call and storage-only reservation
state, while contract execution validates real token backing. Effective backing
is the minimum of the internal mirror and the real token balance.

**What helped:** Isolated Soroban host tests. We created five small spike crates
with 14 tests before committing the behavior to the main contract.

**What would improve it:** The custom-account documentation should prominently
list forbidden host interactions inside `__check_auth`, with recommended
patterns for policies that depend on token balances or other contract state.

## Friction 4: simulation failures are correct but difficult to explain

**Impact:** Low

An attempted spend through reserved capacity is rejected during simulation,
before signing or submission. This is the desired safety behavior, but it means
there is no failed transaction hash for a demo or audit trail.

**Resolution:** The product labels the failure stage accurately and records
independent before/after reads showing that balance and available capacity are
unchanged.

**What would improve it:** More structured simulation error data and stable,
typed contract-error decoding in the JavaScript SDK.

## What worked especially well

- Rust contract tests and Soroban test utilities made invariant and attack-path
  testing fast.
- Stellar CLI made fresh build, deploy, invoke, and proof automation practical.
- The JavaScript SDK supported a complete Testnet lifecycle from the browser.
- Freighter kept all user signatures local and explicit.
- Raven MCP was valuable for checking technical claims against current Stellar
  documentation and for avoiding unsupported ecosystem claims.
- Stellar Expert made successful transactions and public contract state easy to
  share with judges.

## Highest-leverage improvement

Provide a single, maintained "custom account + browser wallet" golden path with
Freighter, exact authorization-entry signing, resimulation, submission,
idempotent retries, and recovery from ambiguous RPC outcomes. The individual
pieces exist, but connecting them currently requires substantial protocol-level
investigation.
