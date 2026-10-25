import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const outputDirectory = "packages/latch-client";
const tsconfigPath = `${outputDirectory}/tsconfig.json`;
const packagePath = `${outputDirectory}/package.json`;

execFileSync(
  "stellar",
  [
    "contract",
    "bindings",
    "typescript",
    "--wasm",
    "artifacts/latch_contract.wasm",
    "--output-dir",
    outputDirectory,
    "--overwrite",
  ],
  { cwd: process.cwd(), stdio: "inherit" },
);

// The Stellar CLI template leaves rootDir commented out. TypeScript 7 requires
// an explicit rootDir when declarations are emitted outside the source tree.
const generatedTsconfig = readFileSync(tsconfigPath, "utf8");
const rootDirPattern = /^\s*\/\/\s*"rootDir":\s*"\.\/",.*$/m;

if (!rootDirPattern.test(generatedTsconfig)) {
  throw new Error(`Could not locate generated rootDir setting in ${tsconfigPath}`);
}

writeFileSync(
  tsconfigPath,
  generatedTsconfig.replace(rootDirPattern, '    "rootDir": "./src",'),
);

// Keep the generated workspace package on the repository's pinned toolchain.
// Otherwise the CLI template rewrites these to older, floating ranges and
// makes package-lock.json drift after every ABI regeneration.
const rootPackage = JSON.parse(readFileSync("package.json", "utf8"));
const generatedPackage = JSON.parse(readFileSync(packagePath, "utf8"));
generatedPackage.dependencies["@stellar/stellar-sdk"] =
  rootPackage.dependencies["@stellar/stellar-sdk"];
generatedPackage.dependencies.buffer = "6.0.3";
generatedPackage.devDependencies.typescript =
  rootPackage.devDependencies.typescript;
writeFileSync(packagePath, `${JSON.stringify(generatedPackage, null, 2)}\n`);
