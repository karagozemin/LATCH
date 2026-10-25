import { Buffer } from "buffer";

export const SCALE = 10_000_000n;

export type DemoState =
  | "funded"
  | "heldPrimary"
  | "held"
  | "blocked"
  | "paid"
  | "captured"
  | "released";

export interface HoldRequestPayload {
  version: 1;
  network: "testnet";
  asset: "LUSD" | "XLM";
  merchant: string;
  merchantName: string;
  amount: string;
  expiresInLedgers: number;
  reference: string;
}

export interface SettlementPayload {
  version: 1;
  network: "testnet";
  asset: "XLM";
  contractId: string;
  holdId: string;
  merchant: string;
  merchantName: string;
  amount: string;
  expiresAt: number;
  reference: string;
  requestId: string;
}

export interface ReplaySnapshot {
  balance: bigint;
  reserved: bigint;
  available: bigint;
  received: bigint;
}

export interface DeclineEvidence {
  beforeAvailable: number;
  beforeBalance: number;
  attempted: number;
  afterAvailable: number;
  afterBalance: number;
  kind: "simulation";
}

export interface StoredLiveSession {
  contractId: string;
  holdId?: string;
  phase: DemoState;
  lastHash?: string;
  declineEvidence?: DeclineEvidence;
}

export const REPLAY_SEQUENCE: readonly DemoState[] = [
  "funded",
  "heldPrimary",
  "held",
  "blocked",
  "paid",
  "captured",
  "released",
];

const whole = (value: bigint) => value * SCALE;

const REPLAY: Record<DemoState, ReplaySnapshot> = {
  funded: { balance: whole(50n), reserved: 0n, available: whole(50n), received: 0n },
  heldPrimary: {
    balance: whole(50n),
    reserved: whole(30n),
    available: whole(20n),
    received: 0n,
  },
  held: {
    balance: whole(50n),
    reserved: whole(45n),
    available: whole(5n),
    received: 0n,
  },
  blocked: {
    balance: whole(50n),
    reserved: whole(45n),
    available: whole(5n),
    received: 0n,
  },
  paid: {
    balance: whole(46n),
    reserved: whole(45n),
    available: whole(1n),
    received: 0n,
  },
  captured: {
    balance: 376_000_000n,
    reserved: 150_000_000n,
    available: 226_000_000n,
    received: 84_000_000n,
  },
  released: {
    balance: 376_000_000n,
    reserved: 0n,
    available: 376_000_000n,
    received: 84_000_000n,
  },
};

export function canonicalSnapshot(state: DemoState): ReplaySnapshot {
  return { ...REPLAY[state] };
}

export function nextReplayState(state: DemoState) {
  const index = REPLAY_SEQUENCE.indexOf(state);
  return index >= 0 ? (REPLAY_SEQUENCE[index + 1] ?? null) : null;
}

export function guaranteeState(active: boolean, guaranteed: boolean) {
  return active && guaranteed ? "guaranteed" : "not-backed";
}

export function shouldOfferRetry(
  hasPendingAction: boolean,
  transactionSafeToRetry: boolean,
  walletRejected: boolean,
) {
  return hasPendingAction && (transactionSafeToRetry || walletRejected);
}

export function parseStoredLiveSession(raw: string): StoredLiveSession | null {
  try {
    const value = JSON.parse(raw);
    if (
      typeof value?.contractId !== "string" ||
      !value.contractId.startsWith("C") ||
      !REPLAY_SEQUENCE.includes(value?.phase) ||
      (value.holdId !== undefined && typeof value.holdId !== "string") ||
      (value.lastHash !== undefined && typeof value.lastHash !== "string")
    ) {
      return null;
    }
    return value as StoredLiveSession;
  } catch {
    return null;
  }
}

export function amountToUnits(value: string) {
  const normalized = value.trim();
  if (!/^\d+(?:\.\d{1,7})?$/.test(normalized)) {
    throw new Error("Amount must be positive with at most 7 decimal places");
  }
  const [whole, fraction = ""] = normalized.split(".");
  const result = BigInt(whole) * SCALE + BigInt(fraction.padEnd(7, "0"));
  if (result <= 0n) throw new Error("Amount must be greater than zero");
  return result;
}

function toBase64Url(value: string) {
  return Buffer.from(value, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function fromBase64Url(value: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("Invalid Base64URL payload");
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  return Buffer.from(padded, "base64").toString("utf8");
}

export function encodeRequest(payload: HoldRequestPayload) {
  return toBase64Url(JSON.stringify(payload));
}

export function decodeRequest(encoded: string): HoldRequestPayload {
  const payload = JSON.parse(fromBase64Url(encoded));
  if (
    payload?.version !== 1 ||
    payload?.network !== "testnet" ||
    !["LUSD", "XLM"].includes(payload?.asset) ||
    typeof payload?.merchant !== "string" ||
    typeof payload?.merchantName !== "string" ||
    typeof payload?.amount !== "string" ||
    typeof payload?.expiresInLedgers !== "number" ||
    typeof payload?.reference !== "string"
  ) {
    throw new Error("Invalid LATCH hold request payload");
  }
  amountToUnits(payload.amount);
  return payload as HoldRequestPayload;
}

export function encodeSettlement(payload: SettlementPayload) {
  return toBase64Url(JSON.stringify(payload));
}

export function decodeSettlement(encoded: string): SettlementPayload {
  const payload = JSON.parse(fromBase64Url(encoded));
  if (
    payload?.version !== 1 ||
    payload?.network !== "testnet" ||
    payload?.asset !== "XLM" ||
    typeof payload?.contractId !== "string" ||
    !/^C[A-Z2-7]{55}$/.test(payload.contractId) ||
    typeof payload?.holdId !== "string" ||
    !/^[1-9]\d*$/.test(payload.holdId) ||
    typeof payload?.merchant !== "string" ||
    !/^G[A-Z2-7]{55}$/.test(payload.merchant) ||
    typeof payload?.merchantName !== "string" ||
    typeof payload?.amount !== "string" ||
    typeof payload?.expiresAt !== "number" ||
    !Number.isSafeInteger(payload.expiresAt) ||
    payload.expiresAt <= 0 ||
    typeof payload?.reference !== "string" ||
    typeof payload?.requestId !== "string" ||
    !/^[a-f0-9]{64}$/.test(payload.requestId)
  ) {
    throw new Error("Invalid LATCH settlement payload");
  }
  amountToUnits(payload.amount);
  return payload as SettlementPayload;
}
