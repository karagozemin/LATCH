# LATCH

**Programmable USDC payment authorizations on Arc. Reserve funds, let the recipient capture what they need, and return the rest.**

![License: MIT](https://img.shields.io/badge/license-MIT-blue)
![Solidity 0.8.28](https://img.shields.io/badge/solidity-0.8.28-363636)
![Network: Arc](https://img.shields.io/badge/network-Arc-3FE0C0)

[Architecture](docs/ARCHITECTURE.md) · [Deployments](docs/reference/DEPLOYMENTS.md) · [Security](docs/reference/SECURITY.md) · [Demo](docs/guides/DEMO.md) · [Deploy it yourself](docs/guides/DEPLOYMENT.md)

## What is LATCH?

Paying a vendor, a driver or a service usually means either paying up front or trusting them to bill you later. LATCH adds a middle path, similar to a card pre-authorization: the payer locks USDC for a named recipient with a deadline, the recipient can take any part of it before the deadline, and whatever is left goes back to the payer afterwards.

It is a single immutable smart contract. There is no admin key, no upgrade path and no fee, and the contract only ever sends funds to the payer or the recipient of a hold.

## How it works

| Step | Who | What happens |
| --- | --- | --- |
| **Reserve** | Payer | Approves USDC, then calls `createHold(recipient, amount, expiry)`. The USDC moves into the contract. |
| **Capture** | Recipient | Calls `capture(holdId, amount)` any number of times, strictly before expiry, up to the remaining balance. |
| **Refund** | Payer | After expiry, calls `refundExpired(holdId)` to take back everything that was not captured. |

Example: reserve 0.02 USDC for a recipient, who captures 0.01 USDC before the deadline. After expiry the payer refunds the remaining 0.01 USDC.

## Architecture

A static React + Vite app talks to the Latch contract through the user's wallet and a public Arc RPC endpoint. There is no backend, database or indexer: holds and history are read directly from the chain.

See **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** for the system diagram, the authorization lifecycle, the contract's state machine and the design decisions.

## Deployments

| Network | Chain ID | Contract | Explorer |
| --- | --- | --- | --- |
| Arc Mainnet | 5042 | `0xd09EAC2f4eF49A5E918bB49884189c37793a7CC2` | [explorer.arc.io](https://explorer.arc.io/address/0xd09EAC2f4eF49A5E918bB49884189c37793a7CC2) |
| Arc Testnet | 5042002 | `0xdb90ccaee5b1c63139de9d01fd93b8c0c3665a3b` | [explorer.testnet.arc.io](https://explorer.testnet.arc.io/address/0xdb90ccaee5b1c63139de9d01fd93b8c0c3665a3b) |

USDC on both networks is `0x3600000000000000000000000000000000000000` (6 decimals, ERC-20 interface).

The mainnet deployment was made independently with Foundry (transaction [`0xea07…cec6`](https://explorer.arc.io/tx/0xea0747048d177ce7b48830dbcb61b045b1fe63715e3098660bc565d36349cec6), block `29071512`). **Still pending:** explorer source verification and a recorded mainnet Reserve, Capture and Refund round trip. The testnet deployment has been exercised end to end with two wallets. Full details are in [DEPLOYMENTS](docs/reference/DEPLOYMENTS.md).

Mainnet moves real USDC and transactions cannot be reversed. The app shows an "Arc Mainnet" badge and a real-USDC warning whenever it targets mainnet.

## Getting started

Prerequisites: [Bun](https://bun.sh), [Foundry](https://book.getfoundry.sh) and Git.

```bash
git clone https://github.com/karagozemin/LATCH.git
cd LATCH
bun install
cp .env.example .env     # then set VITE_LATCH_NETWORK=testnet to avoid real USDC
bun run dev              # http://localhost:5173
```

Configuration is public environment variables only (see [`.env.example`](.env.example)). Production builds read the mainnet values from the committed [`.env.production`](.env.production).

| Variable | Purpose |
| --- | --- |
| `VITE_LATCH_NETWORK` | `mainnet` or `testnet` |
| `VITE_LATCH_ADDRESS_MAINNET`, `VITE_LATCH_DEPLOY_BLOCK_MAINNET` | Contract and deployment block on Arc Mainnet |
| `VITE_LATCH_ADDRESS_TESTNET`, `VITE_LATCH_DEPLOY_BLOCK_TESTNET` | Contract and deployment block on Arc Testnet |

## Testing

```bash
forge test        # 65 unit, revert, fuzz and invariant tests (the invariant suite takes a few minutes)
bun run check     # lint and typecheck
bun run build     # production build into dist/ (includes dist/latch.css)
```

The Foundry suite also passes under Arc Foundry with `arc-forge test --network arc`.

## Project structure

```text
LATCH/
├── contracts/
│   ├── Latch.sol            # the contract
│   ├── script/              # Foundry deploy script
│   └── test/                # unit, revert, fuzz and invariant tests
├── src/                     # React + Vite dashboard
│   ├── components/          # dashboard UI
│   ├── hooks/               # contract reads, event scan, transactions
│   └── lib/                 # ABI, network selection, formatting
├── config/                  # Tailwind config and the stylesheet build plugin
├── docs/
│   ├── ARCHITECTURE.md
│   ├── guides/              # DEMO, DEPLOYMENT, VERCEL
│   └── reference/           # DEPLOYMENTS, SECURITY
├── scripts/                 # helper scripts, see scripts/README.md
├── lib/                     # Foundry dependencies (forge-std)
├── foundry.toml             # compiler settings and remappings
├── vite.config.ts, index.html, package.json, tsconfig.json
└── vercel.json
```

The Vite app stays at the repository root rather than in a subfolder because Arc Studio's preview, lint
and typecheck run from the root and Vercel builds from it with no root-directory setting.

## Documentation

| Document | Contents |
| --- | --- |
| [Architecture](docs/ARCHITECTURE.md) | Components, lifecycle, contract rules, data flow |
| [Demo](docs/guides/DEMO.md) | Reserve, capture, expire and refund walkthrough |
| [Deployment guide](docs/guides/DEPLOYMENT.md) | Deploy the contract yourself with Foundry and a keystore |
| [Vercel guide](docs/guides/VERCEL.md) | Host the frontend |
| [Deployments](docs/reference/DEPLOYMENTS.md) | Addresses, transactions, blocks, pending items |
| [Security](docs/reference/SECURITY.md) | Design, review done, known limits |

## Security and license

LATCH has not had a third-party audit. It has been checked with static analysis, automated reviews and the test suite described above, which is not a substitute for a professional audit. Read [SECURITY](docs/reference/SECURITY.md) for the known limits (notably, USDC is centrally issued and can block addresses) and start with small amounts.

Released under the [MIT License](LICENSE).

---

Built with [Arc Studio](https://studio.arc.io)
