# Deployments

## Arc Testnet (chain ID 5042002)

| Field | Value |
| --- | --- |
| Contract | `0xdb90ccaee5b1c63139de9d01fd93b8c0c3665a3b` |
| Explorer | https://explorer.testnet.arc.io/address/0xdb90ccaee5b1c63139de9d01fd93b8c0c3665a3b |
| Deployment tx | `0xdcab033de2bbd2733dfa0873b9ad6541861fdcb464d99bbd4093a85a874a5fb0` |
| Deployment block | `70172256` (taken from the deployment transaction receipt; the contract code exists at this block) |
| Deployed | 2026-11-01 |
| Compiler | solc 0.8.28, optimizer on (200 runs), EVM `cancun` |

Checks performed against the live deployment: `holdCount()` returns 0 and `USDC()` returns `0x3600000000000000000000000000000000000000`.

Source verification on the explorer has not been performed. To verify it yourself, submit `contracts/Latch.sol` (use `forge flatten contracts/Latch.sol` for a single file) with the compiler settings above and no constructor arguments.

The first end-to-end demo run on this deployment has not been recorded here. After you run it (see `DEMO.md`), add the transaction links below.

### Demo transactions

| Step | Transaction |
| --- | --- |
| Approve 0.02 USDC | _add after running the demo_ |
| Reserve 0.02 USDC | _add after running the demo_ |
| Capture 0.01 USDC | _add after running the demo_ |
| Refund 0.01 USDC | _add after running the demo_ |

## Arc Mainnet (chain ID 5042)

Deployed independently by the project owner with Foundry and their own wallet, outside Arc Studio. Arc Studio did not deploy, sign or fund anything on mainnet.

| Field | Value |
| --- | --- |
| Contract | [`0xd09EAC2f4eF49A5E918bB49884189c37793a7CC2`](https://explorer.arc.io/address/0xd09EAC2f4eF49A5E918bB49884189c37793a7CC2) |
| Deployment tx | [`0xea0747048d177ce7b48830dbcb61b045b1fe63715e3098660bc565d36349cec6`](https://explorer.arc.io/tx/0xea0747048d177ce7b48830dbcb61b045b1fe63715e3098660bc565d36349cec6) |
| Deployment block | `29071512` |
| Deployer | [`0xcD14091eE1B8B51B84F0E971AeD62fD87dcF4044`](https://explorer.arc.io/address/0xcD14091eE1B8B51B84F0E971AeD62fD87dcF4044) |
| RPC | `https://rpc.mainnet.arc.io` |
| USDC (ERC-20 interface, 6 decimals) | [`0x3600000000000000000000000000000000000000`](https://explorer.arc.io/address/0x3600000000000000000000000000000000000000) |
| Source (`contracts/Latch.sol`) SHA-256 | `0b889effdbb2a1fefbb27d845f773465fa93b55b3ff3e37bf01096ac998d2d9f` |
| Compiler | solc 0.8.28, optimizer on (200 runs), EVM `cancun` |

Read-only checks the owner ran on their own machine, as reported to the maintainers:

- `USDC()` returns `0x3600000000000000000000000000000000000000`.
- `holdCount()` returns `0`.
- The deployed contract has non-empty runtime bytecode.
- Foundry reported the deployment as successful on chain 5042.

These details were supplied by the owner. They were not re-checked from Arc Studio, which made no mainnet RPC calls.

### Still pending

| Item | Status |
| --- | --- |
| Source verification on https://explorer.arc.io | Pending. Not yet performed. |
| Byte-for-byte comparison of deployed runtime bytecode with `contracts/out/Latch.sol/Latch.json` (see `DEPLOYMENT.md`, step 11) | Pending. Only "non-empty bytecode" has been confirmed. |
| First mainnet Reserve, Capture and Refund transactions | Pending. None are recorded yet. |

When the first mainnet round trip is done, add the transaction links here. Do not add a transaction that you have not seen on the explorer.

| Step | Mainnet transaction |
| --- | --- |
| Approve | _pending_ |
| Reserve | _pending_ |
| Capture | _pending_ |
| Refund | _pending_ |
