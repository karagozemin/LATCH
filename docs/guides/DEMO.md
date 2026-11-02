# Demo: reserve, capture, expire, refund

[README](../../README.md) · [Architecture](../ARCHITECTURE.md)

Goal: reserve 0.02 USDC, capture 0.01 USDC, let the hold expire, refund the remaining 0.01 USDC.

You need two wallets on Arc Testnet: a payer and a recipient. Both need a little USDC for gas, and the payer needs at least 0.02 USDC. Get Arc Testnet USDC from the [Circle faucet](https://faucet.circle.com).

1. Connect the payer wallet.
2. In "Reserve USDC", paste the recipient address, choose 0.02 and "2 min", then approve and reserve. Arc gas is paid in USDC, so keep a small balance beyond the 0.02.
3. Switch to the recipient wallet. The hold appears under "Mine". Enter 0.01 and press Capture.
4. Wait until the countdown ends and the status shows Expired.
5. Switch back to the payer wallet and press "Refund 0.01 USDC".

Every transaction shows a "View transaction" link to the Arc Testnet explorer once the wallet has submitted it. Record them in [DEPLOYMENTS](../reference/DEPLOYMENTS.md).

The same flow is covered automatically by `test_DemoFlow_ReserveCapturePartialThenRefundRemainder` in [`contracts/test/Latch.t.sol`](../../contracts/test/Latch.t.sol).
