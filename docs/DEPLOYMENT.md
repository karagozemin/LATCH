# Deploying Latch yourself

Latch has no constructor arguments, owner or admin, so deployment is the same on every network and the deployer has no special rights afterwards.

Arc Studio only deploys to testnet. Deploying to Arc mainnet moves real value and is irreversible. Do it from your own machine and wallet, after your own review, and consider an independent professional audit first.

## 1. Prerequisites

- [Foundry](https://book.getfoundry.sh) and Bun
- A deployer wallet funded with enough USDC on the target network to pay gas (USDC is the native gas token on Arc)
- A Foundry keystore for that wallet. Do not paste a raw private key into a command:

```bash
cast wallet import latch-deployer --interactive
```

## 2. Re-run the checks

```bash
bun install
forge build
forge test
```

All tests must pass before you continue.

## 3. Testnet dry run

```bash
export ARC_TESTNET_RPC_URL=https://rpc.testnet.arc.io

forge script contracts/script/DeployLatch.s.sol:DeployLatch \
  --rpc-url $ARC_TESTNET_RPC_URL --account latch-deployer --broadcast
```

## 4. Mainnet

Check the following yourself before broadcasting:

- Chain ID 5042: `cast chain-id --rpc-url $ARC_MAINNET_RPC_URL`
- The USDC address hardcoded in `contracts/Latch.sol` (`0x3600000000000000000000000000000000000000`) matches the official Arc documentation for mainnet
- Compiler settings in `foundry.toml` (solc 0.8.28, optimizer 200 runs, EVM `cancun`)
- The source is the reviewed commit, with a clean `git status`

```bash
export ARC_MAINNET_RPC_URL=https://rpc.mainnet.arc.io

forge script contracts/script/DeployLatch.s.sol:DeployLatch \
  --rpc-url $ARC_MAINNET_RPC_URL --account latch-deployer --broadcast
```

Confirm the deployment before anything else uses it:

```bash
cast call <LATCH_ADDRESS> "USDC()(address)" --rpc-url $ARC_MAINNET_RPC_URL
cast call <LATCH_ADDRESS> "holdCount()(uint256)" --rpc-url $ARC_MAINNET_RPC_URL
cast code <LATCH_ADDRESS> --rpc-url $ARC_MAINNET_RPC_URL
```

## 5. Verify the source on the explorer

Submit `contracts/Latch.sol` (or the output of `forge flatten contracts/Latch.sol`) on the Arc explorer with solc 0.8.28, optimizer on with 200 runs, EVM `cancun`, and no constructor arguments. Follow the explorer's current verification instructions.

## 6. Point the frontend at it

Set `VITE_LATCH_ADDRESS` in `.env`. The app is currently configured for Arc Testnet only (`src/lib/latch.ts`). To serve mainnet, set the chain constant there to the Arc mainnet chain and add that chain to `src/config.ts`, then test the app against your testnet deployment first.

## 7. Record it

Add the address, deployment transaction, commit hash and date to `docs/DEPLOYMENTS.md`.
