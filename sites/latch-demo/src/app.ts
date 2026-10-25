import { Buffer } from "buffer";
import {
  getNetwork,
  isConnected,
  requestAccess,
  signMessage,
  signTransaction,
} from "@stellar/freighter-api";
import {
  Asset,
  Networks,
  SorobanDataBuilder,
  StrKey,
  TransactionBuilder,
  authorizeEntry,
  contract,
  rpc,
  xdr,
} from "@stellar/stellar-sdk";

const proof = {
  deposit: "da805dc64f9c3aca3b936f6a7f603efd68e32dc8f80466f7be3e02695dccdb53",
  hold: "00c4f1b17485961fd39a736d675431b0fc5c3401bbbc4f95e159174916b8ce7b",
  pay: "afb7b736f7d96c8b916e32169001178c7e8c6fd76e302fc45531cee4097ec921",
  capture: "fee70c5d51af5ce9ec4e2907bf95c5266d2ef5117e7c5c6f929c7e1fc807cb9a",
};

const PROOF_CONTRACT = "CANMN7PU2HNWVZHOVN7EHO7EGKZFIJXHKHKO2XEFLKFCIJDAP7MPBAXR";
const WASM_HASH = "36091aa64aaaa74b4a2cd1d91487ce1f9e3c445c0ca549993726c0a6e2f1e7a6";
const RPC_URL = "https://soroban-testnet.stellar.org";
const FRIENDBOT_URL = "https://friendbot.stellar.org/";
const NETWORK_PASSPHRASE = Networks.TESTNET;
const SCALE = 10_000_000n;
const STORAGE_PREFIX = "latch-live-v2:";
const rpcServer = new rpc.Server(RPC_URL);

type DemoState = "funded" | "held" | "blocked" | "paid" | "captured" | "released";
type DemoMode = "replay" | "live";
type DynamicLatch = contract.Client & Record<string, (...args: any[]) => Promise<any>>;

interface LiveSession {
  contractId: string;
  holdId?: string;
  phase: DemoState;
  lastHash?: string;
}

