import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  SCALE,
  amountToUnits,
  canonicalSnapshot,
  decodeRequest,
  encodeRequest,
  guaranteeState,
  nextReplayState,
  parseStoredLiveSession,
  shouldOfferRetry,
  type HoldRequestPayload,
} from "./demo-model";

describe("canonical judge lifecycle", () => {
  it("preserves state across the rejected ten-unit attempt", () => {
    expect(canonicalSnapshot("blocked")).toEqual(canonicalSnapshot("held"));
    expect(canonicalSnapshot("blocked").available).toBe(5n * SCALE);
  });

  it("keeps both holds backed after the safe four-unit payment", () => {
    expect(canonicalSnapshot("paid")).toEqual({
      balance: 46n * SCALE,
      reserved: 45n * SCALE,
      available: 1n * SCALE,
      received: 0n,
    });
  });

  it("captures 8.40, releases 21.60, then releases the second hold", () => {
    expect(canonicalSnapshot("captured")).toEqual({
      balance: 376_000_000n,
      reserved: 150_000_000n,
      available: 226_000_000n,
      received: 84_000_000n,
    });
    expect(canonicalSnapshot("released")).toEqual({
      balance: 376_000_000n,
      reserved: 0n,
      available: 376_000_000n,
      received: 84_000_000n,
    });
  });

  it("drives every replay control through the seven canonical states", () => {
    expect(nextReplayState("funded")).toBe("heldPrimary");
    expect(nextReplayState("heldPrimary")).toBe("held");
    expect(nextReplayState("held")).toBe("blocked");
    expect(nextReplayState("blocked")).toBe("paid");
    expect(nextReplayState("paid")).toBe("captured");
    expect(nextReplayState("captured")).toBe("released");
    expect(nextReplayState("released")).toBeNull();
  });
});

describe("live safety presentation", () => {
  it("never calls an inactive or unbacked hold guaranteed", () => {
    expect(guaranteeState(true, true)).toBe("guaranteed");
    expect(guaranteeState(true, false)).toBe("not-backed");
    expect(guaranteeState(false, true)).toBe("not-backed");
  });

  it("offers retry only for an understood safe failure", () => {
    expect(shouldOfferRetry(true, true, false)).toBe(true);
    expect(shouldOfferRetry(true, false, true)).toBe(true);
    expect(shouldOfferRetry(true, false, false)).toBe(false);
    expect(shouldOfferRetry(false, true, true)).toBe(false);
  });

  it("restores only structurally valid browser sessions", () => {
    const session = {
      contractId: "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAK3IM",
      holdId: "1",
      phase: "blocked",
      lastHash: "abc",
    };
    expect(parseStoredLiveSession(JSON.stringify(session))).toEqual(session);
    expect(parseStoredLiveSession('{"contractId":"bad","phase":"blocked"}')).toBeNull();
    expect(parseStoredLiveSession("not json")).toBeNull();
  });
});

describe("merchant hold requests", () => {
  const request: HoldRequestPayload = {
    version: 1,
    network: "testnet",
    asset: "LUSD",
    merchant: "GCXT7I4IOR2WVICIM62AZNEUL4WGMYSQBTQ5GEJ2POXAV5J7PWBZCDHF",
    merchantName: "Meridian Hotel",
    amount: "30.00",
    expiresInLedgers: 5_000,
    reference: "H-0001 · Meridian stay",
  };

  it("round-trips the exact QR payload", () => {
    expect(decodeRequest(encodeRequest(request))).toEqual(request);
  });

  it("rejects invalid or over-precision amounts", () => {
    expect(() => amountToUnits("0")).toThrow("greater than zero");
    expect(() => amountToUnits("1.00000001")).toThrow("at most 7");
  });

  it("rejects malformed request payloads", () => {
    const invalid = Buffer.from(JSON.stringify({ ...request, network: "public" })).toString(
      "base64url",
    );
    expect(() => decodeRequest(invalid)).toThrow("Invalid LATCH hold request payload");
  });
});

describe("critical responsive controls", () => {
  it("keeps judge, payer, merchant, retry, and QR actions in the shipped HTML", () => {
    const html = readFileSync("dist/index.html", "utf8");
    for (const id of [
      "run-button",
      "hold-button",
      "spend-button",
      "capture-button",
      "void-button",
      "retry-button",
      "generate-request",
      "approve-request",
      "decline-request",
    ]) {
      expect(html).toContain(`id="${id}"`);
    }
  });

  it("ships a mobile layout for the demo and evidence panels", () => {
    const css = readFileSync("dist/styles.css", "utf8");
    expect(css).toContain("@media (max-width: 760px)");
    expect(css).toContain(".demo-console { grid-template-columns: 1fr; }");
    expect(css).toContain(".decline-evidence { grid-template-columns: 1fr; }");
  });
});
