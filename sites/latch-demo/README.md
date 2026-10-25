<p align="center">
  <img src="./public/assets/latch1.png" alt="LATCH" width="160">
</p>

# LATCH frontend

A black and violet landing page with the original LATCH artwork, a short app-entry
transition, and three interactive payment-reservation experiences.

## Run locally

From the repository root:

```sh
npm ci --prefix sites/latch-demo
npm run dev
```

Open http://127.0.0.1:4173. TypeScript rebuilds in memory when edited; refresh the
browser to see changes. HTML and CSS are served directly from `src/`. Development
does not overwrite the committed production bundle.

```sh
npm run build:site
npm test --prefix sites/latch-demo
npm run lint --prefix sites/latch-demo
npm run rehearse:experience
npm run rehearse:replay
```

The browser rehearsals use an isolated headless Chrome profile and start their
own static server. Set `CHROME_BIN` when Chrome is installed elsewhere.

## Experiences and evidence

- `/` — landing, payment lifecycle, scenarios, and protocol principles.
- `/#app/hotel` — authorize 150 LUSD, review an 84 LUSD bill, release the remainder.
- `/#app/fuel` — authorize 100 LUSD and settle the amount actually dispensed.
- `/#app/studio` — authorize 200 LUSD before a studio session and settle the bill.
- `/#app/hotel/live` — open the hotel experience with its embedded live Freighter flow.
- `/#app/fuel/live` and `/#app/studio/live` — keep the selected use case visible while
  configuring its merchant, amount, and settlement context on Testnet.
- Existing `?request=…#demo` and `?settlement=…#demo` links open the embedded live
  layer and retain the original payer/merchant verification boundaries.

The guided portion of each experience is explicitly labeled **local simulation**.
It uses illustrative merchants, 500 LUSD demo balances, and integer-cent
accounting. Users can authorize a hold, attempt an overspend, adjust a final bill,
capture, release, or simulate expiry. The live layer beside it is clearly labeled
Stellar Testnet and uses Freighter for signed transactions. Terminal outcomes
cannot settle twice.

The embedded live layer retains the canonical LUSD replay, public transaction
links, Freighter Testnet XLM operations, QR requests, and merchant settlement links.

## Source layout

- `src/index.html`, `src/styles.css`: landing and application layout.
- `src/experience.ts`: navigation, app entry, and scenario interactions.
- `src/experience-model.ts`: scenario data and reservation accounting.
- `src/app.ts`: lightweight entry point; loads the protocol only when requested.
- `src/protocol.ts`: wallet, proof replay, and settlement integration.
- `public/assets`: local photography, fonts, favicon, and font licenses.
- `build.mjs`: copies HTML, CSS, and public assets, then bundles TypeScript as split ES modules.
- `dist/`: production output. Make changes in `src/` and `public/`, then rebuild.

The landing and guided experiences load without the Stellar SDK. Opening live
Testnet inside an experience loads the wallet bundle on demand, with a visible
loading state and reload action if the network fails. The complete static output
is committed, matching the repository’s existing preview convention.

Reduced-motion users see static artwork, skip the entry animation, and get immediate
navigation. The
interface supports narrow screens, keyboard navigation, focus restoration, and
screen-reader announcements for scenario outcomes.

## Assets

Fonts are self-hosted Space Grotesk (bold) and Inter (regular), under the bundled
SIL Open Font Licenses. Photography is sourced from Unsplash:

- Hotel: https://images.unsplash.com/photo-1611892440504-42a792e24d32
- Mobility: https://images.unsplash.com/photo-1503376780353-7e6692767b70
- Studio: https://images.unsplash.com/photo-1497366811353-6870744d04b2

All images are illustrative, not customer or partner endorsements. The original
`latch1.png` is used unchanged in the navigation, hero, app, transition, metadata,
and documentation.