const $ = <T extends Element = HTMLElement>(selector: string): T => {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing element: ${selector}`);
  return element;
};
const $$ = (selector: string) => [...document.querySelectorAll<HTMLElement>(selector)];
const wait = (milliseconds: number) => new Promise((resolve) => window.setTimeout(resolve, milliseconds));

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
  holdButton: $("#hold-button") as HTMLButtonElement,
  captureButton: $("#capture-button") as HTMLButtonElement,
  voidButton: $("#void-button") as HTMLButtonElement,
  spendButton: $("#spend-button") as HTMLButtonElement,
  runButton: $("#run-button") as HTMLButtonElement,
  resetButton: $("#reset-button") as HTMLButtonElement,
  consoleIcon: $("#console-icon"),
  consoleTitle: $("#console-title"),
  consoleCopy: $("#console-copy"),
  txLink: $("#tx-link") as HTMLAnchorElement,
  toast: $("#toast"),
  replayMode: $("#replay-mode") as HTMLButtonElement,
  liveMode: $("#live-mode") as HTMLButtonElement,
  liveSession: $("#live-session") as HTMLElement,
  liveTitle: $("#live-title"),
  liveCopy: $("#live-copy"),
  walletButton: $("#wallet-button") as HTMLButtonElement,
  modeLabel: $("#mode-label"),
  payerAddress: $("#payer-address"),
  merchantAddress: $("#merchant-address"),
  contractLabel: $("#contract-label"),
  contractAddress: $("#contract-address"),
};

let mode: DemoMode = "replay";
let state: DemoState = "funded";
let running = false;
let busy = false;
let walletAddress = "";
let liveClient: DynamicLatch | null = null;
let liveSession: LiveSession | null = null;
let currentContractAddress = PROOF_CONTRACT;

function money(value: number) {
  return Number(value).toFixed(2);
}

function units(value: bigint) {
  return Number(value) / Number(SCALE);
}

function shortAddress(address: string) {
  return address.length > 12 ? `${address.slice(0, 5)}…${address.slice(-4)}` : address;
}

function errorMessage(error: unknown) {
  if (error instanceof Error) {
    if (/failed to fetch|network error/i.test(error.message)) {
      return "Stellar Testnet RPC could not be reached. Check the connection and retry.";
    }
    return error.message;
  }
  if (typeof error === "string") return error;
  return "Unexpected wallet or network error";
}

function unwrapResult<T>(value: any): T {
  if (value && typeof value.isErr === "function" && value.isErr()) {
    const contractError = value.unwrapErr?.();
    throw new Error(contractError?.message ?? String(contractError ?? "Contract rejected the request"));
  }
  return value && typeof value.unwrap === "function" ? value.unwrap() : value;
}

function txHash(sent: any) {
  return sent?.sendTransactionResponse?.hash ?? sent?.getTransactionResponse?.txHash ?? "";
}

function assertSuccessful(sent: any, label: string) {
  const status = sent?.getTransactionResponse?.status;
  if (status !== "SUCCESS") {
    throw new Error(`${label} failed on Stellar Testnet${status ? ` (${status})` : ""}`);
  }
  return sent;
}

function setFlow(step: number) {
  $$(".flow-step").forEach((item, index) => {
    item.classList.toggle("is-done", index < step);
    item.classList.toggle("is-current", index === step);
  });
}

function setConsole({
  icon = "✓",
  blocked = false,
  title,
  copy,
  hash,
}: {
  icon?: string;
  blocked?: boolean;
  title: string;
  copy: string;
  hash?: string | null;
}) {
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

function setBalances(balance: number, reserved: number, received = 0) {
  const available = Math.max(balance - reserved, 0);
  els.balance.textContent = money(balance);
  els.available.textContent = money(available);
  els.reserved.textContent = money(reserved);
  els.merchantReceived.textContent = money(received);
  const total = Math.max(balance, 1);
  els.availableBar.style.width = `${(available / total) * 100}%`;
  els.reservedBar.style.width = `${(reserved / total) * 100}%`;
}

function setPromise(active: boolean, status = "None") {
  els.promiseCard.classList.toggle("is-active", active);
  (els.emptyPromise as HTMLElement).hidden = active;
  (els.promiseDetails as HTMLElement).hidden = !active;
  els.payerStatus.textContent = status;
}

function setGuarantee(active: boolean, label: string, copy: string) {
  els.guarantee.classList.toggle("is-guaranteed", active);
  els.guaranteeLabel.textContent = label;
  els.guaranteeCopy.textContent = copy;
}

function render(nextState: DemoState, hash?: string | null) {
  state = nextState;
  if (state === "funded") {
    setBalances(50, 0);
    setPromise(false);
    setGuarantee(false, "Ready to request", "Waiting for payer authorization");
    setConsole({
      title: mode === "live" ? "Live account funded" : "Account funded",
      copy: mode === "live" ? "50 XLM is now controlled by this LATCH account." : "50 LUSD is available. No promises are active.",
      hash: hash ?? (mode === "replay" ? proof.deposit : null),
    });
    setFlow(0);
    els.holdButton.disabled = mode === "live" && !liveClient;
    els.holdButton.textContent = `Request 30 ${mode === "live" ? "XLM" : "LUSD"} hold`;
    els.captureButton.disabled = true;
    els.voidButton.disabled = true;
    els.spendButton.disabled = true;
  }
  if (state === "held" || state === "blocked") {
    setBalances(50, 30);
    setPromise(true, "Reserved");
    setGuarantee(true, "Guaranteed", `30 ${mode === "live" ? "XLM" : "LUSD"} is reserved on-chain`);
    setConsole(
      state === "blocked"
        ? {
            icon: "!",
            blocked: true,
            title: `25 ${mode === "live" ? "XLM" : "LUSD"} payment blocked`,
            copy: `Only 20 ${mode === "live" ? "XLM" : "LUSD"} is available while 30 remains guaranteed.`,
          }
        : {
            title: "Capacity guaranteed",
            copy: `The merchant can trust 30 ${mode === "live" ? "XLM" : "LUSD"} without taking custody.`,
            hash: hash ?? (mode === "replay" ? proof.hold : null),
          },
    );
    setFlow(state === "blocked" ? 2 : 1);
    els.holdButton.disabled = true;
    els.holdButton.textContent = "Hold active";
    els.captureButton.disabled = false;
    els.voidButton.disabled = false;
    els.spendButton.disabled = false;
    els.spendButton.textContent = state === "blocked" && mode === "live" ? "Pay 5 XLM safely" : `Try to spend 25 ${mode === "live" ? "XLM" : "LUSD"}`;
  }
  if (state === "paid") {
    setBalances(45, 30);
    setPromise(true, "Reserved");
    setGuarantee(true, "Still guaranteed", "Direct payment preserved the hold");
    setConsole({
      title: `5 ${mode === "live" ? "XLM" : "LUSD"} paid safely`,
      copy: `The payment used available capacity; the 30 ${mode === "live" ? "XLM" : "LUSD"} promise stayed intact.`,
      hash: hash ?? (mode === "replay" ? proof.pay : null),
    });
    setFlow(3);
    els.holdButton.disabled = true;
    els.captureButton.disabled = false;
    els.voidButton.disabled = false;
    els.spendButton.disabled = true;
  }
  if (state === "captured") {
    setBalances(37, 0, 8);
    setPromise(false, "Captured");
    setGuarantee(false, "Settled", `8 ${mode === "live" ? "XLM" : "LUSD"} captured · 22 released`);
    setConsole({
      title: `8 ${mode === "live" ? "XLM" : "LUSD"} captured`,
      copy: `The final amount settled and 22 ${mode === "live" ? "XLM" : "LUSD"} returned to available capacity.`,
      hash: hash ?? (mode === "replay" ? proof.capture : null),
    });
    setFlow(4);
    els.holdButton.disabled = true;
    els.holdButton.textContent = "Session complete";
    els.captureButton.disabled = true;
    els.voidButton.disabled = true;
    els.spendButton.disabled = true;
  }
  if (state === "released") {
    setBalances(mode === "live" ? 45 : 50, 0);
    setPromise(false, "Released");
    setGuarantee(false, "Released", "No funds were captured");
    setConsole({
      title: "Promise released",
      copy: `The full 30 ${mode === "live" ? "XLM" : "LUSD"} is available to the payer again.`,
      hash,
    });
    setFlow(4);
    els.holdButton.disabled = true;
    els.holdButton.textContent = "Session complete";
    els.captureButton.disabled = true;
    els.voidButton.disabled = true;
    els.spendButton.disabled = true;
  }
}

function toast(message: string) {
  els.toast.textContent = message;
  els.toast.classList.add("show");
  window.setTimeout(() => els.toast.classList.remove("show"), 2200);
}

function setBusy(next: boolean, message?: string) {
  busy = next;
  els.walletButton.disabled = next;
  els.holdButton.disabled = next || els.holdButton.disabled;
  els.captureButton.disabled = next || els.captureButton.disabled;
  els.voidButton.disabled = next || els.voidButton.disabled;
  els.spendButton.disabled = next || els.spendButton.disabled;
  if (next && message) {
    els.liveTitle.textContent = message;
    els.liveCopy.textContent = "Approve the request in Freighter, then wait for Testnet confirmation.";
  }
}

function restoreButtons() {
  render(state, liveSession?.lastHash);
  els.walletButton.disabled = false;
}

function setAsset(code: "LUSD" | "XLM") {
  $$(".asset-unit").forEach((element) => {
    element.textContent = code;
  });
}

function saveLiveSession() {
  if (!walletAddress || !liveSession) return;
  localStorage.setItem(`${STORAGE_PREFIX}${walletAddress}`, JSON.stringify(liveSession));
}

function loadLiveSession(address: string) {
  const raw = localStorage.getItem(`${STORAGE_PREFIX}${address}`);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as LiveSession;
  } catch {
    return null;
  }
}

function walletSigner(xdrValue: string, options?: { networkPassphrase?: string; address?: string }) {
  return signTransaction(xdrValue, {
    ...options,
    address: walletAddress,
    networkPassphrase: NETWORK_PASSPHRASE,
  }).then((result) => {
    if (result.error) throw new Error(result.error.message);
    return result;
  });
}

async function signLatchAuth(assembled: any) {
  if (!liveSession) throw new Error("No live LATCH account is loaded");
  await assembled.signAuthEntries({
    address: liveSession.contractId,
    authorizeEntry: (entry: xdr.SorobanAuthorizationEntry, _signer: unknown, validUntil: number, network: string) =>
      authorizeEntry(
        entry,
        async (_preimage, payload) => {
          const message = `LATCH authorization\nPayload: ${Buffer.from(payload).toString("hex")}`;
          const result = await signMessage(message, {
            address: walletAddress,
            networkPassphrase: NETWORK_PASSPHRASE,
          });
          if (result.error) throw new Error(result.error.message);
          if (!result.signedMessage) throw new Error("Freighter returned an empty authorization signature");
          if (result.signerAddress && result.signerAddress !== walletAddress) {
            throw new Error("Freighter signed with a different account");
          }
          const signature = typeof result.signedMessage === "string"
            ? Buffer.from(result.signedMessage, "base64")
            : Buffer.from(result.signedMessage);
          return { signatureScVal: xdr.ScVal.scvBytes(signature) };
        },
        validUntil,
        network,
      ),
  });
  addExecutionLeeway(assembled);
}

function addExecutionLeeway(assembled: any) {
  const current = assembled.simulationData.transactionData;
  const resources = current.resources;
  const extraInstructions = 1_000_000;
  const extraResourceFee = 1_000_000n;
  const padded = new SorobanDataBuilder(current)
    .setResources(
      resources.instructions + extraInstructions,
      resources.diskReadBytes,
      resources.writeBytes,
    )
    .setResourceFee(current.resourceFee + extraResourceFee)
    .build();
  assembled.simulationTransactionData = padded;
  assembled.built = TransactionBuilder.cloneFrom(assembled.built, {
    fee: (BigInt(assembled.built.fee) + extraResourceFee).toString(),
  })
    .setSorobanData(padded)
    .build();
}

async function connectWallet() {
  setBusy(true, "Checking Freighter");
  try {
    const connection = await isConnected();
    if (connection.error) throw new Error(connection.error.message);
    if (!connection.isConnected) {
      throw new Error("Freighter extension is not installed in this browser");
    }
    const access = await requestAccess();
    if (access.error) throw new Error(access.error.message);
    const network = await getNetwork();
    if (network.error) throw new Error(network.error.message);
    if (network.networkPassphrase !== NETWORK_PASSPHRASE) {
      throw new Error("Switch Freighter to Testnet, then connect again");
    }
    walletAddress = access.address;
    els.payerAddress.textContent = shortAddress(walletAddress);
    els.merchantAddress.textContent = shortAddress(walletAddress);
    liveSession = loadLiveSession(walletAddress);
    if (liveSession) {
      liveClient = (await contract.Client.from({
        contractId: liveSession.contractId,
        networkPassphrase: NETWORK_PASSPHRASE,
        publicKey: walletAddress,
        rpcUrl: RPC_URL,
        signTransaction: walletSigner,
      })) as DynamicLatch;
      currentContractAddress = liveSession.contractId;
      els.walletButton.textContent = "Wallet connected";
      els.walletButton.classList.add("is-ready");
      els.liveTitle.textContent = `Connected · ${shortAddress(walletAddress)}`;
      els.liveCopy.textContent = "Existing live LATCH account restored from this browser.";
      await refreshLiveState();
    } else {
      els.walletButton.textContent = "Create LATCH + deposit 50 XLM";
      els.walletButton.classList.add("is-ready");
      els.liveTitle.textContent = `Connected · ${shortAddress(walletAddress)}`;
      els.liveCopy.textContent = "Next: deploy your smart account and deposit 50 Testnet XLM.";
      render("funded");
      els.holdButton.disabled = true;
    }
  } finally {
    busy = false;
    els.walletButton.disabled = false;
  }
}

async function ensureFunded() {
  try {
    await rpcServer.getAccount(walletAddress);
  } catch (error) {
    if (!/account.*not found|not found/i.test(errorMessage(error))) throw error;
    els.liveTitle.textContent = "Funding your Testnet wallet";
    await rpcServer.fundAddress(walletAddress, FRIENDBOT_URL);
  }
}

async function createLiveAccount() {
  if (!walletAddress) return connectWallet();
  setBusy(true, "Deploying your LATCH account");
  try {
    await ensureFunded();
    const deployTx = await contract.Client.deploy(
      {
        owner: Buffer.from(StrKey.decodeEd25519PublicKey(walletAddress)),
        token: Asset.native().contractId(NETWORK_PASSPHRASE),
      },
      {
        wasmHash: WASM_HASH,
        format: "hex",
        networkPassphrase: NETWORK_PASSPHRASE,
        publicKey: walletAddress,
        rpcUrl: RPC_URL,
        signTransaction: walletSigner,
      },
    );
    const deployed = assertSuccessful(await deployTx.signAndSend(), "LATCH deployment");
    liveClient = (deployed.result ?? deployTx.result) as DynamicLatch;
    const contractId = liveClient.options.contractId;
    liveSession = { contractId, phase: "funded", lastHash: txHash(deployed) };
    currentContractAddress = contractId;
    saveLiveSession();

    els.liveTitle.textContent = "Depositing 50 Testnet XLM";
    const depositTx = await liveClient.deposit({ from: walletAddress, amount: 50n * SCALE });
    unwrapResult(depositTx.result);
    const deposited = assertSuccessful(await depositTx.signAndSend(), "Deposit");
    liveSession.lastHash = txHash(deposited);
    saveLiveSession();
    updateLiveContract();
    els.walletButton.textContent = "Wallet connected";
    els.liveTitle.textContent = "Live LATCH account ready";
    els.liveCopy.textContent = "50 XLM deposited. Create the merchant hold from the terminal below.";
    render("funded", liveSession.lastHash);
  } finally {
    busy = false;
    restoreButtons();
  }
}

async function createLiveHold() {
  if (!liveClient || !liveSession) throw new Error("Create a live LATCH account first");
  setBusy(true, "Signing a 30 XLM hold");
  try {
    const latest = await rpcServer.getLatestLedger();
    const reference = crypto.getRandomValues(new Uint8Array(32));
    const holdTx = await liveClient.create_hold({
      merchant: walletAddress,
      maximum: 30n * SCALE,
      expires_at: latest.sequence + 5_000,
      reference: Buffer.from(reference),
    });
    const holdId = unwrapResult<bigint>(holdTx.result);
    await signLatchAuth(holdTx);
    const held = assertSuccessful(await holdTx.signAndSend(), "Create hold");
    liveSession.holdId = holdId.toString();
    liveSession.phase = "held";
    liveSession.lastHash = txHash(held);
    saveLiveSession();
    els.liveTitle.textContent = "30 XLM guaranteed on-chain";
    els.liveCopy.textContent = `Hold #${liveSession.holdId} is active and merchant-verifiable.`;
    render("held", liveSession.lastHash);
  } finally {
    busy = false;
    restoreButtons();
  }
}

