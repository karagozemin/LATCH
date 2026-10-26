# Judge demo runbook

## 60-second product proof

1. Open the local or release demo and press **Run 12-second judge proof**.
2. Narrate: “The 30 and 15 holds transfer nothing; two merchants share one
   honest 50-unit capacity.”
3. At the orange decline state: “The chain reports 5 available, rejects 10, and
   reports the same balance and capacity afterward.”
4. At safe pay: “4 remains spendable without weakening either promise.”
5. At capture: “The hotel settles 8.40; its unused 21.60 returns immediately.”
6. At release: “The second 15 returns too; final available capacity is 37.60.”
7. Open one proof link: “These are the exact Testnet transactions, not UI mocks.”

## Two-profile live-wallet proof

Prerequisites: two Chrome profiles with Freighter set to Testnet, one merchant
G-address, one different payer G-address, and popup access enabled.

1. In the merchant profile, select **Live wallet**, connect the merchant, enter
   30 XLM plus expiry/reference, and press **Generate request + QR**.
2. Open the payer link in the payer profile. Connect the distinct payer wallet,
   create/fund its LATCH account if needed, and press **Authorize hold**.
3. Approve both Freighter prompts. The request's SHA-256 authorization ID is
   written into the hold's on-chain reference.
4. Copy or scan the returned **merchant settlement link** into the merchant
   profile.
5. Connect the exact merchant address. Confirm that capture/release remain
   disabled until the UI matches merchant, ceiling, expiry, request hash,
   activity, and backing against `verify_hold`.
6. Enter the final amount and capture, or release the hold. Open the resulting
   Stellar Expert transaction.

If a second profile is unavailable on stage, use the recovery path below. Do
not present it as the canonical merchant integration.

## One-wallet stage-recovery path

Prerequisites: Chrome, Freighter set to Testnet, popup access enabled, and a
fresh browser profile if rehearsing first-run behavior.

1. Select **Live wallet**, connect Freighter, then create LATCH and deposit 50
   Testnet XLM.
2. Request the 30 XLM hold and approve the transaction plus the LATCH
   authorization signature.
3. Attempt the 25 XLM overspend; the UI must show the before/after chain reads
   and state clearly that simulation rejected it before submission.
4. Pay 5 XLM safely, then capture 8 XLM or release the hold.
5. If an on-chain transaction is `FAILED`, use the displayed diagnostic and
   transaction link. Retry only when the UI explicitly labels it safe.

## Venue checklist

- Freighter is on Testnet and displays the expected G-address.
- The deployed frontend at <https://latch-ui.vercel.app> is open before presenting.
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
