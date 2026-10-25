# Rehearsal log

## Automated judge replay

| Date | Commit | Runs | Result | Final assertion |
|---|---|---:|---|---|
| 20 Oct 2026 | `544e069` | 30 | 30/30 passed | `37.60 available / 0 reserved / 8.40 received / Promise released` |

The repeatable command launches a clean headless Chrome profile, accelerates
only presentation delays, runs the complete seven-state UI replay, and asserts
the visible final accounting after every run:

```sh
npm run rehearse:replay
```

## Manual venue rehearsals

Automated replay reliability does not replace the required human run-throughs.
Record each real attempt here; include at least normal venue Wi-Fi, throttled
network, disconnected RPC, wrong Freighter network/account, wallet rejection,
and Testnet fallback cases.

| # | Network/failure condition | Replay | Live wallet | Proof link | Result/notes |
|---:|---|---|---|---|---|
| 1–30 | Pending at venue | — | — | — | Not yet performed |

Do not mark P6 rehearsal complete until all thirty rows are replaced with real
attempts and every failed run has a documented fallback outcome.