async function proveOverspendBlocked() {
  if (!liveClient || !liveSession) throw new Error("No live LATCH account is loaded");
  setBusy(true, "Simulating a 25 XLM overspend");
  try {
    const attempt = await liveClient.pay({ to: walletAddress, amount: 25n * SCALE });
    if (attempt.result?.isErr?.()) {
      const rejected = attempt.result.unwrapErr?.();
      if (rejected?.message !== "ReservedBalanceViolation") {
        throw new Error(rejected?.message ?? "Contract rejected the simulation");
      }
      liveSession.phase = "blocked";
      saveLiveSession();
      render("blocked");
      els.liveTitle.textContent = "Overspend rejected before signing";
      els.liveCopy.textContent = "The contract returned ReservedBalanceViolation; no transaction fee was spent.";
      return;
    }
    throw new Error("Safety invariant failed: the overspend simulation was accepted");
  } catch (error) {
    if (/ReservedBalanceViolation|Contract.*#4|Error.*4/i.test(errorMessage(error))) {
      liveSession.phase = "blocked";
      saveLiveSession();
      render("blocked");
      els.liveTitle.textContent = "Overspend rejected before signing";
      els.liveCopy.textContent = "The reservation stayed intact; no transaction reached the network.";
      return;
    }
    throw error;
  } finally {
    busy = false;
    restoreButtons();
  }
}

