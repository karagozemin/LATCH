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
  SorobanDataBuilder,
  StrKey,
  TransactionBuilder,
  authorizeEntry,
  rpc,
  xdr,
} from "@stellar/stellar-sdk";
import { Client as LatchClient, type HoldVerification } from "latch-client";
import { TESTNET } from "./testnet-config";

const proof = TESTNET.proof;
const PROOF_CONTRACT = TESTNET.proofContract;
const WASM_HASH = TESTNET.wasmHash;
const RPC_URL = TESTNET.rpcUrl;
const FRIENDBOT_URL = TESTNET.friendbotUrl;
const NETWORK_PASSPHRASE = TESTNET.passphrase;
const SCALE = 10_000_000n;
const STORAGE_PREFIX = "latch-live-v2:";
const rpcServer = new rpc.Server(RPC_URL);

type DemoState = "funded" | "heldPrimary" | "held" | "blocked" | "paid" | "captured" | "released";
type DemoMode = "replay" | "live";

interface LiveSession {
  contractId: string;
  holdId?: string;
  phase: DemoState;
  lastHash?: string;
  declineEvidence?: DeclineEvidence;
}

interface DeclineEvidence {
  beforeAvailable: number;
  beforeBalance: number;
  attempted: number;
  afterAvailable: number;
  afterBalance: number;
  kind: "simulation";
}

interface RetryAction {
  label: string;
  run: () => Promise<void>;
}

class LiveTransactionError extends Error {
  constructor(
    readonly actionLabel: string,
    readonly transactionHash: string,
    readonly reason: string,
    readonly safeToRetry: boolean,
  ) {
    super(`${actionLabel} failed on Stellar Testnet. ${reason}`);
    this.name = "LiveTransactionError";
  }
}

