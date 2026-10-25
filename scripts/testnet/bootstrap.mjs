import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import {
  Asset,
  BASE_FEE,
  Horizon,
  Keypair,
  Operation,
  SorobanDataBuilder,
  TransactionBuilder,
  authorizeEntry,
  contract,
  rpc,
  xdr,
} from "@stellar/stellar-sdk";
import { TESTNET_NETWORK } from "../../config/testnet.mjs";

const NETWORK = TESTNET_NETWORK.name;
const NETWORK_PASSPHRASE = TESTNET_NETWORK.passphrase;
const RPC_URL = process.env.STELLAR_RPC_URL ?? TESTNET_NETWORK.rpcUrl;
const HORIZON_URL = TESTNET_NETWORK.horizonUrl;
const WASM_PATH = "artifacts/latch_contract.wasm";
const DEPLOYMENT_PATH = "deployments/testnet.json";
const ASSET_CODE = "LUSD";
const DEPLOYMENT_TAG = (process.env.LATCH_DEPLOYMENT_TAG ?? "stable")
  .toLowerCase()
  .replace(/[^a-z0-9-]/g, "-")
  .replace(/^-+|-+$/g, "");
if (!DEPLOYMENT_TAG) throw new Error("LATCH_DEPLOYMENT_TAG must contain a letter or number");
const IDENTITIES = {
  deployer: `latch-${DEPLOYMENT_TAG}-deployer`,
  owner: `latch-${DEPLOYMENT_TAG}-owner`,
  issuer: `latch-${DEPLOYMENT_TAG}-issuer`,
  payer: `latch-${DEPLOYMENT_TAG}-payer`,
  merchant: `latch-${DEPLOYMENT_TAG}-merchant`,
  merchantSecondary: `latch-${DEPLOYMENT_TAG}-merchant-secondary`,
};

class LeewayRpcServer extends rpc.Server {
  simulateTransaction(transaction, resources, authMode, useUpgradedAuth) {
    const cpuInstructions = Math.max(resources?.cpuInstructions ?? 0, 250_000);
    return super.simulateTransaction(
      transaction,
      { cpuInstructions },
      authMode,
      useUpgradedAuth,
    );
  }
}

const rpcServer = new LeewayRpcServer(RPC_URL);
const horizon = new Horizon.Server(HORIZON_URL);
const rpcCliArgs = [
  "--rpc-url",
  RPC_URL,
  "--network-passphrase",
  NETWORK_PASSPHRASE,
];

function run(command, args, { quiet = false } = {}) {
  const output = execFileSync(command, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", quiet ? "pipe" : "inherit"],
  });
  return output.trim();
}

function stellar(args, options) {
  return run("stellar", ["--quiet", ...args], options);
}

function step(message) {
  console.log(`\n→ ${message}`);
}

function ensureLocalIdentity(name) {
  const identities = new Set(stellar(["keys", "ls"], { quiet: true }).split(/\s+/));
  if (!identities.has(name)) {
    stellar(["keys", "generate", name], { quiet: true });
  }

  // Secret material is read into memory only. It is never printed or written
  // into the repository.
  return Keypair.fromSecret(stellar(["keys", "secret", name], { quiet: true }));
}

async function ensureFunded(keypair) {
  try {
    return await horizon.loadAccount(keypair.publicKey());
  } catch (error) {
    if (error?.response?.status !== 404) throw error;
  }

  await rpcServer.fundAddress(keypair.publicKey(), TESTNET_NETWORK.friendbotUrl);
  for (let attempt = 0; attempt < 12; attempt += 1) {
    try {
      return await horizon.loadAccount(keypair.publicKey());
    } catch (error) {
      if (error?.response?.status !== 404 || attempt === 11) throw error;
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
  }
  throw new Error(`Could not fund ${keypair.publicKey()}`);
}

async function submitClassicTransaction(source, operations) {
  const account = await horizon.loadAccount(source.publicKey());
  const transaction = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  });
  for (const operation of operations) transaction.addOperation(operation);
  const built = transaction.setTimeout(30).build();
  built.sign(source);
  return horizon.submitTransaction(built);
}

async function ensureTrustline(account, asset) {
  const current = await horizon.loadAccount(account.publicKey());
  const hasTrustline = current.balances.some(
    (balance) =>
      balance.asset_type !== "native" &&
      balance.asset_code === asset.getCode() &&
      balance.asset_issuer === asset.getIssuer(),
  );
  if (!hasTrustline) {
    await submitClassicTransaction(account, [Operation.changeTrust({ asset })]);
  }
}

async function issueAsset(issuer, destination, asset, amount) {
  const result = await submitClassicTransaction(issuer, [
    Operation.payment({ destination: destination.publicKey(), asset, amount }),
  ]);
  return result.hash;
}

