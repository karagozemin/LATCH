# Judge demo runbook

## 60-second product proof

1. Open the private hosted demo and press **Run 12-second judge proof**.
2. Narrate: “Creating the 30-unit hold transfers nothing. It changes what this
   payer-owned account is allowed to spend.”
3. At the orange decline state: “The account rejects the 25-unit overspend; the
   merchant's guarantee survives.”
4. At safe pay: “Unreserved funds remain usable.”
5. At capture: “The merchant settles 8; the unused 22 returns immediately.”
6. Open one proof link: “These are the exact Testnet transactions, not UI mocks.”

## Live-wallet proof

Prerequisites: Chrome, Freighter set to Testnet, popup access enabled, and a
fresh browser profile if rehearsing first-run behavior.

1. Select **Live wallet**, connect Freighter, then create LATCH and deposit 50
   Testnet XLM.
2. Request the 30 XLM hold and approve the transaction plus the LATCH
   authorization signature.
3. Attempt the 25 XLM overspend; the simulation must reject before a network fee
   is paid.
4. Pay 5 XLM safely, then capture 8 XLM or release the hold.
5. If an on-chain transaction is `FAILED`, use the displayed diagnostic and
   transaction link. Retry only when the UI explicitly labels it safe.

## Venue checklist

- Freighter is on Testnet and displays the expected G-address.
- Hosted and localhost tabs are open before presenting.
- Replay mode is reset to beat 1.
- A live account is created once during rehearsal and its browser storage kept.
- Stellar Expert proof links are opened in background tabs.
- Screen recording resolution and browser zoom are fixed before rehearsal.

## Failure ladder

1. Wallet popup on the wrong account: switch Freighter to the connected
   G-address, refresh live state, and retry.
2. RPC latency or ambiguous network error: refresh state before sending another
   transaction.
3. Testnet unavailable: switch to Replay; it tells the same lifecycle and links
   the last verified public transactions.
4. Browser or venue failure: play the 90-second backup recording.

The backup recording is the only unfinished artifact in this runbook. Record it
after the final UI freeze so the fallback and live product remain identical.