async function makeSafePayment() {
  if (!liveClient || !liveSession) throw new Error("No live LATCH account is loaded");
  setBusy(true, "Signing a safe 5 XLM payment");
  try {
    const payTx = await liveClient.pay({ to: walletAddress, amount: 5n * SCALE });
    unwrapResult(payTx.result);
    await signLatchAuth(payTx);
    const paid = assertSuccessful(await payTx.signAndSend(), "Direct payment");
    liveSession.phase = "paid";
    liveSession.lastHash = txHash(paid);
    saveLiveSession();
    els.liveTitle.textContent = "Safe payment confirmed";
    els.liveCopy.textContent = "5 XLM moved while the full 30 XLM merchant guarantee remained active.";
    render("paid", liveSession.lastHash);
  } finally {
    busy = false;
    restoreButtons();
  }
}

async function captureLiveHold() {
  if (!liveClient || !liveSession?.holdId) throw new Error("No active live hold exists");
  setBusy(true, "Capturing 8 XLM");
  try {
    const captureTx = await liveClient.capture({ id: BigInt(liveSession.holdId), amount: 8n * SCALE });
    unwrapResult(captureTx.result);
    const captured = assertSuccessful(await captureTx.signAndSend(), "Capture");
    liveSession.phase = "captured";
    liveSession.lastHash = txHash(captured);
    saveLiveSession();
    els.liveTitle.textContent = "Lifecycle complete on Testnet";
    els.liveCopy.textContent = "8 XLM settled, 22 XLM released, and every state transition is public.";
    render("captured", liveSession.lastHash);
    await refreshLiveState();
  } finally {
    busy = false;
    restoreButtons();
  }
}