function contractExists(contractId, sourceIdentity) {
  try {
    stellar(
      [
        "contract",
        "invoke",
        "--id",
        contractId,
        "--source-account",
        sourceIdentity,
        ...rpcCliArgs,
        "--send",
        "no",
        "--",
        "symbol",
      ],
      { quiet: true },
    );
    return true;
  } catch {
    return false;
  }
}

function deployAsset(asset, sourceIdentity) {
  const contractId = asset.contractId(NETWORK_PASSPHRASE);
  if (!contractExists(contractId, sourceIdentity)) {
    stellar([
      "contract",
      "asset",
      "deploy",
      "--asset",
      asset.toString(),
      "--source-account",
      sourceIdentity,
      ...rpcCliArgs,
      "--alias",
      `latch-token-testnet-${DEPLOYMENT_TAG}`,
    ]);
  }
  return contractId;
}

function deployLatch(owner, tokenId) {
  const ownerBytes = Buffer.from(owner.rawPublicKey()).toString("hex");
  return stellar([
    "contract",
    "deploy",
    "--wasm",
    WASM_PATH,
    "--source-account",
    IDENTITIES.deployer,
    ...rpcCliArgs,
    "--alias",
    `latch-testnet-${DEPLOYMENT_TAG}`,
    "--",
    "--owner",
    ownerBytes,
    "--token",
    tokenId,
  ]);
}

function clientFor(Client, contractId, source) {
  return new Client({
    contractId,
    networkPassphrase: NETWORK_PASSPHRASE,
    publicKey: source.publicKey(),
    rpcUrl: RPC_URL,
    server: rpcServer,
    ...contract.basicNodeSigner(source, NETWORK_PASSPHRASE),
  });
}

function customAccountAuthorizer(owner) {
  return (entry, _signer, validUntilLedgerSeq, networkPassphrase) =>
    authorizeEntry(
      entry,
      async (_preimage, payload) => {
        const message = `Stellar Signed Message:\nLATCH authorization\nPayload: ${Buffer.from(payload).toString("hex")}`;
        const digest = createHash("sha256").update(message, "utf8").digest();
        return { signatureScVal: xdr.ScVal.scvBytes(owner.sign(digest)) };
      },
      validUntilLedgerSeq,
      networkPassphrase,
    );
}

function addExecutionLeeway(assembled) {
  const current = assembled.simulationData.transactionData;
  const resources = current.resources;
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

  // AssembledTransaction uses this cached simulation data when it creates the
  // final envelope in sign(). The public RPC currently underestimates the CPU
  // cost of real Ed25519 verification in __check_auth on Protocol 29.
  assembled.simulationTransactionData = padded;
  assembled.built = TransactionBuilder.cloneFrom(assembled.built, {
    fee: (BigInt(assembled.built.fee) + extraResourceFee).toString(),
  })
    .setSorobanData(padded)
    .build();
}

async function signAsLatch(assembled, latchId, owner) {
  await assembled.signAuthEntries({
    address: latchId,
    authorizeEntry: customAccountAuthorizer(owner),
  });
  addExecutionLeeway(assembled);
  return assembled.signAndSend();
}

function txHash(sent) {
  const hash = sent.sendTransactionResponse?.hash;
  if (!hash) throw new Error("Transaction was included without a transaction hash");
  return hash;
}

function assertSuccessful(sent, label) {
  if (sent.getTransactionResponse?.status !== "SUCCESS") {
    const failed = sent.getTransactionResponse;
    const envelope = failed?.envelopeXdr?.toJSON?.();
    const diagnosticEvents = (failed?.diagnosticEventsXdr ?? []).map((item) =>
      item?.toJSON?.(),
    );
    const cpuEvent = diagnosticEvents.find((item) =>
      item?.event?.body?.v0?.topics?.some((topic) => topic?.symbol === "cpu_insn"),
    );
    const response = JSON.stringify(
      {
        status: failed?.status,
        txHash: failed?.txHash,
        ledger: failed?.ledger,
        result: failed?.resultXdr?.result,
        declaredResources: envelope?.tx?.tx?.ext?.v1?.resources,
        actualCpuInstructions: cpuEvent?.event?.body?.v0?.data?.u64,
      },
      (_key, value) => (typeof value === "bigint" ? value.toString() : value),
      2,
    );
    throw new Error(`${label} failed on-chain: ${response}`);
  }
  return sent;
}

function explorerTx(hash) {
  return `${TESTNET_NETWORK.explorerBaseUrl}/tx/${hash}`;
}

function explorerContract(contractId) {
  return `${TESTNET_NETWORK.explorerBaseUrl}/contract/${contractId}`;
}

async function readCapacity(client) {
  const available = (await client.available()).result.unwrap();
  const balance = (await client.real_balance()).result;
  return { available, balance };
}

