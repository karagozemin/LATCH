# Deploying Latch to Arc Mainnet yourself

> **Warning.** Transactions on mainnet involve real funds and, once submitted, are irreversible. This repository was prepared in Arc Studio, which does not deploy to, sign for, fund or transact on mainnet. Review everything below, test on Arc Testnet first, consider an independent professional audit, and run the deployment yourself, from your own machine and wallet. You are responsible for the result.

Latch has no constructor arguments, owner, admin, proxy or upgrade path. The deployer has no special rights after deployment, so you can use a fresh, dedicated wallet.

## 1. Exact settings

| Item | Value |
| --- | --- |
| Network | Arc Mainnet |
| Chain ID | `5042` (hex `0x13B2`) |
| RPC (Circle primary, no API key) | `https://rpc.mainnet.arc.io` |
| Explorer | https://explorer.arc.io |
| USDC (ERC-20 interface) | `0x3600000000000000000000000000000000000000`, **6 decimals** |
| Gas token | USDC (native view uses 18 decimals; it is the same balance as the 6-decimal ERC-20 view) |
| Fee floor | `maxFeePerGas` of at least 20 Gwei (Arc docs) |
| Contract | `contracts/Latch.sol`, `contract Latch`, no constructor arguments |
| Compiler | solc `0.8.28`, `auto_detect_solc = false` |
| EVM target | `cancun` (Arc runs a newer baseline, so Cancun bytecode is valid) |
| Optimizer | enabled, 200 runs |
| Dependencies | OpenZeppelin Contracts `5.6.1` (via `bun install`), forge-std (vendored in `lib/forge-std`) |
| Deploy script | `contracts/script/DeployLatch.s.sol:DeployLatch` |

Sources for the Arc values: https://docs.arc.io/arc/references/rpc-endpoints.md , https://docs.arc.io/arc/references/contract-addresses.md , https://docs.arc.io/arc/references/gas-and-fees.md . Re-check them yourself before broadcasting.

### What the deploy script checks before it broadcasts

`DeployLatch` aborts, before any transaction is created, unless all of these hold:

1. `block.chainid` is `5042` (mainnet) or `5042002` (testnet). Any other chain reverts with `UnsupportedChain`.
2. Code exists at `0x3600000000000000000000000000000000000000`.
3. `decimals()` on that address returns `6`.

After deploying it also asserts that `latch.USDC()` equals the expected address.

### Fingerprints of the reviewed build

- `contracts/Latch.sol` SHA-256: `0b889effdbb2a1fefbb27d845f773465fa93b55b3ff3e37bf01096ac998d2d9f`
- The compiled runtime bytecode of this source (3,175 bytes) is byte-for-byte identical to the contract deployed and tested on Arc Testnet at `0xdb90ccaee5b1c63139de9d01fd93b8c0c3665a3b`.

Check the first one after you clone: `sha256sum contracts/Latch.sol`.

## 2. What has been tested

- 65 Foundry tests pass (unit, revert paths, fuzz, handler-based invariants) with standard Foundry 1.7.1.
- The same 65 tests pass with Arc Foundry `v0.8.0-2` using `arc-forge test --network arc`.
- Slither reported only the intentional timestamp comparisons. Two automated reviews found no material issues. See `SECURITY.md`. This is not a third-party audit.
- Reserve, capture and refund were run with two real wallets on Arc Testnet.
- The deploy script was simulated against Arc Testnet (no broadcast) and a wrong-chain simulation was correctly rejected.

## 3. Export the whole project

From Arc Studio, either:

- **Download Code** in the Code panel (a zip of the whole project, without `node_modules`), or
- push the project to GitHub from the Studio. This repository already tracks `main` on GitHub, so you can simply clone it.

```bash
git clone https://github.com/karagozemin/LATCH.git
cd LATCH
```

`.env`, build output, `broadcast/` and key material are git-ignored and are never part of the export. Do not add them.

## 4. Install the tools

