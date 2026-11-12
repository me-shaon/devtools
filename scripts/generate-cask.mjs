import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { PRODUCT_NAME } from "./release-assets.mjs";

// Builds the Homebrew Cask definition (devtools.rb) from collected macOS release assets.
//
// Usage: node scripts/generate-cask.mjs <tag> [--assets <dir>] [--repo <owner/name>] [--out <file>]

function fail(message) {
  console.error(`Generate Homebrew Cask failed: ${message}`);
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

function computeSha256(filePath) {
  const fileBuffer = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(fileBuffer).digest("hex");
}

const tag = process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : process.env.GITHUB_REF_NAME;
if (!tag || !/^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(tag)) {
  fail(`Pass a release tag like v1.2.0. Received: ${tag ?? "nothing"}`);
}

const version = tag.replace(/^v/, "");
const assetsDir = path.resolve(readOption("assets", "release"));
const repo = readOption("repo", process.env.GITHUB_REPOSITORY ?? "me-shaon/devtools");
const outFile = path.resolve(readOption("out", path.join(assetsDir, "devtools.rb")));

if (!fs.existsSync(assetsDir)) {
  fail(`Assets directory not found: ${assetsDir}`);
}

const arm64DmgPath = path.join(assetsDir, `${PRODUCT_NAME}-macos-arm64.dmg`);
const x64DmgPath = path.join(assetsDir, `${PRODUCT_NAME}-macos-x64.dmg`);

if (!fs.existsSync(arm64DmgPath) || !fs.existsSync(x64DmgPath)) {
  fail(`Both macOS DMGs (${PRODUCT_NAME}-macos-arm64.dmg and ${PRODUCT_NAME}-macos-x64.dmg) must be present in ${assetsDir}.`);
}

const arm64Sha = computeSha256(arm64DmgPath);
const x64Sha = computeSha256(x64DmgPath);

const caskContent = `cask "devtools" do
  arch arm: "arm64", intel: "x64"

  version "${version}"
  sha256 arm:   "${arm64Sha}",
         intel: "${x64Sha}"

  url "https://github.com/${repo}/releases/download/v#{version}/${PRODUCT_NAME}-macos-#{arch}.dmg"
  name "DevTools"
  desc "Collection of developer utilities"
  homepage "https://github.com/${repo}"

  auto_updates true
  depends_on :macos

  app "${PRODUCT_NAME}.app"

  zap trash: [
    "~/Library/Application Support/com.meshaon.devtoolsapp",
    "~/Library/Caches/com.meshaon.devtoolsapp",
    "~/Library/Preferences/com.meshaon.devtoolsapp.plist",
    "~/Library/Saved Application State/com.meshaon.devtoolsapp.savedState",
    "~/Library/WebKit/com.meshaon.devtoolsapp",
  ]
end
`;

fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, caskContent, "utf8");

console.log(`Generated Homebrew Cask at ${outFile} for ${tag}:`);
console.log(`  arm64: ${arm64Sha}`);
console.log(`  intel: ${x64Sha}`);