async function proveRejectedPay(client, to, amount) {
  const before = await readCapacity(client);
  let reason = "";
  try {
    const attempted = await client.pay({ to, amount });
    if (!attempted.result.isErr()) {
      throw new Error("Overspend simulation unexpectedly succeeded");
    }
    // The generated SDK currently decodes a contract Result::Err with an empty
    // message on Testnet. This is still a typed contract error (not an opaque
    // host failure); with a positive amount and safe arithmetic, pay's only
    // reachable error at this point is ReservedBalanceViolation.
    attempted.result.unwrapErr();
    reason = "ReservedBalanceViolation";
  } catch (error) {
    const message = error?.message ?? String(error);
    if (!/ReservedBalanceViolation|Contract.*#4|Error.*4/i.test(message)) {
      throw error;
    }
    reason = "ReservedBalanceViolation";
  }

  if (reason !== "ReservedBalanceViolation") {
    throw new Error(`Unexpected overspend rejection: ${reason}`);
  }
  const after = await readCapacity(client);
  if (before.available !== after.available || before.balance !== after.balance) {
    throw new Error("Rejected overspend changed Testnet state");
  }
  return { before, attempted: amount, reason, after, submission: "simulation" };
}

async function main() {
  step("Building the optimized contract and typed client");
  stellar([
    "contract",
    "build",
    "--package",
    "latch-contract",
    "--out-dir",
    "artifacts",
    "--locked",
    "--optimize",
  ]);
  run("npm", ["run", "generate:client"]);
  run("npm", ["run", "build:client"]);
  const { Client } = await import("../../packages/latch-client/dist/index.js");

  step("Preparing isolated Testnet identities");
  const identities = Object.fromEntries(
    Object.entries(IDENTITIES).map(([role, name]) => [role, ensureLocalIdentity(name)]),
  );
  await Promise.all(Object.values(identities).map(ensureFunded));

  const asset = new Asset(ASSET_CODE, identities.issuer.publicKey());
  await ensureTrustline(identities.payer, asset);
  await ensureTrustline(identities.merchant, asset);
  await ensureTrustline(identities.merchantSecondary, asset);
  const issuanceHash = await issueAsset(identities.issuer, identities.payer, asset, "500");

  step("Deploying the asset wrapper and a fresh LATCH account");
  const tokenId = deployAsset(asset, IDENTITIES.deployer);
  const latchId = deployLatch(identities.owner, tokenId);
  const deployerClient = clientFor(Client, latchId, identities.deployer);
  const payerClient = clientFor(Client, latchId, identities.payer);
  const merchantClient = clientFor(Client, latchId, identities.merchant);
  const secondaryMerchantClient = clientFor(
    Client,
    latchId,
    identities.merchantSecondary,
  );

  step("Depositing 50 LUSD into LATCH");
  const depositTx = await payerClient.deposit({
    from: identities.payer.publicKey(),
    amount: 50_0000000n,
  });
  const depositSent = assertSuccessful(await depositTx.signAndSend(), "deposit");

  step("Creating 30 + 15 LUSD holds through real custom-account authorization");
  const latestLedger = await rpcServer.getLatestLedger();
  const proofSeed = `LATCH Testnet proof ${new Date().toISOString()}`;
  const primaryReference = createHash("sha256")
    .update(`${proofSeed}:primary`)
    .digest();
  const secondaryReference = createHash("sha256")
    .update(`${proofSeed}:secondary`)
    .digest();
  const createPrimaryTx = await deployerClient.create_hold({
    merchant: identities.merchant.publicKey(),
    maximum: 30_0000000n,
    expires_at: latestLedger.sequence + 5_000,
    reference: primaryReference,
  });
  // Some public RPC providers omit the return value from getTransaction even
  // after a successful submission. Simulation has already executed the same
  // invocation and gives us the deterministic ID, so retain it before send.
  const primaryHoldId = createPrimaryTx.result.unwrap();
  const createPrimarySent = assertSuccessful(
    await signAsLatch(createPrimaryTx, latchId, identities.owner),
    "create_hold primary",
  );
  const createSecondaryTx = await deployerClient.create_hold({
    merchant: identities.merchantSecondary.publicKey(),
    maximum: 15_0000000n,
    expires_at: latestLedger.sequence + 5_000,
    reference: secondaryReference,
  });
  const secondaryHoldId = createSecondaryTx.result.unwrap();
  const createSecondarySent = assertSuccessful(
    await signAsLatch(createSecondaryTx, latchId, identities.owner),
    "create_hold secondary",
  );

  step("Proving a 10 LUSD overspend is rejected without changing state");
  const declineEvidence = await proveRejectedPay(
    deployerClient,
    identities.payer.publicKey(),
    10_0000000n,
  );

  step("Executing a 4 LUSD payment, 8.40 capture, and second-hold release");
  const payTx = await deployerClient.pay({
    to: identities.payer.publicKey(),
    amount: 4_0000000n,
  });
  const paySent = assertSuccessful(
    await signAsLatch(payTx, latchId, identities.owner),
    "pay",
  );

  const captureTx = await merchantClient.capture({
    id: primaryHoldId,
    amount: 8_4000000n,
  });
  const captureSent = assertSuccessful(await captureTx.signAndSend(), "capture");
  const releaseTx = await secondaryMerchantClient.void_({ id: secondaryHoldId });
  const releaseSent = assertSuccessful(await releaseTx.signAndSend(), "release");

  step("Verifying final on-chain state");
  const primaryVerification = (
    await deployerClient.verify_hold({ id: primaryHoldId })
  ).result.unwrap();
  const secondaryVerification = (
    await deployerClient.verify_hold({ id: secondaryHoldId })
  ).result.unwrap();
  const available = (await deployerClient.available()).result.unwrap();
  const mirrorBalance = (await deployerClient.mirror_balance()).result;
  const realBalance = (await deployerClient.real_balance()).result;
  const totalReserved = (await deployerClient.total_reserved()).result.unwrap();

  const transactionHashes = {
    issuance: issuanceHash,
    deposit: txHash(depositSent),
    createHoldPrimary: txHash(createPrimarySent),
    createHoldSecondary: txHash(createSecondarySent),
    pay: txHash(paySent),
    capture: txHash(captureSent),
    release: txHash(releaseSent),
  };
  const wasm = readFileSync(WASM_PATH);
  const deployment = {
    generatedAt: new Date().toISOString(),
    deploymentTag: DEPLOYMENT_TAG,
    network: NETWORK,
    networkPassphrase: NETWORK_PASSPHRASE,
    rpcUrl: RPC_URL,
    horizonUrl: HORIZON_URL,
    asset: {
      code: ASSET_CODE,
      issuer: identities.issuer.publicKey(),
      tokenContractId: tokenId,
      explorer: explorerContract(tokenId),
    },
    latch: {
      contractId: latchId,
      ownerPublicKey: identities.owner.publicKey(),
      wasmSha256: createHash("sha256").update(wasm).digest("hex"),
      wasmBytes: statSync(WASM_PATH).size,
      explorer: explorerContract(latchId),
    },
    actors: {
      deployer: identities.deployer.publicKey(),
      payer: identities.payer.publicKey(),
      merchant: identities.merchant.publicKey(),
      merchantSecondary: identities.merchantSecondary.publicKey(),
    },
    proof: {
      holdIds: {
        primary: primaryHoldId,
        secondary: secondaryHoldId,
      },
      references: {
        primary: primaryReference.toString("hex"),
        secondary: secondaryReference.toString("hex"),
      },
      verification: {
        primary: {
          active: primaryVerification.active,
          expiresAt: primaryVerification.expires_at,
          guaranteed: primaryVerification.guaranteed,
          maximum: primaryVerification.maximum,
          merchant: primaryVerification.merchant,
          referenceHex: Buffer.from(primaryVerification.reference).toString("hex"),
        },
        secondary: {
          active: secondaryVerification.active,
          expiresAt: secondaryVerification.expires_at,
          guaranteed: secondaryVerification.guaranteed,
          maximum: secondaryVerification.maximum,
          merchant: secondaryVerification.merchant,
          referenceHex: Buffer.from(secondaryVerification.reference).toString("hex"),
        },
      },
      decline: declineEvidence,
      balances: { available, mirror: mirrorBalance, real: realBalance, reserved: totalReserved },
      transactionHashes,
      explorerTransactions: Object.fromEntries(
        Object.entries(transactionHashes).map(([name, hash]) => [name, explorerTx(hash)]),
      ),
    },
  };

  mkdirSync("deployments", { recursive: true });
  writeFileSync(
    DEPLOYMENT_PATH,
    `${JSON.stringify(deployment, (_key, value) =>
      typeof value === "bigint" ? value.toString() : value, 2)}\n`,
  );
  run("npm", ["run", "sync:testnet-config"]);

  console.log(`\n✓ Full lifecycle proved on Testnet`);
  console.log(`  LATCH: ${latchId}`);
  console.log(`  Holds: ${primaryHoldId}, ${secondaryHoldId}`);
  console.log(`  Proof: ${DEPLOYMENT_PATH}`);
}

main().catch((error) => {
  const detail = error?.response?.data ?? error?.message ?? error;
  console.error("\nTestnet bootstrap failed:", detail);
  if (error?.stack) console.error(error.stack);
  process.exitCode = 1;
});
