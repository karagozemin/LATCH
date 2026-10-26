# Clean-clone reproduction checklist

Run this checklist from a fresh clone of
`https://github.com/karagozemin/Latch` with no repository-local build cache or
installed dependencies:

- root `npm ci` and zero high-severity audit findings;
- Rust formatting and 15/15 production contract tests;
- all five protocol spike crates, 14/14 tests total;
- optimized WASM build: 15,156 bytes, hash
  `d80feb4ff5eb56d62d8b8fca3fa04d7f404d453298fded9ef2cd2298df3a590d`;
- generated TypeScript ABI matched the committed client;
- client build and vendored client/config drift checks;
- isolated site `npm ci`, Biome lint, 28/28 frontend tests, typecheck, and bundle;
- rebuilt `dist/app.js` matched the committed production bundle.
