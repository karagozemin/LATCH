import { cp, mkdir, copyFile, rm } from "node:fs/promises";
import { build } from "esbuild";
await mkdir("dist", { recursive: true });
await rm("dist/chunks", { recursive: true, force: true });
await Promise.all([
  copyFile("src/index.html", "dist/index.html"),
  copyFile("src/styles.css", "dist/styles.css"),
  cp("public", "dist", { recursive: true }),
]);
await build({
  entryPoints: ["src/app.ts"],
  bundle: true,
  minify: true,
  format: "esm",
  splitting: true,
  chunkNames: "chunks/[name]-[hash]",
  platform: "browser",
  target: "es2022",
  outdir: "dist",
});
console.log("LATCH built → dist/");