You need Git, [Bun](https://bun.sh) and Foundry.

**Foundry.** Arc recommends Arc Foundry (`arc-forge`, `arc-cast`) for Arc, because it understands Arc-specific runtime behaviour. Standard Foundry also builds the same bytecode. Install Arc Foundry from https://github.com/circlefin/arc-foundry/releases , verify the `.sha256` file that ships next to the archive, then:

```bash
tar -xzf arc-foundry-<version>-<target>.tar.gz
mkdir -p ~/.local/bin
mv forge ~/.local/bin/arc-forge
mv cast  ~/.local/bin/arc-cast
export PATH="$HOME/.local/bin:$PATH"
arc-forge --version
```

The commands below use `forge` and `cast`. Every one of them works the same with `arc-forge` and `arc-cast`.

## 5. Build and test locally

```bash
bun install            # installs OpenZeppelin Contracts into node_modules
forge build
forge test             # 65 tests; the invariant suite takes a couple of minutes
sha256sum contracts/Latch.sol
```

Optional but recommended: `arc-forge test --network arc`.

`forge-std` is vendored in `lib/forge-std`. If you removed it: `forge install foundry-rs/forge-std --no-git`.

## 6. Create a password-protected keystore

Use a dedicated deployer wallet. Do not reuse a wallet that holds other funds.

```bash
cast wallet import latch-mainnet-deployer --interactive
```

`--interactive` prompts for the private key (hidden input, never written to shell history) and then for an encryption password. The encrypted keystore is saved under `~/.foundry/keystores/`. Remember the password: without it the file is useless, and nobody can recover it for you.

Show the deployer address (you will be asked for the password):

```bash
cast wallet address --account latch-mainnet-deployer
export DEPLOYER=0x...   # paste the address printed above
```

A hardware wallet also works: replace `--account latch-mainnet-deployer` with `--ledger` (or `--trezor`) in the commands below.

Never put a private key in `.env`, in a command line (`--private-key`), in this repository, or in a chat.

## 7. Fund the deployer with USDC for gas

Arc pays gas in USDC. Send a small amount of Arc Mainnet USDC to `$DEPLOYER`. A simulation on Arc Testnet estimated about 0.99M gas, which was about 0.045 USDC at a 45 Gwei estimate. Mainnet fees depend on the live base fee (minimum 20 Gwei), so fund with a comfortable margin and check the real estimate in step 9.

## 8. Read-only pre-flight checks

These only read from the network.

```bash
export ARC_MAINNET_RPC_URL=https://rpc.mainnet.arc.io

cast chain-id --rpc-url $ARC_MAINNET_RPC_URL                                   # expect 5042
cast call 0x3600000000000000000000000000000000000000 "decimals()(uint8)" \
  --rpc-url $ARC_MAINNET_RPC_URL                                               # expect 6
cast balance $DEPLOYER --rpc-url $ARC_MAINNET_RPC_URL                          # expect your funding (18-decimal native view)
cast gas-price --rpc-url $ARC_MAINNET_RPC_URL
```

If any value differs from the table in section 1, stop.

## 9. Simulate, then broadcast

Simulation (no `--broadcast`, nothing is sent):

```bash
forge script contracts/script/DeployLatch.s.sol:DeployLatch \
  --rpc-url $ARC_MAINNET_RPC_URL \
  --sender $DEPLOYER
```

You should see `Network: Arc Mainnet`, `Chain ID: 5042`, the USDC address, and a gas estimate. Then deploy:

```bash
forge script contracts/script/DeployLatch.s.sol:DeployLatch \
  --rpc-url $ARC_MAINNET_RPC_URL \
  --account latch-mainnet-deployer \
  --sender $DEPLOYER \
  --broadcast
```

You are prompted for the keystore password. This is the only command that sends a transaction.

If you see `transaction underpriced`, Arc's fee floor is 20 Gwei: add `--with-gas-price 30gwei` and run again. Do not run the broadcast twice without checking the explorer first.

## 10. Record the deployment

The transaction details are written to `broadcast/DeployLatch.s.sol/5042/run-latest.json`.

```bash
export LATCH_TX=0x...   # transactionHash from run-latest.json
cast receipt $LATCH_TX --rpc-url $ARC_MAINNET_RPC_URL
```

From the receipt note `contractAddress` and `blockNumber`. These are the two values the frontend needs.

## 11. Post-deployment checks (read-only)

```bash
export LATCH=0x...      # contractAddress from the receipt

cast call $LATCH "USDC()(address)" --rpc-url $ARC_MAINNET_RPC_URL        # 0x3600000000000000000000000000000000000000
cast call $LATCH "holdCount()(uint256)" --rpc-url $ARC_MAINNET_RPC_URL   # 0

# The deployed runtime code must equal your local build. The two outputs must be identical:
cast code $LATCH --rpc-url $ARC_MAINNET_RPC_URL
jq -r .deployedBytecode.object contracts/out/Latch.sol/Latch.json
```

## 12. Verify the source on the explorer

The Arc docs describe Blockscout verification for the testnet explorer. By analogy, the mainnet command is:

```bash
forge verify-contract $LATCH contracts/Latch.sol:Latch \
  --chain-id 5042 \
  --verifier blockscout \
  --verifier-url https://explorer.arc.io/api/
```

The mainnet verifier URL above is not confirmed in Arc's documentation as of this writing. If the command fails, use the contract verification page on https://explorer.arc.io and submit `contracts/Latch.sol` (or the output of `forge flatten contracts/Latch.sol`) with solc 0.8.28, optimizer on, 200 runs, EVM `cancun`, and no constructor arguments.

## 13. Point the frontend at mainnet

The app targets one network at a time. Edit `.env` (copy `.env.example` first):

```ini
VITE_LATCH_NETWORK=mainnet
VITE_LATCH_ADDRESS_MAINNET=0x...        # contractAddress from step 10
VITE_LATCH_DEPLOY_BLOCK_MAINNET=...     # blockNumber from step 10
```

Then `bun run dev` for a local check, or `bunx vite build` for a production build (output in `dist/`). Vite reads `.env` only at start or build time, so restart or rebuild after changing it.

Safety behaviour built into the app:

- If `VITE_LATCH_NETWORK=mainnet` and the mainnet address is empty, the app shows a configuration message and talks to no contract.
- The app refuses the known Arc Testnet contract address as a mainnet address.
- On mainnet it shows a persistent notice that transactions use real USDC, and the network badge reads "Arc Mainnet".
- Mainnet and testnet values are separate variables, so one can never silently stand in for the other.

To go back to testnet, set `VITE_LATCH_NETWORK=testnet` and fill `VITE_LATCH_ADDRESS_TESTNET` and `VITE_LATCH_DEPLOY_BLOCK_TESTNET` (the Arc Testnet address is listed in `DEPLOYMENTS.md`; its deployment block is `70172256`).

## 14. First live check

Make your first mainnet interaction small: reserve a very small amount for a second wallet you control, capture part, wait for expiry, refund the rest. Only then share the app. Record the contract, deployment transaction, block, commit hash and date in `DEPLOYMENTS.md`.

## If something goes wrong

- Latch cannot be paused, upgraded or rescued by anyone, including you. If you deploy a wrong copy, simply do not use it and deploy again; no funds are at risk until someone reserves USDC in it.
- Set `VITE_LATCH_ADDRESS_MAINNET` only to an address you deployed and verified in steps 10 and 11.