const $ = <T extends Element = HTMLElement>(selector: string): T => {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing element: ${selector}`);
  return element;
};
const $$ = <T extends Element = HTMLElement>(selector: string) => [
  ...document.querySelectorAll<T>(selector),
];
const wait = (milliseconds: number) => new Promise((resolve) => window.setTimeout(resolve, milliseconds));

const els = {
  balance: $("#payer-balance"),
  available: $("#available-value"),
  reserved: $("#reserved-value"),
  availableBar: $("#available-bar"),
  reservedBar: $("#reserved-bar"),
  promiseCard: $("#promise-card"),
  emptyPromise: $("#empty-promise"),
  promisePrimary: $("#promise-details-primary"),
  promiseSecondary: $("#promise-details-secondary"),
  payerStatus: $("#payer-status"),
  guarantee: $("#guarantee"),
  guaranteeLabel: $("#guarantee-label"),
  guaranteeCopy: $("#guarantee-copy"),
  merchantReceived: $("#merchant-received"),
  merchantLogo: $("#merchant-logo"),
  merchantName: $("#merchant-name"),
  requestAmount: $("#request-amount"),
  requestReference: $("#request-reference"),
  holdButton: $("#hold-button") as HTMLButtonElement,
  captureButton: $("#capture-button") as HTMLButtonElement,
  voidButton: $("#void-button") as HTMLButtonElement,
  spendButton: $("#spend-button") as HTMLButtonElement,
  runButton: $("#run-button") as HTMLButtonElement,
  resetButton: $("#reset-button") as HTMLButtonElement,
  judgeCaption: $("#judge-caption") as HTMLElement,
  judgeProgress: $("#judge-progress") as HTMLElement,
  judgeBeat: $("#judge-beat"),
  judgeTitle: $("#judge-title"),
  judgeCopy: $("#judge-copy"),
  consoleIcon: $("#console-icon"),
  consoleTitle: $("#console-title"),
  consoleCopy: $("#console-copy"),
  txLink: $("#tx-link") as HTMLAnchorElement,
  retryButton: $("#retry-button") as HTMLButtonElement,
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
  networkLink: $<HTMLAnchorElement>("#network-link"),
  declineEvidence: $("#decline-evidence"),
  declineBefore: $("#decline-before"),
  declineAttempt: $("#decline-attempt"),
  declineAfter: $("#decline-after"),
  settlementEvidence: $("#settlement-evidence"),
  settlementPaid: $("#settlement-paid"),
  settlementReleased: $("#settlement-released"),
  settlementAvailable: $("#settlement-available"),
};

let mode: DemoMode = "replay";
let state: DemoState = "funded";
let running = false;
let busy = false;
let walletAddress = "";
let liveClient: LatchClient | null = null;
let liveSession: LiveSession | null = null;
let currentContractAddress: string = PROOF_CONTRACT;
let retryAction: RetryAction | null = null;

function money(value: number) {
  return Number(value).toFixed(2);
}

function units(value: bigint) {
  return Number(value) / Number(SCALE);
}

function shortAddress(address: string) {
  return address.length > 12 ? `${address.slice(0, 5)}…${address.slice(-4)}` : address;
}

function explorerUrl(kind: "contract" | "tx", value: string) {
  return `${TESTNET.explorerBaseUrl}/${kind}/${value}`;
}

function configureProofEvidence() {
  els.networkLink.href = explorerUrl("contract", PROOF_CONTRACT);
  els.contractAddress.textContent = PROOF_CONTRACT;
  $$<HTMLAnchorElement>("[data-proof]").forEach((link) => {
    const step = link.dataset.proof as keyof typeof proof;
    const hash = proof[step];
    link.href = explorerUrl("tx", hash);
    const label = link.querySelector("b");
    if (label) label.textContent = `${hash.slice(0, 6)}…${hash.slice(-6)}`;
  });
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

function transactionFailureReason(response: any) {
  const diagnostics = Array.isArray(response?.diagnosticEventsXdr)
    ? response.diagnosticEventsXdr
        .map((event: any) => {
          try {
            const value = typeof event?.toJSON === "function" ? event.toJSON() : event;
            return JSON.stringify(value, (_key, item) => (typeof item === "bigint" ? item.toString() : item));
          } catch {
            return "";
          }
        })
        .join(" ")
    : "";

  if (/exceeded_limit|instructions exceeds|instruction.*limit/i.test(diagnostics)) {
    const amounts = [...diagnostics.matchAll(/"u64":"?(\d+)"?/g)].map((match) => Number(match[1]));
    const detail = amounts.length >= 2 ? ` (${amounts[0].toLocaleString()} used / ${amounts[1].toLocaleString()} allowed)` : "";
    return `Execution budget exceeded${detail}. No state changed.`;
  }
  if (/expired|expiration|valid.*until/i.test(diagnostics)) {
    return "The authorization expired before confirmation. No state changed.";
  }
  if (/auth|signature|unauthorized/i.test(diagnostics)) {
    return "The account authorization was rejected. No state changed.";
  }
  if (/storage|rent|footprint/i.test(diagnostics)) {
    return "Stellar rejected the transaction's storage resources. No state changed.";
  }
  return "Stellar rejected the transaction atomically, so no state changed.";
}

function assertSuccessful(sent: any, label: string) {
  const response = sent?.getTransactionResponse;
  const status = response?.status;
  if (status !== "SUCCESS") {
    throw new LiveTransactionError(label, txHash(sent), transactionFailureReason(response), status === "FAILED");
  }
  return sent;
}

function clearRetry() {
  retryAction = null;
  els.retryButton.hidden = true;
}

async function runLiveAction(label: string, action: () => Promise<void>) {
  retryAction = { label, run: action };
  try {
    await action();
    clearRetry();
  } catch (error) {
    reportError(error);
  }
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
    els.txLink.href = explorerUrl("tx", hash);
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

function setMerchant(name: string, mark: string, amount: number, reference: string) {
  els.merchantName.textContent = name;
  els.merchantLogo.textContent = mark;
  els.requestAmount.textContent = money(amount);
  els.requestReference.textContent = reference;
}

function setPromise(primary: boolean, secondary: boolean, status = "None") {
  const active = primary || secondary;
  els.promiseCard.classList.toggle("is-active", active);
  (els.emptyPromise as HTMLElement).hidden = active;
  (els.promisePrimary as HTMLElement).hidden = !primary;
  (els.promiseSecondary as HTMLElement).hidden = !secondary;
  els.payerStatus.textContent = status;
}

function setGuarantee(
  status: "idle" | "guaranteed" | "not-backed",
  label: string,
  copy: string,
) {
  els.guarantee.classList.toggle("is-guaranteed", status === "guaranteed");
  els.guarantee.classList.toggle("is-not-backed", status === "not-backed");
  $(".guarantee-icon").textContent = status === "not-backed" ? "!" : "✓";
  els.guaranteeLabel.textContent = label;
  els.guaranteeCopy.textContent = copy;
}

function setDeclineEvidence(evidence?: DeclineEvidence) {
  els.declineEvidence.hidden = !evidence;
  if (!evidence) return;
  const asset = mode === "live" ? "XLM" : "LUSD";
  els.declineBefore.textContent = `${money(evidence.beforeAvailable)} ${asset}`;
  els.declineAttempt.textContent = `${money(evidence.attempted)} ${asset} · rejected`;
  els.declineAfter.textContent = `${money(evidence.afterBalance)} ${asset} balance · ${money(evidence.afterAvailable)} available`;
}

function setSettlementEvidence(visible: boolean) {
  els.settlementEvidence.hidden = !visible;
  if (!visible) return;
  const isLiveFallback = mode === "live";
  const asset = isLiveFallback ? "XLM" : "LUSD";
  els.settlementPaid.textContent = `${money(isLiveFallback ? 8 : 8.4)} ${asset}`;
  els.settlementReleased.textContent = `${money(isLiveFallback ? 22 : 21.6)} ${asset}`;
  els.settlementAvailable.textContent = isLiveFallback
    ? `15.00 → 37.00 ${asset}`
    : `1.00 → 22.60 ${asset}`;
}

function setJudgeBeat(beat: number, title: string, copy: string) {
  els.judgeBeat.textContent = `Judge beat ${beat} / 7`;
  els.judgeTitle.textContent = title;
  els.judgeCopy.textContent = copy;
  els.judgeProgress.style.width = `${(beat / 7) * 100}%`;
}

function recordedDeclineEvidence(): DeclineEvidence {
  return {
    beforeAvailable: units(BigInt(TESTNET.decline.before.available)),
    beforeBalance: units(BigInt(TESTNET.decline.before.balance)),
    attempted: units(BigInt(TESTNET.decline.attempted)),
    afterAvailable: units(BigInt(TESTNET.decline.after.available)),
    afterBalance: units(BigInt(TESTNET.decline.after.balance)),
    kind: "simulation",
  };
}

function render(nextState: DemoState, hash?: string | null) {
  const previousState = state;
  state = nextState;
  if (state === "funded") {
    setMerchant("Meridian Hotel", "M", 30, "#H-0001");
    setJudgeBeat(1, "The payer keeps custody.", "All 50 LUSD stays in the payer's account; creating a hold transfers nothing to the merchant.");
    setBalances(50, 0);
    setPromise(false, false);
    setGuarantee("idle", "Ready to request", "Waiting for payer authorization");
    setDeclineEvidence();
    setSettlementEvidence(false);
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
  if (state === "heldPrimary") {
    setMerchant(
      mode === "live" ? "Meridian Hotel" : "Atlantic Fuel",
      mode === "live" ? "M" : "F",
      mode === "live" ? 30 : 15,
      mode === "live" ? "#H-0001" : "#F-0002",
    );
    setJudgeBeat(2, "The merchant gets certainty, not custody.", "The first 30 LUSD promise is merchant-bound; zero moves at authorization.");
    setBalances(50, 30);
    setPromise(true, false, "1 active");
    setGuarantee("guaranteed", "Funds reserved", `30 ${mode === "live" ? "XLM" : "LUSD"} is guaranteed on-chain`);
    setDeclineEvidence();
    setSettlementEvidence(false);
    setConsole({
      title: "First capacity guarantee active",
      copy: `30 ${mode === "live" ? "XLM" : "LUSD"} is reserved; no funds moved to the merchant.`,
      hash: hash ?? (mode === "replay" ? proof.hold : null),
    });
    setFlow(1);
    els.holdButton.disabled = mode === "live";
    els.holdButton.textContent = mode === "live" ? "Hold active" : "Authorize second 15 LUSD hold";
    els.captureButton.disabled = false;
    els.voidButton.disabled = false;
    els.spendButton.disabled = mode === "replay";
    els.spendButton.textContent = `Try to spend 25 ${mode === "live" ? "XLM" : "LUSD"}`;
  }
  if (state === "held" || state === "blocked") {
    const isLiveFallback = mode === "live";
    const reserved = isLiveFallback ? 30 : 45;
    const attempted = isLiveFallback ? 25 : 10;
    const available = 50 - reserved;
    setMerchant("Meridian Hotel", "M", 30, "#H-0001");
    if (state === "blocked") {
      setJudgeBeat(4, "The promise cannot be double-spent.", "The chain reports 5 available, rejects the 10 payment, then reports the same balance and capacity.");
    } else {
      setJudgeBeat(3, "Two merchants share one honest capacity.", "A second 15 LUSD hold leaves only 5 available without transferring custody.");
    }
    setBalances(50, reserved);
    setPromise(true, !isLiveFallback, isLiveFallback ? "1 active" : "2 active");
    setGuarantee("guaranteed", "Funds reserved", `${reserved} ${isLiveFallback ? "XLM" : "LUSD"} is guaranteed on-chain`);
    setDeclineEvidence(
      state === "blocked"
        ? (isLiveFallback ? liveSession?.declineEvidence : recordedDeclineEvidence())
        : undefined,
    );
    setSettlementEvidence(false);
    setConsole(
      state === "blocked"
        ? {
            icon: "!",
            blocked: true,
            title: `${attempted} ${isLiveFallback ? "XLM" : "LUSD"} payment blocked`,
            copy: `${available} ${isLiveFallback ? "XLM" : "LUSD"} was available before and after; this was a simulation rejection, not a submitted transaction.`,
          }
        : {
            title: isLiveFallback ? "Capacity guaranteed" : "Second capacity guarantee active",
            copy: `${reserved} ${isLiveFallback ? "XLM" : "LUSD"} is now reserved across ${isLiveFallback ? "one hold" : "two merchants"}.`,
            hash: hash ?? (mode === "replay" ? proof.holdSecondary : null),
          },
    );
    setFlow(state === "blocked" ? 3 : isLiveFallback ? 1 : 2);
    els.holdButton.disabled = true;
    els.holdButton.textContent = isLiveFallback ? "Hold active" : "Two holds active";
    els.captureButton.disabled = false;
    els.voidButton.disabled = false;
    els.spendButton.disabled = false;
    els.spendButton.textContent = state === "blocked"
      ? `Pay ${isLiveFallback ? 5 : 4} ${isLiveFallback ? "XLM" : "LUSD"} safely`
      : `Try to spend ${attempted} ${isLiveFallback ? "XLM" : "LUSD"}`;
  }
  if (state === "paid") {
    const isLiveFallback = mode === "live";
    const amount = isLiveFallback ? 5 : 4;
    setMerchant("Meridian Hotel", "M", 30, "#H-0001");
    setJudgeBeat(5, "Unreserved money remains useful.", "A 4 LUSD payment succeeds while both merchant guarantees remain untouched.");
    setBalances(isLiveFallback ? 45 : 46, isLiveFallback ? 30 : 45);
    setPromise(true, !isLiveFallback, isLiveFallback ? "1 active" : "2 active");
    setGuarantee("guaranteed", "Still guaranteed", "Direct payment preserved the hold");
    setDeclineEvidence();
    setSettlementEvidence(false);
    setConsole({
      title: `${amount} ${isLiveFallback ? "XLM" : "LUSD"} paid safely`,
      copy: `The payment used only available capacity; ${isLiveFallback ? "the hold" : "both holds"} stayed intact.`,
      hash: hash ?? (mode === "replay" ? proof.pay : null),
    });
    setFlow(4);
    els.holdButton.disabled = true;
    els.captureButton.disabled = false;
    els.voidButton.disabled = false;
    els.spendButton.disabled = true;
  }
  if (state === "captured") {
    const isLiveFallback = mode === "live";
    setMerchant(
      isLiveFallback ? "Meridian Hotel" : "Atlantic Fuel",
      isLiveFallback ? "M" : "F",
      isLiveFallback ? 30 : 15,
      isLiveFallback ? "#H-0001" : "#F-0002",
    );
    setJudgeBeat(6, "Only the final amount settles.", "The hotel captures 8.40 LUSD; its unused 21.60 is released while the second 15 LUSD hold stays backed.");
    setBalances(isLiveFallback ? 37 : 37.6, isLiveFallback ? 0 : 15, isLiveFallback ? 8 : 8.4);
    setPromise(false, !isLiveFallback, isLiveFallback ? "Captured" : "1 active");
    setGuarantee(
      isLiveFallback ? "idle" : "guaranteed",
      isLiveFallback ? "Settled" : "Second hold intact",
      isLiveFallback ? "8 XLM captured · 22 released" : "15 LUSD remains guaranteed for Atlantic Fuel",
    );
    setDeclineEvidence();
    setSettlementEvidence(true);
    setConsole({
      title: `${isLiveFallback ? "8" : "8.40"} ${isLiveFallback ? "XLM" : "LUSD"} captured`,
      copy: isLiveFallback
        ? "The final amount settled and 22 XLM returned to available capacity."
        : "21.60 LUSD was released from Hold A; Hold B still reserves 15.00 LUSD.",
      hash: hash ?? (mode === "replay" ? proof.capture : null),
    });
    setFlow(5);
    els.holdButton.disabled = true;
    els.holdButton.textContent = isLiveFallback ? "Session complete" : "Hotel settled";
    els.captureButton.disabled = true;
    els.voidButton.disabled = isLiveFallback;
    els.spendButton.disabled = true;
  }
  if (state === "released") {
    const liveBalance = previousState === "paid" ? 45 : 50;
    setJudgeBeat(7, "Unused capacity returns immediately.", "Atlantic Fuel releases 15 LUSD. The payer finishes with 37.60 available and no active reservations.");
    setBalances(mode === "live" ? liveBalance : 37.6, 0, mode === "live" ? 0 : 8.4);
    setPromise(false, false, "Released");
    setGuarantee("idle", "Released", "No funds were captured");
    setDeclineEvidence();
    setSettlementEvidence(false);
    setConsole({
      title: "Promise released",
      copy: mode === "live"
        ? "The full live hold is available to the payer again."
        : "The remaining 15 LUSD reservation returned; final available capacity is 37.60 LUSD.",
      hash: hash ?? (mode === "replay" ? proof.release : null),
    });
    setFlow(6);
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
  els.retryButton.disabled = next;
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
  // Protocol 29 simulation undercounts the SEP-53 + Ed25519 custom-account
  // path by just over one million instructions on the public Testnet RPC.
  // Keep a further 500k margin so minor host variance cannot fail after the
  // user has approved both wallet prompts.
  const extraInstructions = 1_500_000;
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
      liveClient = new LatchClient({
        contractId: liveSession.contractId,
        networkPassphrase: NETWORK_PASSPHRASE,
        publicKey: walletAddress,
        rpcUrl: RPC_URL,
        signTransaction: walletSigner,
      });
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
    const deployTx = await LatchClient.deploy(
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
    const deployedClient = deployed.result ?? deployTx.result;
    liveClient = deployedClient;
    const contractId = deployedClient.options.contractId;
    liveSession = { contractId, phase: "funded", lastHash: txHash(deployed) };
    currentContractAddress = contractId;
    saveLiveSession();

    els.liveTitle.textContent = "Depositing 50 Testnet XLM";
    const depositTx = await deployedClient.deposit({ from: walletAddress, amount: 50n * SCALE });
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
    liveSession.phase = "heldPrimary";
    liveSession.lastHash = txHash(held);
    saveLiveSession();
    els.liveTitle.textContent = "30 XLM guaranteed on-chain";
    els.liveCopy.textContent = `Hold #${liveSession.holdId} is active and merchant-verifiable.`;
    render("heldPrimary", liveSession.lastHash);
    await pollHoldGuarantee();
  } finally {
    busy = false;
    restoreButtons();
  }
}

