# Clean-clone rehearsal

**Date:** 20 October 2026  
**Commit:** `544e06970d25c25eca8d0f123378a047e0a352a7`  
**Source:** fresh depth-1 clone from `https://github.com/karagozemin/Latch`

The clone had no repository-local build cache or installed dependencies. The
following gates completed successfully:

- root `npm ci` and zero high-severity audit findings;
- Rust formatting and 15/15 production contract tests;
- all five protocol spike crates, 14/14 tests total;
- optimized WASM build: 15,156 bytes, hash
  `d80feb4ff5eb56d62d8b8fca3fa04d7f404d453298fded9ef2cd2298df3a590d`;
- generated TypeScript ABI matched the committed client;
- client build and vendored client/config drift checks;
- isolated site `npm ci`, Biome lint, 12/12 frontend tests, typecheck, and bundle;
- rebuilt `dist/app.js` matched the committed production bundle.

The temporary clone and its 2.5 GiB Rust build cache were removed after the
successful run.