async function voidLiveHold() {
  if (!liveClient || !liveSession?.holdId) throw new Error("No active live hold exists");
  setBusy(true, "Releasing the live hold");
  try {
    const voidTx = await liveClient.void({ id: BigInt(liveSession.holdId) });
    unwrapResult(voidTx.result);
    const released = assertSuccessful(await voidTx.signAndSend(), "Release hold");
    liveSession.phase = "released";
    liveSession.lastHash = txHash(released);
    saveLiveSession();
    els.liveTitle.textContent = "Hold released on Testnet";
    els.liveCopy.textContent = "Nothing was captured; all remaining capacity is available again.";
    render("released", liveSession.lastHash);
    await refreshLiveState();
  } finally {
    busy = false;
    restoreButtons();
  }
}

async function refreshLiveState() {
  if (!liveClient || !liveSession) return;
  const availableTx = await liveClient.available();
  const reservedTx = await liveClient.total_reserved();
  const realTx = await liveClient.real_balance();
  const available = units(unwrapResult<bigint>(availableTx.result));
  const reserved = units(unwrapResult<bigint>(reservedTx.result));
  const real = units(unwrapResult<bigint>(realTx.result));
  const received = liveSession.phase === "captured" ? 8 : 0;
  state = liveSession.phase;
  render(state, liveSession.lastHash);
  setBalances(real, reserved, received);
  els.available.textContent = money(available);
  updateLiveContract();
}