async function readLiveCapacity() {
  if (!liveClient) throw new Error("No live LATCH account is loaded");
  const [availableTx, balanceTx] = await Promise.all([
    liveClient.available(),
    liveClient.real_balance(),
  ]);
  return {
    available: units(unwrapResult<bigint>(availableTx.result)),
    balance: units(balanceTx.result),
  };
}

async function proveOverspendBlocked() {
  if (!liveClient || !liveSession) throw new Error("No live LATCH account is loaded");
  setBusy(true, "Simulating a 25 XLM overspend");
  try {
    const before = await readLiveCapacity();
    let rejected = false;
    try {
      const attempt = await liveClient.pay({ to: walletAddress, amount: 25n * SCALE });
      if (attempt.result?.isErr?.()) {
        attempt.result.unwrapErr?.();
        rejected = true;
      }
    } catch (error) {
      if (!/ReservedBalanceViolation|Contract.*#4|Error.*4/i.test(errorMessage(error))) {
        throw error;
      }
      rejected = true;
    }
    if (!rejected) throw new Error("Safety invariant failed: the overspend simulation was accepted");

    const after = await readLiveCapacity();
    if (before.available !== after.available || before.balance !== after.balance) {
      throw new Error("Safety invariant failed: rejected simulation changed on-chain state");
    }

    liveSession.declineEvidence = {
      beforeAvailable: before.available,
      beforeBalance: before.balance,
      attempted: 25,
      afterAvailable: after.available,
      afterBalance: after.balance,
      kind: "simulation",
    };
    liveSession.phase = "blocked";
    saveLiveSession();
    render("blocked");
    await pollHoldGuarantee();
    els.liveTitle.textContent = "Overspend rejected before signing";
    els.liveCopy.textContent = "Three chain reads agree: capacity and balance are unchanged; no transaction was submitted.";
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
    await pollHoldGuarantee();
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
    const voidTx = await liveClient.void_({ id: BigInt(liveSession.holdId) });
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
  await pollHoldGuarantee();
}

async function pollHoldGuarantee() {
  if (
    mode !== "live" ||
    !liveClient ||
    !liveSession?.holdId ||
    !["heldPrimary", "held", "blocked", "paid"].includes(liveSession.phase)
  ) {
    return;
  }

  try {
    const verificationTx = await liveClient.verify_hold({
      id: BigInt(liveSession.holdId),
    });
    const verification = unwrapResult<HoldVerification>(verificationTx.result);
    if (verification.active && verification.guaranteed) {
      setGuarantee("guaranteed", "Funds reserved", "verify_hold: active + backed on-chain");
    } else {
      setGuarantee(
        "not-backed",
        "Not backed",
        verification.active
          ? "Hold exists, but current token backing is insufficient"
          : "Hold is no longer active on-chain",
      );
    }
  } catch {
    setGuarantee("idle", "Verification delayed", "RPC read unavailable · no guarantee claimed");
  }
}

function updateLiveContract() {
  if (!liveSession) return;
  currentContractAddress = liveSession.contractId;
  els.contractLabel.textContent = "Your live LATCH contract";
  els.contractAddress.textContent = liveSession.contractId;
}

function setMode(nextMode: DemoMode) {
  if (busy) return;
  clearRetry();
  mode = nextMode;
  const isLive = mode === "live";
  els.replayMode.classList.toggle("is-active", !isLive);
  els.liveMode.classList.toggle("is-active", isLive);
  els.liveSession.hidden = !isLive;
  els.judgeCaption.hidden = isLive;
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
  const transactionError = error instanceof LiveTransactionError ? error : null;
  const walletRejected = /user rejected|declined|denied|cancelled|canceled/i.test(message);
  const canRetry = Boolean(retryAction && (transactionError?.safeToRetry || walletRejected));
  toast(message);
  setConsole({
    icon: "!",
    blocked: true,
    title: canRetry ? `${transactionError?.actionLabel ?? "Action"} failed · safe to retry` : "Action could not complete",
    copy: transactionError?.reason ?? message,
    hash: transactionError?.transactionHash,
  });
  els.retryButton.textContent = retryAction ? `Retry ${retryAction.label}` : "Retry action";
  els.retryButton.disabled = false;
  els.retryButton.hidden = !canRetry;
  if (mode === "live") {
    els.liveTitle.textContent = canRetry ? "Nothing changed · safe to retry" : "Refresh state before trying again";
    els.liveCopy.textContent = transactionError?.reason ?? message;
  }
}

els.replayMode.addEventListener("click", () => setMode("replay"));
els.liveMode.addEventListener("click", () => setMode("live"));

els.walletButton.addEventListener("click", () => {
  const action = walletAddress && !liveClient ? createLiveAccount() : connectWallet();
  action.catch(reportError);
});

els.holdButton.addEventListener("click", () => {
  if (mode === "replay") render(state === "funded" ? "heldPrimary" : "held");
  else void runLiveAction("30 XLM hold", createLiveHold);
});

els.spendButton.addEventListener("click", () => {
  if (mode === "replay") render(state === "blocked" ? "paid" : "blocked");
  else if (state === "blocked") void runLiveAction("5 XLM payment", makeSafePayment);
  else void runLiveAction("overspend proof", proveOverspendBlocked);
});

els.captureButton.addEventListener("click", () => {
  if (mode === "replay") render("captured");
  else void runLiveAction("8 XLM capture", captureLiveHold);
});

els.voidButton.addEventListener("click", () => {
  if (mode === "replay") render("released");
  else void runLiveAction("hold release", voidLiveHold);
});

els.retryButton.addEventListener("click", () => {
  if (busy || !retryAction) return;
  const pending = retryAction;
  void runLiveAction(pending.label, pending.run);
});

els.resetButton.addEventListener("click", () => {
  if (mode === "live") {
    refreshLiveState().catch(reportError);
    return;
  }
  running = false;
  els.runButton.disabled = false;
  els.runButton.innerHTML = '<span class="run-icon">▶</span> Run 12-second judge proof';
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
  render("heldPrimary");
  await wait(1200);
  if (!running) return;
  render("held");
  await wait(1200);
  if (!running) return;
  render("blocked");
  await wait(1500);
  if (!running) return;
  render("paid");
  await wait(1300);
  if (!running) return;
  render("captured");
  await wait(1400);
  if (!running) return;
  render("released");
  await wait(700);
  running = false;
  els.runButton.disabled = false;
  els.runButton.innerHTML = '<span class="run-icon">↻</span> Replay judge proof';
});

$("#copy-contract").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(currentContractAddress);
    toast("Contract address copied");
  } catch {
    toast(currentContractAddress);
  }
});

window.setInterval(() => {
  void pollHoldGuarantee();
}, 12_000);

configureProofEvidence();
render("funded");
