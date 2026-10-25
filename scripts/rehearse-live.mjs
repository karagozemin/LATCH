import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { extname, join, normalize } from "node:path";

const chrome =
  process.env.CHROME_BIN ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const dist = normalize(join(process.cwd(), "sites/latch-demo/dist"));
const profile = mkdtempSync(join(tmpdir(), "latch-live-rehearsal-"));
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
    `http://127.0.0.1:${address.port}/#proof`,
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
  const runtimeExceptions = [];
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.method === "Runtime.exceptionThrown") {
      runtimeExceptions.push(
        message.params?.exceptionDetails?.exception?.description ??
          message.params?.exceptionDetails?.text ??
          "Unknown browser exception",
      );
      return;
    }
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
  await call("Page.enable");
  await call("Page.reload", { ignoreCache: true });
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const readiness = await call("Runtime.evaluate", {
      returnByValue: true,
      expression:
        'document.readyState === "complete" && document.documentElement.dataset.protocolReady === "true" && Boolean(document.querySelector("#live-kicker"))',
    });
    if (readiness.result?.value) break;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  if (runtimeExceptions.length > 0) {
    throw new Error(`Browser initialization failed: ${runtimeExceptions.join("\n")}`);
  }
  const result = await call("Runtime.evaluate", {
    returnByValue: true,
    expression: `({
      liveOnly: !document.querySelector("#replay-mode") && !document.querySelector("#run-button"),
      walletRequired: document.querySelector("#payer-balance").textContent === "—",
      liveVisible: !document.querySelector("#live-session").hidden
    })`,
  });
  if (!result.result.value.liveOnly || !result.result.value.walletRequired || !result.result.value.liveVisible)
    throw new Error("Legacy proof route did not open the real wallet flow");

  runtimeExceptions.length = 0;
  const requestPayload = Buffer.from(
    JSON.stringify({
      version: 1,
      network: "testnet",
      asset: "XLM",
      merchant: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
      merchantName: "Meridian Hotel",
      amount: "30.00",
      expiresInLedgers: 5_000,
      reference: "H-0001 · Meridian stay",
    }),
  ).toString("base64url");
  await call("Page.navigate", {
    url: `http://127.0.0.1:${address.port}/?request=${requestPayload}#demo`,
  });
  let requestHandoff;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    requestHandoff = await call("Runtime.evaluate", {
      returnByValue: true,
      expression: `({
        kicker: document.querySelector("#live-kicker")?.textContent?.trim(),
        title: document.querySelector("#inbox-title")?.textContent?.trim(),
        wallet: document.querySelector("#wallet-button")?.textContent?.trim(),
        approveDisabled: document.querySelector("#approve-request")?.disabled,
      })`,
    });
    if (requestHandoff.result?.value?.title === "Meridian Hotel · 30.00 XLM") break;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  if (runtimeExceptions.length > 0) {
    throw new Error(`Request handoff failed: ${runtimeExceptions.join("\n")}`);
  }
  const expectedRequestHandoff = {
    kicker: "Payer · incoming merchant request",
    title: "Meridian Hotel · 30.00 XLM",
    wallet: "Connect Freighter",
    approveDisabled: false,
  };
  if (JSON.stringify(requestHandoff?.result?.value) !== JSON.stringify(expectedRequestHandoff)) {
    throw new Error(`Request handoff diverged: ${JSON.stringify(requestHandoff?.result?.value)}`);
  }

  runtimeExceptions.length = 0;
  const settlementPayload = Buffer.from(
    JSON.stringify({
      version: 1,
      network: "testnet",
      asset: "XLM",
      contractId: "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAK3IM",
      holdId: "1",
      merchant: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
      merchantName: "Meridian Hotel",
      amount: "30.00",
      expiresAt: 5_301_753,
      reference: "H-0001 · Meridian stay",
      requestId: "a".repeat(64),
    }),
  ).toString("base64url");
  await call("Page.navigate", {
    url: `http://127.0.0.1:${address.port}/?settlement=${settlementPayload}#demo`,
  });
  let handoff;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    handoff = await call("Runtime.evaluate", {
      returnByValue: true,
      expression: `({
        title: document.querySelector("#live-title")?.textContent?.trim(),
        wallet: document.querySelector("#wallet-button")?.textContent?.trim(),
        contract: document.querySelector("#contract-address")?.textContent?.trim(),
        verifyDisabled: document.querySelector("#verify-button")?.disabled,
        captureDisabled: document.querySelector("#capture-button")?.disabled,
        diagnostic: document.querySelector("#console-copy")?.textContent?.trim(),
        toast: document.querySelector("#toast")?.textContent?.trim(),
      })`,
    });
    if (handoff.result?.value?.title === "Settlement for hold #1") break;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  if (runtimeExceptions.length > 0) {
    throw new Error(`Settlement handoff failed: ${runtimeExceptions.join("\n")}`);
  }
  const expectedHandoff = {
    title: "Settlement for hold #1",
    wallet: "Connect merchant wallet",
    contract: "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAK3IM",
    verifyDisabled: true,
    captureDisabled: true,
    diagnostic: "Connect the bound merchant wallet; LATCH will compare every hold term on-chain before enabling settlement.",
    toast: "",
  };
  if (JSON.stringify(handoff?.result?.value) !== JSON.stringify(expectedHandoff)) {
    throw new Error(`Settlement handoff diverged: ${JSON.stringify(handoff?.result?.value)}`);
  }

  console.log(
    JSON.stringify(
      {
        ...result.result.value,
        requestHandoff: "payer link boot passed",
        settlementHandoff: "merchant-gated link boot passed",
      },
      null,
      2,
    ),
  );
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
