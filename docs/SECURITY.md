# Security notes

Latch has not had a third-party audit. Treat this as hackathon-grade software until it has.

## Design

- Immutable. No owner, admin, pause, fee, upgrade or rescue function. Nobody can move user funds except through the three user functions.
- Holds are isolated by accounting: for each hold, deposited = captured + refunded + remaining.
- `createHold`, `capture` and `refundExpired` are reentrancy-guarded, update state before transferring, and use SafeERC20.
- `createHold` checks that exactly the requested amount arrived and reverts otherwise, so fee-on-transfer behaviour cannot create an under-collateralised hold.
- Timing: `capture` works strictly before `expiry`; `refundExpired` works from `expiry` onward. There is no instant where both are possible.
- Only the designated recipient can capture, and only the payer can refund. Funds always go to those addresses.

## What was done

- Automated static analysis (Slither): only informational timestamp-comparison notes, which are the intended expiry checks.
- Two independent automated reviews of the source (rule-based and behaviour-focused). No material findings.
- 65 Foundry tests: happy paths, every revert path, events, exact demo flow, fee-on-transfer token, reentrancy attempts, fuzz tests and handler-based invariants (token conservation, per-hold accounting, status consistency).

These are not a substitute for a professional audit.

## Known limits

- USDC is a centrally issued token. If Circle blocklists or pauses an address, transfers involving it can revert. A blocklisted recipient cannot receive a capture; a blocklisted payer cannot receive a refund. Latch cannot override this.
- Funds are only returned by the payer calling `refundExpired`. If a payer never refunds, the remaining USDC stays in the contract (still owed to the payer). Nobody else can claim it.
- A hold that is fully captured or refunded is final. There is no cancel, extend or top-up.
- Expiry uses block timestamps, which validators can shift by a few seconds.
- The contract holds the pooled USDC of all holds. A bug in the USDC token itself would affect Latch.
- The frontend lists the latest 60 holds by reading the contract directly. Older holds remain usable on-chain.

## Reporting

Open an issue on the repository, or contact the maintainers privately for anything that puts funds at risk.
