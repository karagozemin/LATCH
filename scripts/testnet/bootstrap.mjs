import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import {
  Asset,
  BASE_FEE,
  Horizon,
  Keypair,
  Networks,
  Operation,
  SorobanDataBuilder,
  TransactionBuilder,
  authorizeEntry,
  contract,
  rpc,
  xdr,
} from "@stellar/stellar-sdk";

const NETWORK = "testnet";
const NETWORK_PASSPHRASE = Networks.TESTNET;
const RPC_URL =
  process.env.STELLAR_RPC_URL ?? "https://soroban-rpc.testnet.stellar.gateway.fm";
const HORIZON_URL = "https://horizon-testnet.stellar.org";
const WASM_PATH = "artifacts/latch_contract.wasm";
const DEPLOYMENT_PATH = "deployments/testnet.json";
const ASSET_CODE = "LUSD";
const IDENTITIES = {
  deployer: "latch-deployer",
  owner: "latch-owner",
  issuer: "latch-issuer",
  payer: "latch-payer",
  merchant: "latch-merchant",
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

  await rpcServer.fundAddress(keypair.publicKey());
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
      "latch-token-testnet",
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
    "latch-testnet",
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
      async (_preimage, payload) => ({
        signatureScVal: xdr.ScVal.scvBytes(owner.sign(payload)),
      }),
      validUntilLedgerSeq,
      networkPassphrase,
    );
}

function addExecutionLeeway(assembled) {
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
  return `https://stellar.expert/explorer/testnet/tx/${hash}`;
}

function explorerContract(contractId) {
  return `https://stellar.expert/explorer/testnet/contract/${contractId}`;
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
  const issuanceHash = await issueAsset(identities.issuer, identities.payer, asset, "500");

  step("Deploying the asset wrapper and a fresh LATCH account");
  const tokenId = deployAsset(asset, IDENTITIES.deployer);
  const latchId = deployLatch(identities.owner, tokenId);
  const deployerClient = clientFor(Client, latchId, identities.deployer);
  const payerClient = clientFor(Client, latchId, identities.payer);
  const merchantClient = clientFor(Client, latchId, identities.merchant);

  step("Depositing 50 LUSD into LATCH");
  const depositTx = await payerClient.deposit({
    from: identities.payer.publicKey(),
    amount: 50_0000000n,
  });
  const depositSent = assertSuccessful(await depositTx.signAndSend(), "deposit");

  step("Creating a 30 LUSD hold through real custom-account authorization");
  const latestLedger = await rpcServer.getLatestLedger();
  const reference = createHash("sha256")
    .update(`LATCH Testnet proof ${new Date().toISOString()}`)
    .digest();
  const createTx = await deployerClient.create_hold({
    merchant: identities.merchant.publicKey(),
    maximum: 30_0000000n,
    expires_at: latestLedger.sequence + 5_000,
    reference,
  });
  // Some public RPC providers omit the return value from getTransaction even
  // after a successful submission. Simulation has already executed the same
  // invocation and gives us the deterministic ID, so retain it before send.
  const holdId = createTx.result.unwrap();
  const createSent = assertSuccessful(
    await signAsLatch(createTx, latchId, identities.owner),
    "create_hold",
  );

  step("Executing a direct owner-authorized payment and merchant capture");
  const payTx = await deployerClient.pay({
    to: identities.payer.publicKey(),
    amount: 5_0000000n,
  });
  const paySent = assertSuccessful(
    await signAsLatch(payTx, latchId, identities.owner),
    "pay",
  );

  const captureTx = await merchantClient.capture({
    id: holdId,
    amount: 8_0000000n,
  });
  const captureSent = assertSuccessful(await captureTx.signAndSend(), "capture");

  step("Verifying final on-chain state");
  const verification = (await deployerClient.verify_hold({ id: holdId })).result.unwrap();
  const available = (await deployerClient.available()).result.unwrap();
  const mirrorBalance = (await deployerClient.mirror_balance()).result;
  const realBalance = (await deployerClient.real_balance()).result;
  const totalReserved = (await deployerClient.total_reserved()).result.unwrap();

  const transactionHashes = {
    issuance: issuanceHash,
    deposit: txHash(depositSent),
    createHold: txHash(createSent),
    pay: txHash(paySent),
    capture: txHash(captureSent),
  };
  const deployment = {
    generatedAt: new Date().toISOString(),
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
      explorer: explorerContract(latchId),
    },
    actors: {
      deployer: identities.deployer.publicKey(),
      payer: identities.payer.publicKey(),
      merchant: identities.merchant.publicKey(),
    },
    proof: {
      holdId,
      referenceHex: reference.toString("hex"),
      verification: {
        active: verification.active,
        expiresAt: verification.expires_at,
        guaranteed: verification.guaranteed,
        maximum: verification.maximum,
        merchant: verification.merchant,
        referenceHex: Buffer.from(verification.reference).toString("hex"),
      },
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

  console.log(`\n✓ Full lifecycle proved on Testnet`);
  console.log(`  LATCH: ${latchId}`);
  console.log(`  Hold:  ${holdId}`);
  console.log(`  Proof: ${DEPLOYMENT_PATH}`);
}

main().catch((error) => {
  const detail = error?.response?.data ?? error?.message ?? error;
  console.error("\nTestnet bootstrap failed:", detail);
  if (error?.stack) console.error(error.stack);
  process.exitCode = 1;
});
