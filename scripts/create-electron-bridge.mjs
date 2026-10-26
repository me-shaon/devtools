import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { ELECTRON_BRIDGE_MANIFESTS } from "./release-assets.mjs";

// Writes the electron-updater manifests (latest.yml, latest-mac.yml, latest-linux*.yml)
// so that installs of the old Electron app (v1.3.0 and earlier) update to this Tauri release.
//
// Usage: node scripts/create-electron-bridge.mjs <tag> [--assets <dir>] [--allow-partial]
//
// Fails when an asset is missing, unless --allow-partial is set.

function fail(message) {
  console.error(`Create Electron bridge failed: ${message}`);
  process.exit(1);
}

function readOption(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) {
    return fallback;
  }

  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) {
    fail(`Missing value for --${name}.`);
  }

  return value;
}

const tag = process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : process.env.GITHUB_REF_NAME;
if (!tag || !/^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(tag)) {
  fail(`Pass a release tag like v1.2.0. Received: ${tag ?? "nothing"}`);
}

const assetsDir = path.resolve(readOption("assets", "release"));
const allowPartial = process.argv.includes("--allow-partial");
const releaseDate = new Date().toISOString();

function describeFile(name) {
  const filePath = path.join(assetsDir, name);
  if (!fs.existsSync(filePath)) {
    return null;
  }

  const content = fs.readFileSync(filePath);
  return {
    url: name,
    sha512: crypto.createHash("sha512").update(content).digest("base64"),
    size: content.length,
  };
}

let written = 0;

for (const [manifestName, assetNames] of Object.entries(ELECTRON_BRIDGE_MANIFESTS)) {
  const files = assetNames.map(describeFile);
  const missing = assetNames.filter((_, index) => !files[index]);

  if (missing.length > 0 && !allowPartial) {
    fail(`Missing assets for ${manifestName}: ${missing.join(", ")}`);
  }

  const present = files.filter(Boolean);
  if (present.length === 0) {
    continue;
  }

  // electron-updater reads the first file as the default download.
  const lines = [
    `version: ${tag.slice(1)}`,
    "files:",
    ...present.flatMap((file) => [
      `  - url: ${file.url}`,
      `    sha512: ${file.sha512}`,
      `    size: ${file.size}`,
    ]),
    `path: ${present[0].url}`,
    `sha512: ${present[0].sha512}`,
    `releaseDate: '${releaseDate}'`,
  ];

  fs.writeFileSync(path.join(assetsDir, manifestName), `${lines.join("\n")}\n`);
  console.log(`Wrote ${manifestName} with ${present.map((file) => file.url).join(", ")}`);
  written += 1;
}

if (written === 0) {
  fail(`No release assets found in ${assetsDir}.`);
}