function updateLiveContract() {
  if (!liveSession) return;
  currentContractAddress = liveSession.contractId;
  els.contractLabel.textContent = "Your live LATCH contract";
  els.contractAddress.textContent = liveSession.contractId;
}

function setMode(nextMode: DemoMode) {
  if (busy) return;
  mode = nextMode;
  const isLive = mode === "live";
  els.replayMode.classList.toggle("is-active", !isLive);
  els.liveMode.classList.toggle("is-active", isLive);
  els.liveSession.hidden = !isLive;
  els.runButton.hidden = isLive;
  els.modeLabel.innerHTML = isLive
    ? '<span class="pulse"></span> Live Stellar Testnet'
    : '<span class="pulse"></span> Verified Testnet replay';
  els.resetButton.textContent = isLive ? "Refresh" : "Reset";
  setAsset(isLive ? "XLM" : "LUSD");
  if (isLive) {
    els.contractLabel.textContent = liveSession ? "Your live LATCH contract" : "Proof contract · connect wallet for yours";
    els.contractAddress.textContent = liveSession?.contractId ?? PROOF_CONTRACT;
    currentContractAddress = liveSession?.contractId ?? PROOF_CONTRACT;
    if (liveSession && liveClient) {
      void refreshLiveState().catch(reportError);
    } else {
      render("funded");
      els.holdButton.disabled = true;
      els.txLink.hidden = true;
    }
  } else {
    currentContractAddress = PROOF_CONTRACT;
    els.contractLabel.textContent = "Deployed proof contract";
    els.contractAddress.textContent = PROOF_CONTRACT;
    els.payerAddress.textContent = "GAQ6…SALV";
    els.merchantAddress.textContent = "GCXT…CDHF";
    render("funded");
  }
}

