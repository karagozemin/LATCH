# scripts

Helper scripts used by the Arc Studio environment this project was built in. You do not need any of them to build, test or deploy LATCH yourself. Use Foundry for the contract (see the [deployment guide](../docs/guides/DEPLOYMENT.md)) and `bun run` for the frontend.

| File | Purpose |
| --- | --- |
| `check.sh` | Runs `bun run lint` and `bun run typecheck` back to back. Called by `bun run check`. |
| `fetch-abi.ts` | Resolves a deployed contract's ABI from the Arc Blockscout explorer. |
| `self-deploy.ts` | Deploys a contract to a testnet through Circle developer-controlled wallets. |
| `compass-deploy.ts`, `compass-deploy-helpers.ts` | Arc Studio deployment helper. It imports `@circlefin/compass-*` packages that exist only inside Arc Studio, which is why `scripts/` is not part of the repository's TypeScript project or type-aware lint (`tsconfig.json`, `lint` in `package.json`). |

Keep `scripts/check.sh` and the `package.json` script names: Arc Studio calls them.
