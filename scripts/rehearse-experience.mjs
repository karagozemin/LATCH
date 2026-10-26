import { spawn } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
} from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { extname, join, normalize } from "node:path";

const chrome =
  process.env.CHROME_BIN ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const dist = normalize(join(process.cwd(), "sites/latch-demo/dist"));
const profile = mkdtempSync(join(tmpdir(), "latch-experience-"));
const debugPort = 9_200 + Math.floor(Math.random() * 400);

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ttf": "font/ttf",
};

const server = createServer((request, response) => {
  const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
  const relative =
    pathname === "/" ? "index.html" : pathname.replace(/^\//, "");
  const file = normalize(join(dist, relative));
  if (
    !file.startsWith(`${dist}/`) ||
    !existsSync(file) ||
    !statSync(file).isFile()
  ) {
    response.writeHead(404).end("Not found");
    return;
  }
  response.setHeader(
    "content-type",
    contentTypes[extname(file)] ?? "application/octet-stream",
  );
  response.end(readFileSync(file));
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
if (!address || typeof address === "string")
  throw new Error("Could not start rehearsal server");

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
      const targets = await fetch(`http://127.0.0.1:${debugPort}/json`).then(
        (response) => response.json(),
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

  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const evaluate = async (expression) => {
    const r = await call("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (r.exceptionDetails)
      throw new Error(
        r.exceptionDetails.exception?.description ?? r.exceptionDetails.text,
      );
    return r.result.value;
  };
  const assert = (value, message) => {
    if (!value) throw new Error(message);
  };
  const click = async (selector) =>
    evaluate(
      `(()=>{ const button=document.querySelector(${JSON.stringify(selector)});if(!button)throw new Error('Missing '+${JSON.stringify(selector)});button.click();})()`,
    );
  const navigate = async (hash) => {
    await call("Page.navigate", {
      url: `http://127.0.0.1:${address.port}/${hash}`,
    });
    for (let i = 0; i < 100; i++) {
      if (
        await evaluate(
          `document.readyState==='complete'&&Boolean(document.querySelector('#experience-balance'))&&(!(location.hash.includes('proof')||location.hash.includes('demo')||location.hash.startsWith('#app'))||document.documentElement.dataset.protocolReady==='true')`,
        )
      )
        return;
      await wait(40);
    }
    throw new Error("Page timed out");
  };
  const balance = () =>
    evaluate(
      `({balance:document.querySelector('#experience-balance').textContent,available:document.querySelector('#experience-available').textContent,reserved:document.querySelector('#experience-reserved').textContent})`,
    );
  await call("Runtime.enable");
  await call("Page.enable");
  await navigate("");
  assert(
    await evaluate(`document.querySelector('#hero-available-value').textContent==='500.00'&&document.querySelector('#hero-reserved-value').textContent==='0.00'&&!document.querySelector('#hero-promise-trigger').hasAttribute('data-wallet-entry')`),
    "Landing preview must be separate from wallet entry",
  );
  await click("#hero-promise-trigger");
  await wait(650);
  assert(
    await evaluate(`location.hash===''&&document.querySelector('#application').hidden&&getComputedStyle(document.querySelector('.receipt-tap-hint')).display==='none'&&document.querySelector('#hero-available-value').textContent==='350.00'&&document.querySelector('#hero-reserved-value').textContent==='150.00'&&document.querySelector('#hero-promise-trigger').getAttribute('aria-pressed')==='true'`),
    "Hero reserve must stay on the landing page",
  );
  await click("#hero-promise-trigger");
  await wait(650);
  assert(
    await evaluate(`location.hash===''&&document.querySelector('#hero-available-value').textContent==='500.00'&&document.querySelector('#hero-reserved-value').textContent==='0.00'&&document.querySelector('#hero-promise-trigger').getAttribute('aria-pressed')==='false'&&getComputedStyle(document.querySelector('.receipt-tap-hint')).display==='none'`),
    "Hero release must restore the preview without navigation",
  );
  assert(
    await evaluate(`!performance.getEntriesByType('resource').some(r=>r.name.includes('/protocol-'))`),
    "Landing preview must not load the wallet bundle",
  );
  const lifecycle = [];
  for (const route of ["#app/hotel", "#app/fuel", "#app/studio", "#app/live", "#proof", "#demo"]) {
    await navigate(route);
    assert(
      await evaluate(`!document.querySelector('#protocol-view').hidden&&!document.querySelector('#live-session').hidden&&document.querySelector('.simulation-tag').textContent.includes('LIVE')&&document.querySelector('#experience-balance').textContent==='—'&&document.querySelector('#payer-balance').textContent==='—'&&!document.querySelector('#replay-mode')&&!document.querySelector('#run-button')&&!document.querySelector('[data-action="expire"]')`),
      "Walletless route survived: " + route,
    );
    await click('[data-action="authorize"]');
    await wait(100);
    assert(
      await evaluate(`document.querySelector('#experience-progress [aria-current="step"] span').textContent==='Make a promise'&&document.querySelector('#experience-balance').textContent==='—'`),
      "Authorization advanced without a wallet: " + route,
    );
    lifecycle.push(route + ": live-only, wallet-gated");
  }
  const responsive = [];
  for (const width of [320, 390, 768, 1024, 1440]) {
    await call("Emulation.setDeviceMetricsOverride", {
      width,
      height: 900,
      deviceScaleFactor: 1,
      mobile: width < 760,
    });
    for (const route of ["", "#app/hotel", "#proof"]) {
      await navigate(route);
      await evaluate(
        `Promise.all([...document.images].map(async image=>{image.loading="eager";await image.decode().catch(()=>{});}))`,
      );
      await wait(80);
      const metrics = await evaluate(
        `({width:innerWidth,scroll:document.documentElement.scrollWidth,broken:[...document.images].filter(i=>i.offsetWidth&&(!i.complete||i.naturalWidth===0)).map(i=>i.src),duplicates:[...document.querySelectorAll('[id]')].map(e=>e.id).filter((id,i,a)=>a.indexOf(id)!==i)})`,
      );
      assert(
        metrics.scroll <= metrics.width,
        `Overflow at ${width} ${route}: ${JSON.stringify(metrics)}`,
      );
      assert(
        metrics.duplicates.length === 0,
        `Duplicate ids ${metrics.duplicates}`,
      );
      assert(metrics.broken.length === 0, `Broken image ${metrics.broken}`);
    }
    responsive.push(`${width}px: landing, live experience and legacy routes fit`);
  }
  await navigate("");
  await click('a[href="#app/hotel/live"]');
  await wait(50);
  assert(
    await evaluate(
      `!document.querySelector('#entry-transition').hidden&&document.querySelector('#main').inert`,
    ),
    "Intro did not start",
  );
  await click("#skip-transition");
  assert(
    await evaluate(
      `document.querySelector('#entry-transition').hidden&&!document.querySelector('#main').inert`,
    ),
    "Intro skip did not restore interactivity",
  );
  await call("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-motion", value: "reduce" }],
  });
  await navigate("");
  await click('a[href="#app/hotel/live"]');
  await wait(40);
  assert(
    await evaluate(
      `document.querySelector('#entry-transition').hidden&&!document.querySelector('#main').inert`,
    ),
    "Reduced-motion route blocked",
  );
  await call("Emulation.setEmulatedMedia", { features: [] });
  await navigate("");
  await click(".hero-actions [data-wallet-entry]");
  await wait(120);
  const walletEntryState = await evaluate(
    `({hash:location.hash,label:document.querySelector('.hero-actions .wallet-entry-label').textContent,connecting:document.querySelector('.hero-actions [data-wallet-entry]').classList.contains('is-connecting')})`,
  );
  assert(
    walletEntryState.label.includes("Opening Freighter") &&
      walletEntryState.connecting,
    `Primary wallet CTA did not request Freighter directly: ${JSON.stringify(walletEntryState)}`,
  );
  await navigate("#app/hotel/live");
  assert(
    await evaluate(
      `document.querySelector('.experience-main').contains(document.querySelector('#protocol-view'))&&!document.querySelector('#experience-view').hidden&&!document.querySelector('#protocol-view').hidden&&document.querySelector('#live-experience-title').textContent.includes('A stay, without the wait.')`,
    ),
    "Live Testnet was not embedded in the selected experience",
  );
  assert(
    await evaluate(
      `document.querySelector('.scene-primary[data-action="authorize"]').textContent.includes('Open Freighter')&&document.querySelector('.simulation-tag').textContent.includes('LIVE')&&document.querySelector('#experience-wallet').textContent.includes('XLM')`,
    ),
    "The main experience controls did not switch from simulation to live actions",
  );
  await click('.scene-primary[data-action="authorize"]');
  await wait(200);
  const failedLiveAction = await evaluate(
    `({step:document.querySelector('#experience-progress [aria-current="step"] span')?.textContent,toast:document.querySelector('#toast').textContent,button:document.querySelector('.scene-primary[data-action="authorize"]')?.textContent,liveTitle:document.querySelector('#live-title').textContent})`,
  );
  assert(
    failedLiveAction.step === "Make a promise" &&
      failedLiveAction.toast.includes("Freighter approval required") &&
      failedLiveAction.button.includes("Confirm in Freighter"),
    `A failed live authorization incorrectly advanced the simulated experience: ${JSON.stringify(failedLiveAction)}`,
  );
  await navigate("#app/fuel/live");
  assert(
    await evaluate(
      `document.querySelector('#experience-title').textContent.includes('Fill up')&&document.querySelector('#live-experience-title').textContent.includes('Fill up')&&document.querySelector('#merchant-name').textContent==='Atlantic Fuel'&&document.querySelector('#request-amount').textContent==='15.00'`,
    ),
    "Fuel scenario did not configure its embedded live flow",
  );
  await navigate("#app/studio/live");
  assert(
    await evaluate(
      `document.querySelector('#experience-title').textContent.includes('Good work')&&document.querySelector('#live-experience-title').textContent.includes('Good work')&&document.querySelector('#merchant-name').textContent==='Forma Studio'&&document.querySelector('#request-amount').textContent==='20.00'`,
    ),
    "Studio scenario did not configure its embedded live flow",
  );
  await call("Network.enable");
  await call("Network.setCacheDisabled", { cacheDisabled: true });
  await call("Network.setBlockedURLs", { urls: ["*protocol-*.js"] });
  await call("Page.navigate", { url: `http://127.0.0.1:${address.port}/?bundle-failure=1#proof` });
  let loadErrorVisible = false;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    loadErrorVisible = await evaluate(`Boolean(document.querySelector('#retry-protocol-load') && !document.querySelector('#retry-protocol-load').hidden)`);
    if (loadErrorVisible) break;
    await wait(50);
  }
  assert(loadErrorVisible, "A failed protocol bundle has no recovery control");
  await call("Network.setBlockedURLs", { urls: [] });
  await navigate("#proof");

  assert(
    runtimeExceptions.length === 0,
    `Runtime errors: ${runtimeExceptions.join("\n")}`,
  );
  const result = {
    lifecycle,
    responsive,
    intro: "skip and reduced motion passed",
    replayRemoval: "legacy routes are live-only; no replay controls",
    runtimeErrors: runtimeExceptions.length,
    lazyLoading: "landing stays light; protocol failure offers reload; recovery passed",
    heroInteraction: "local reserve/release stays on landing; wallet bundle not loaded",
    walletEntry:
      "primary CTA embeds live mode, requests Freighter, and preserves scenario context",
  };

  console.log(JSON.stringify(result, null, 2));
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
  rmSync(profile, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 100,
  });
}