function reportError(error: unknown) {
  const message = errorMessage(error);
  toast(message);
  setConsole({ icon: "!", blocked: true, title: "Action could not complete", copy: message });
  if (mode === "live") {
    els.liveTitle.textContent = "Check Freighter and try again";
    els.liveCopy.textContent = message;
  }
}

els.replayMode.addEventListener("click", () => setMode("replay"));
els.liveMode.addEventListener("click", () => setMode("live"));

els.walletButton.addEventListener("click", () => {
  const action = walletAddress && !liveClient ? createLiveAccount() : connectWallet();
  action.catch(reportError);
});

els.holdButton.addEventListener("click", () => {
  if (mode === "replay") render("held");
  else createLiveHold().catch(reportError);
});

els.spendButton.addEventListener("click", () => {
  if (mode === "replay") render("blocked");
  else if (state === "blocked") makeSafePayment().catch(reportError);
  else proveOverspendBlocked().catch(reportError);
});

els.captureButton.addEventListener("click", () => {
  if (mode === "replay") render("captured");
  else captureLiveHold().catch(reportError);
});

els.voidButton.addEventListener("click", () => {
  if (mode === "replay") render("released");
  else voidLiveHold().catch(reportError);
});

els.resetButton.addEventListener("click", () => {
  if (mode === "live") {
    refreshLiveState().catch(reportError);
    return;
  }
  running = false;
  els.runButton.disabled = false;
  els.runButton.innerHTML = '<span class="run-icon">▶</span> Run 12-second demo';
  render("funded");
});

els.runButton.addEventListener("click", async () => {
  if (running || mode === "live") return;
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
    await navigator.clipboard.writeText(currentContractAddress);
    toast("Contract address copied");
  } catch {
    toast(currentContractAddress);
  }
});

render("funded");
