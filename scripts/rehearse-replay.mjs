import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { extname, join, normalize } from "node:path";

const chrome =
  process.env.CHROME_BIN ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const repetitions = Number(process.env.LATCH_REHEARSALS ?? 30);
const dist = normalize(join(process.cwd(), "sites/latch-demo/dist"));
const profile = mkdtempSync(join(tmpdir(), "latch-rehearsal-"));
const debugPort = 9_200 + Math.floor(Math.random() * 400);

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
};

const server = createServer((request, response) => {
  const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
  const relative = pathname === "/" ? "index.html" : pathname.replace(/^\//, "");
  const file = normalize(join(dist, relative));
  if (!file.startsWith(`${dist}/`) || !existsSync(file) || !statSync(file).isFile()) {
    response.writeHead(404).end("Not found");
    return;
  }
  response.setHeader("content-type", contentTypes[extname(file)] ?? "application/octet-stream");
  response.end(readFileSync(file));
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
if (!address || typeof address === "string") throw new Error("Could not start rehearsal server");

const browser = spawn(
  chrome,
  [
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--remote-allow-origins=*",
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${profile}`,
    `http://127.0.0.1:${address.port}/`,
  ],
  { stdio: "ignore" },
);

async function waitForTarget() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const targets = await fetch(`http://127.0.0.1:${debugPort}/json`).then((response) =>
        response.json(),
      );
      const page = targets.find((target) => target.type === "page");
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    } catch {
      // Chrome is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Chrome DevTools target did not become ready");
}

let socket;
try {
  socket = new WebSocket(await waitForTarget());
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });

  let nextId = 1;
  const pending = new Map();
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (!message.id || !pending.has(message.id)) return;
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(message.error.message));
    else resolve(message.result);
  });

  const call = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = nextId;
      nextId += 1;
      pending.set(id, { resolve, reject });
      socket.send(JSON.stringify({ id, method, params }));
    });

  await call("Runtime.enable");
  const result = await call("Runtime.evaluate", {
    awaitPromise: true,
    returnByValue: true,
    expression: `(async () => {
      const originalTimeout = window.setTimeout.bind(window);
      window.setTimeout = (callback, delay, ...args) =>
        originalTimeout(callback, Math.min(Number(delay) || 0, 5), ...args);
      const expected = {
        balance: "37.60",
        available: "37.60",
        reserved: "0.00",
        received: "8.40",
        console: "Promise released",
      };
      for (let run = 1; run <= ${repetitions}; run += 1) {
        document.querySelector("#reset-button").click();
        document.querySelector("#run-button").click();
        await new Promise((resolve) => originalTimeout(resolve, 160));
        const actual = {
          balance: document.querySelector("#payer-balance").textContent,
          available: document.querySelector("#available-value").textContent,
          reserved: document.querySelector("#reserved-value").textContent,
          received: document.querySelector("#merchant-received").textContent,
          console: document.querySelector("#console-title").textContent,
        };
        if (JSON.stringify(actual) !== JSON.stringify(expected)) {
          throw new Error("Replay " + run + " diverged: " + JSON.stringify(actual));
        }
      }
      return { repetitions: ${repetitions}, final: expected };
    })()`,
  });

  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description ?? "Replay rehearsal failed");
  }
  console.log(JSON.stringify(result.result.value, null, 2));
} finally {
  socket?.close();
  browser.kill("SIGTERM");
  if (browser.exitCode === null) {
    await new Promise((resolve) => {
      const timeout = setTimeout(resolve, 2_000);
      browser.once("exit", () => {
        clearTimeout(timeout);
        resolve();
      });
    });
  }
  await new Promise((resolve) => server.close(resolve));
  rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
