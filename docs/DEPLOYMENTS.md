# Deployments

## Arc Testnet (chain ID 5042002)

| Field | Value |
| --- | --- |
| Contract | `0xdb90ccaee5b1c63139de9d01fd93b8c0c3665a3b` |
| Explorer | https://explorer.testnet.arc.io/address/0xdb90ccaee5b1c63139de9d01fd93b8c0c3665a3b |
| Deployment tx | `0xdcab033de2bbd2733dfa0873b9ad6541861fdcb464d99bbd4093a85a874a5fb0` |
| Deployed | 2026-11-01 |
| Compiler | solc 0.8.28, optimizer on (200 runs), EVM `cancun` |

Checks performed against the live deployment: `holdCount()` returns 0 and `USDC()` returns `0x3600000000000000000000000000000000000000`.

Source verification on the explorer has not been performed from Arc Studio. To verify it yourself, submit `contracts/Latch.sol` (use `forge flatten contracts/Latch.sol` for a single file) with the compiler settings above and no constructor arguments.

The first end-to-end demo run on this deployment has not been recorded here. After you run it (see `DEMO.md`), add the transaction links below.

### Demo transactions

| Step | Transaction |
| --- | --- |
| Approve 0.02 USDC | _add after running the demo_ |
| Reserve 0.02 USDC | _add after running the demo_ |
| Capture 0.01 USDC | _add after running the demo_ |
| Refund 0.01 USDC | _add after running the demo_ |

## Arc Mainnet (chain ID 5042)

Not deployed. See `DEPLOYMENT.md` for how to deploy it yourself.
