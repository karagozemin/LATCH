# Deployments

[README](../../README.md) · [Architecture](../ARCHITECTURE.md) · [Deployment guide](../guides/DEPLOYMENT.md)

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

The first end-to-end demo run on this deployment has not been recorded here. After you run it (see the [demo guide](../guides/DEMO.md)), add the transaction links below.

### Demo transactions

| Step | Transaction |
| --- | --- |
| Approve 0.02 USDC | _add after running the demo_ |
| Reserve 0.02 USDC | _add after running the demo_ |
| Capture 0.01 USDC | _add after running the demo_ |
| Refund 0.01 USDC | _add after running the demo_ |

## Arc Mainnet (chain ID 5042)

Deployed independently by the project owner with Foundry and their own wallet. No mainnet transaction was created by the tooling used to build this repository.

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

Deployment-time read-only checks the owner ran on their own machine, as reported to the maintainers:

- `USDC()` returns `0x3600000000000000000000000000000000000000`.
- `holdCount()` returns `0`.
- The deployed contract has non-empty runtime bytecode.
- Foundry reported the deployment as successful on chain 5042.

These details were supplied by the owner and describe the contract immediately after deployment. `holdCount()` has since advanced as the recorded mainnet holds were created.

### Verification status

| Item | Status |
| --- | --- |
| Source verification on https://explorer.arc.io | Pending. Not yet performed. |
| Byte-for-byte comparison of deployed runtime bytecode with `contracts/out/Latch.sol/Latch.json` (see the [deployment guide](../guides/DEPLOYMENT.md), step 11) | Pending. Only "non-empty bytecode" has been confirmed. |
| First complete mainnet Reserve, Capture and Refund lifecycle | Complete. Hold `#2` was reserved for `0.15 USDC`, partially captured for `0.05 USDC`, and refunded for the remaining `0.10 USDC`. |

### First mainnet lifecycle — Hold #2

Explorer evidence collected on 2026-11-02:

| Field | Value |
| --- | --- |
| Payer | [`0x2c06D8eBB95678944C9Ba9f67284619BA7AcAE51`](https://explorer.arc.io/address/0x2c06D8eBB95678944C9Ba9f67284619BA7AcAE51) |
| Recipient | [`0x9BC9C9E6d793fC2ed8A8cFc98d55e1f64d3bf6DF`](https://explorer.arc.io/address/0x9BC9C9E6d793fC2ed8A8cFc98d55e1f64d3bf6DF) |
| Reserved | `0.15 USDC` |
| Captured | `0.05 USDC` |
| Remaining after capture | `0.10 USDC` |
| Expiry | `2026-11-02 02:39:34 UTC` |

| Step | Amount | Block | Mainnet transaction |
| --- | ---: | ---: | --- |
| Approve | `0.15 USDC` | `29087920` | [`0x934884...8d23`](https://explorer.arc.io/tx/0x9348849251bb49ef1e2977d86e19032d8a965f04fdceee8eeb6ce509b9478d23) |
| Reserve (`createHold`) | `0.15 USDC` | `29087951` | [`0xc412d4...29db`](https://explorer.arc.io/tx/0xc412d4205a97ada53553f2ebedc98f8f5742e0227f5b00de397228550d1929db) |
| Capture | `0.05 USDC` | `29088001` | [`0xa8f609...eda8`](https://explorer.arc.io/tx/0xa8f6098d9b70ef8025aead8538826b90c3df5a9a11dec878cc525bd87d0beda8) |
| Refund | `0.10 USDC` | `29088262` | [`0x623bfd...8e13`](https://explorer.arc.io/tx/0x623bfde3a1455dd69506bf9dbefa3ae15b0c2255ea6e5b50108171496f958e13) |

All four transactions are successful. The reserve emitted `HoldCreated` for hold ID `2`; the recipient captured `0.05 USDC`; and after expiry the payer called `refundExpired(2)` to recover the remaining `0.10 USDC`.
