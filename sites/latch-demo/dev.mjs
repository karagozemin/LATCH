import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, relative, resolve, sep } from "node:path";
import { context } from "esbuild";

const root = resolve(".");
let bundles = new Map();
const bundler = await context({
  entryPoints: ["src/app.ts"],
  bundle: true,
  format: "esm",
  splitting: true,
  chunkNames: "chunks/[name]-[hash]",
  platform: "browser",
  target: "es2022",
  outdir: "memory",
  write: false,
  plugins: [
    {
      name: "serve-bundle-from-memory",
      setup(build) {
        build.onEnd((result) => {
          if (!result.errors.length) {
            bundles = new Map(
              result.outputFiles.map((file) => [
                "/" +
                  relative(resolve(root, "memory"), file.path).replaceAll(
                    "\\",
                    "/",
                  ),
                file.contents,
              ]),
            );
          }
        });
      },
    },
  ],
});
await bundler.rebuild();
await bundler.watch();
const types = {
  ".html": "text/html",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".ttf": "font/ttf",
};
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    const path = decodeURIComponent(url.pathname);
    res.setHeader("cache-control", "no-store");
    if (bundles.has(path)) {
      res.setHeader("content-type", "text/javascript");
      res.end(bundles.get(path));
      return;
    }
    const target =
      path === "/" || path === "/index.html"
        ? "src/index.html"
        : path === "/styles.css"
          ? "src/styles.css"
          : `public${path}`;
    const file = resolve(root, target);
    const allowed =
      file === resolve(root, "src/index.html") ||
      file === resolve(root, "src/styles.css") ||
      file.startsWith(resolve(root, "public") + sep);
    if (!allowed || !(await stat(file)).isFile()) {
      res.writeHead(404).end("Not found");
      return;
    }
    res.setHeader(
      "content-type",
      types[extname(file)] ?? "application/octet-stream",
    );
    res.end(await readFile(file));
  } catch {
    res.writeHead(404).end("Not found");
  }
});
server.listen(Number(process.env.PORT ?? 4173), "127.0.0.1", () =>
  console.log(`LATCH → http://127.0.0.1:${server.address().port}`),
);
const shutdown = async () => {
  server.close();
  await bundler.dispose();
  process.exit(0);
};
server.on("error", async (error) => {
  console.error(error.message);
  await bundler.dispose();
  process.exit(1);
});
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
