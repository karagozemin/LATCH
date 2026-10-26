<p align="center">
  <img src="./public/assets/latch1.png" alt="LATCH" width="160">
</p>

# LATCH frontend

A black and violet landing page with the original LATCH artwork, a short app-entry
transition, and three interactive payment-reservation experiences.

## Development

From the repository root:

```sh
npm ci --prefix sites/latch-demo
npm run dev
```

The deployed frontend is available at <https://latch-ui.vercel.app>. During local
development, TypeScript rebuilds in memory when edited; refresh the development
tab to see changes. HTML and CSS are served directly from `src/`. Development does
not overwrite the committed production bundle.

```sh
npm run build:site
npm test --prefix sites/latch-demo
npm run lint --prefix sites/latch-demo
npm run rehearse:experience
npm run rehearse:live
```

The browser rehearsals use an isolated headless Chrome profile and start their
own static server. Set `CHROME_BIN` when Chrome is installed elsewhere.

## Experiences and evidence

- `/` — landing, payment lifecycle, scenarios, and protocol principles.
- `/#app/hotel` — live Testnet hotel flow with a 30 XLM maximum reservation.
- `/#app/fuel` — live Testnet fuel flow with a 15 XLM maximum reservation.
- `/#app/studio` — live Testnet studio flow with a 20 XLM maximum reservation.
- `/#app/hotel/live` — open the hotel experience with its embedded live Freighter flow.
- `/#app/fuel/live` and `/#app/studio/live` — keep the selected use case visible while
  configuring its merchant, amount, and settlement context on Testnet.
- Existing `?request=…#demo` and `?settlement=…#demo` links open the embedded live
  layer and retain the original payer/merchant verification boundaries.

All demo routes now use **live Stellar Testnet** and require Freighter for signed
transactions. Inside the app there is no walletless simulator, simulated expiry
action, or replay mode. The landing card remains a clearly labeled, local
reserve/release preview: it never opens Freighter or navigates into the app.
Legacy `#proof` and `#demo` routes open the live flow as well.

Merchants and scenarios remain illustrative, but hold creation, capture, and
release submit real Testnet XLM transactions. The overspend check is a real RPC
simulation: rejection submits no transaction. QR requests, merchant settlement
links, and historical public transaction evidence remain available.

The browser rehearsals check wallet gating, routing, handoff screens, responsive
layout, and loading recovery; they do not sign or submit transactions. Complete
a separate Freighter Testnet check with payer and merchant profiles before a live
presentation. Model tests retain historical accounting fixtures as unit tests,
not as an interactive walletless frontend.

## Source layout

- `src/index.html`, `src/styles.css`: landing and application layout.
- `src/experience.ts`: navigation, app entry, and scenario interactions.
- `src/experience-model.ts`: scenario data and reservation accounting.
- `src/app.ts`: lightweight entry point; loads the protocol only when requested.
- `src/protocol.ts`: wallet, on-chain evidence, and settlement integration.
- `public/assets`: local photography, fonts, favicon, and font licenses.
- `build.mjs`: copies HTML, CSS, and public assets, then bundles TypeScript as split ES modules.
- `dist/`: production output. Make changes in `src/` and `public/`, then rebuild.

The landing loads without the Stellar SDK. Opening any demo experience
loads the wallet bundle on demand, with a visible
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
