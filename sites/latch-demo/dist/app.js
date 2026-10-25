const proof = {
  deposit: "8b1c3f1464633d060be25f5216d89fefdff572a764e7073093e881f849bc2c5e",
  hold: "e32feceb96ea6d8d5122b51c141bd1e53f0b63e5ea3d34188850195b2b6ecfb9",
  pay: "ed7a2eab8d49b96aaa5f3af7861d753e47382f8d6ff9cb0f0b6da4281859da6e",
  capture: "cee7f80908dd667ccb61353cae29af4c5d40f8436ea07415555e8da3addde9f4",
};

const contractAddress = "CCBM23TEAN2UQRWW6SZS3FSCDBIDHJRPYS2LC2QUY4GSU727Z26EVZSS";
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const els = {
  balance: $("#payer-balance"),
  available: $("#available-value"),
  reserved: $("#reserved-value"),
  availableBar: $("#available-bar"),
  reservedBar: $("#reserved-bar"),
  promiseCard: $("#promise-card"),
  emptyPromise: $("#empty-promise"),
  promiseDetails: $("#promise-details"),
  payerStatus: $("#payer-status"),
  guarantee: $("#guarantee"),
  guaranteeLabel: $("#guarantee-label"),
  guaranteeCopy: $("#guarantee-copy"),
  merchantReceived: $("#merchant-received"),
  holdButton: $("#hold-button"),
  captureButton: $("#capture-button"),
  voidButton: $("#void-button"),
  spendButton: $("#spend-button"),
  runButton: $("#run-button"),
  resetButton: $("#reset-button"),
  consoleIcon: $("#console-icon"),
  consoleTitle: $("#console-title"),
  consoleCopy: $("#console-copy"),
  txLink: $("#tx-link"),
  toast: $("#toast"),
};

let state = "funded";
let running = false;

function money(value) {
  return Number(value).toFixed(2);
}

function setFlow(step) {
  $$(".flow-step").forEach((item, index) => {
    item.classList.toggle("is-done", index < step);
    item.classList.toggle("is-current", index === step);
  });
}

function setConsole({ icon = "✓", blocked = false, title, copy, hash }) {
  els.consoleIcon.textContent = icon;
  els.consoleIcon.classList.toggle("is-blocked", blocked);
  els.consoleTitle.textContent = title;
  els.consoleCopy.textContent = copy;
  if (hash) {
    els.txLink.href = `https://stellar.expert/explorer/testnet/tx/${hash}`;
    els.txLink.hidden = false;
  } else {
    els.txLink.hidden = true;
  }
}

function setBalances(balance, reserved, received = 0) {
  const available = balance - reserved;
  els.balance.textContent = money(balance);
  els.available.textContent = money(available);
  els.reserved.textContent = money(reserved);
  els.merchantReceived.textContent = money(received);
  const total = Math.max(balance, 1);
  els.availableBar.style.width = `${(available / total) * 100}%`;
  els.reservedBar.style.width = `${(reserved / total) * 100}%`;
}

function setPromise(active, status = "None") {
  els.promiseCard.classList.toggle("is-active", active);
  els.emptyPromise.hidden = active;
  els.promiseDetails.hidden = !active;
  els.payerStatus.textContent = status;
}

function setGuarantee(active, label, copy) {
  els.guarantee.classList.toggle("is-guaranteed", active);
  els.guaranteeLabel.textContent = label;
  els.guaranteeCopy.textContent = copy;
}

function render(nextState) {
  state = nextState;
  if (state === "funded") {
    setBalances(50, 0);
    setPromise(false);
    setGuarantee(false, "Ready to request", "Waiting for payer authorization");
    setConsole({ title: "Account funded", copy: "50 LUSD is available. No promises are active.", hash: proof.deposit });
    setFlow(0);
    els.holdButton.disabled = false;
    els.holdButton.textContent = "Request 30 LUSD hold";
    els.captureButton.disabled = true;
    els.voidButton.disabled = true;
    els.spendButton.disabled = true;
  }
  if (state === "held" || state === "blocked") {
    setBalances(50, 30);
    setPromise(true, "Reserved");
    setGuarantee(true, "Guaranteed", "30 LUSD is reserved on-chain");
    setConsole(
      state === "blocked"
        ? { icon: "!", blocked: true, title: "25 LUSD payment blocked", copy: "Only 20 LUSD is available while 30 remains guaranteed.", hash: null }
        : { title: "Capacity guaranteed", copy: "The merchant can trust 30 LUSD without taking custody.", hash: proof.hold },
    );
    setFlow(state === "blocked" ? 2 : 1);
    els.holdButton.disabled = true;
    els.holdButton.textContent = "Hold active";
    els.captureButton.disabled = false;
    els.voidButton.disabled = false;
    els.spendButton.disabled = false;
  }
  if (state === "paid") {
    setBalances(45, 30);
    setPromise(true, "Reserved");
    setGuarantee(true, "Still guaranteed", "Direct payment preserved the hold");
    setConsole({ title: "5 LUSD paid safely", copy: "The payment used available capacity; the 30 LUSD promise stayed intact.", hash: proof.pay });
    setFlow(3);
    els.holdButton.disabled = true;
    els.captureButton.disabled = false;
    els.voidButton.disabled = false;
    els.spendButton.disabled = true;
  }
  if (state === "captured") {
    setBalances(37, 0, 8);
    setPromise(false, "Captured");
    setGuarantee(false, "Settled", "8 LUSD captured · 22 released");
    setConsole({ title: "8 LUSD captured", copy: "The final amount settled and 22 LUSD returned to available capacity.", hash: proof.capture });
    setFlow(4);
    els.holdButton.disabled = true;
    els.holdButton.textContent = "Session complete";
    els.captureButton.disabled = true;
    els.voidButton.disabled = true;
    els.spendButton.disabled = true;
  }
  if (state === "released") {
    setBalances(50, 0);
    setPromise(false, "Released");
    setGuarantee(false, "Released", "No funds were captured");
    setConsole({ title: "Promise released", copy: "The full 30 LUSD is available to the payer again.", hash: null });
    setFlow(4);
    els.holdButton.disabled = true;
    els.holdButton.textContent = "Session complete";
    els.captureButton.disabled = true;
    els.voidButton.disabled = true;
    els.spendButton.disabled = true;
  }
}

function toast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("show");
  window.setTimeout(() => els.toast.classList.remove("show"), 1800);
}

els.holdButton.addEventListener("click", () => render("held"));
els.spendButton.addEventListener("click", () => render("blocked"));
els.captureButton.addEventListener("click", () => render("captured"));
els.voidButton.addEventListener("click", () => render("released"));
els.resetButton.addEventListener("click", () => {
  running = false;
  els.runButton.disabled = false;
  els.runButton.innerHTML = '<span class="run-icon">▶</span> Run 12-second demo';
  render("funded");
});

els.runButton.addEventListener("click", async () => {
  if (running) return;
  running = true;
  els.runButton.disabled = true;
  els.runButton.textContent = "Running proof…";
  render("funded");
  await wait(900);
  if (!running) return;
  render("held");
  await wait(1700);
  if (!running) return;
  render("blocked");
  await wait(1900);
  if (!running) return;
  render("paid");
  await wait(1900);
  if (!running) return;
  render("captured");
  await wait(800);
  running = false;
  els.runButton.disabled = false;
  els.runButton.innerHTML = '<span class="run-icon">↻</span> Replay demo';
});

$("#copy-contract").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(contractAddress);
    toast("Contract address copied");
  } catch {
    toast(contractAddress);
  }
});

render("funded");
