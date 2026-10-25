import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

const sourceDirectory = "packages/latch-client/dist";
const vendorDirectory = "sites/latch-demo/vendor/latch-client";
const generatedPackage = JSON.parse(
  readFileSync("packages/latch-client/package.json", "utf8"),
);

mkdirSync(`${vendorDirectory}/dist`, { recursive: true });
cpSync(sourceDirectory, `${vendorDirectory}/dist`, { recursive: true });
writeFileSync(
  `${vendorDirectory}/package.json`,
  `${JSON.stringify(
    {
      name: generatedPackage.name,
      version: generatedPackage.version,
      type: generatedPackage.type,
      exports: generatedPackage.exports,
      typings: generatedPackage.typings,
      dependencies: generatedPackage.dependencies,
    },
    null,
    2,
  )}\n`,
);
