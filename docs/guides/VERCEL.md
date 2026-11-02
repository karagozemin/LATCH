# Deploying the LATCH frontend on Vercel

[README](../../README.md) · [Deployment guide](DEPLOYMENT.md)

The frontend is a static Vite app. Vercel needs no server and no rewrites: pages use a `?view=` query string, so every URL loads `index.html`.

## 1. Import the project

1. In Vercel choose **Add New, Project** and import `karagozemin/LATCH` (branch `main`).
2. Settings are read from `vercel.json`. They should show as:
   - Framework preset: **Vite**
   - Install command: `bun install`
   - Build command: `bun run build` (runs `vite build`)
   - Output directory: `dist`

## 2. Set the three public environment variables

Under **Project, Settings, Environment Variables** add these for **Production** (and Preview if you want previews to use mainnet):

| Name | Value |
| --- | --- |
| `VITE_LATCH_NETWORK` | `mainnet` |
| `VITE_LATCH_ADDRESS_MAINNET` | `0xd09EAC2f4eF49A5E918bB49884189c37793a7CC2` |
| `VITE_LATCH_DEPLOY_BLOCK_MAINNET` | `29071512` |

These are public values, they end up in the browser bundle by design. Never add a private key, keystore password or API secret as a `VITE_` variable.

The same three values are committed in `.env.production`, so a build is mainnet even if you skip this step. Values set in Vercel take precedence, which is how you would point a Preview deployment at testnet (`VITE_LATCH_NETWORK=testnet` plus `VITE_LATCH_ADDRESS_TESTNET` and `VITE_LATCH_DEPLOY_BLOCK_TESTNET` from `.env.example`).

Variables are read at build time. After changing one, trigger a new deployment (**Deployments, Redeploy**).

## 3. Deploy and check

After the build finishes, open the site and confirm:

- The header badge says **Arc Mainnet** and the warning about real USDC is visible.
- The sidebar contract link opens `explorer.arc.io/address/0xd09E...7CC2`.
- The page is styled (dark dashboard). The build emits `latch.css` next to `index.html`; if the page is unstyled, open `/latch.css` and confirm it returns CSS.
- Connect a wallet on Arc Mainnet (chain ID 5042). On another network the badge turns amber and offers a switch button.

Before announcing the app, make a first small Reserve, Capture and Refund yourself and record the transactions in [DEPLOYMENTS](../reference/DEPLOYMENTS.md).

## Troubleshooting

- **"No contract address configured" or a configuration message:** a `VITE_LATCH_*` variable is missing or invalid. Fix it in Vercel and redeploy.
- **Build fails on install:** make sure Vercel uses Bun (`vercel.json` sets `bun install`).
- **The app shows testnet:** `VITE_LATCH_NETWORK` is set to `testnet` in Vercel's settings, which overrides `.env.production`.
