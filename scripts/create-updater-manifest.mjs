import fs from "node:fs";
import path from "node:path";
import process from "node:process";

// Builds the Tauri updater manifest (latest.json) from collected release assets.
//
// Usage: node scripts/create-updater-manifest.mjs <tag> [--assets <dir>] [--repo <owner/name>] [--out <file>]

const PRODUCT_NAME = "DevToolsApp";

function fail(message) {
  console.error(`Create updater manifest failed: ${message}`);
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
const repo = readOption("repo", process.env.GITHUB_REPOSITORY ?? "me-shaon/devtools");
const outFile = path.resolve(readOption("out", path.join(assetsDir, "latest.json")));
const notesFile = path.resolve("release-notes", `${tag}.md`);

if (!fs.existsSync(assetsDir)) {
  fail(`Assets directory not found: ${assetsDir}`);
}

// Updater platform keys mapped to the stable asset names from collect-release-assets.mjs.
const PLATFORM_ASSETS = {
  "darwin-x86_64": `${PRODUCT_NAME}-macos-x64.app.tar.gz`,
  "darwin-aarch64": `${PRODUCT_NAME}-macos-arm64.app.tar.gz`,
  "windows-x86_64": `${PRODUCT_NAME}-windows-setup.exe`,
  "linux-x86_64": `${PRODUCT_NAME}-linux-x86_64.AppImage`,
  "linux-aarch64": `${PRODUCT_NAME}-linux-arm64.AppImage`,
  "linux-x86_64-deb": `${PRODUCT_NAME}-linux-amd64.deb`,
  "linux-aarch64-deb": `${PRODUCT_NAME}-linux-arm64.deb`,
  "linux-x86_64-rpm": `${PRODUCT_NAME}-linux-x86_64.rpm`,
  "linux-aarch64-rpm": `${PRODUCT_NAME}-linux-aarch64.rpm`,
};

const platforms = {};

for (const [platformKey, assetName] of Object.entries(PLATFORM_ASSETS)) {
  const signaturePath = path.join(assetsDir, `${assetName}.sig`);
  if (!fs.existsSync(path.join(assetsDir, assetName)) || !fs.existsSync(signaturePath)) {
    continue;
  }

  platforms[platformKey] = {
    signature: fs.readFileSync(signaturePath, "utf8").trim(),
    url: `https://github.com/${repo}/releases/download/${tag}/${assetName}`,
  };
}

if (Object.keys(platforms).length === 0) {
  fail(`No signed updater assets found in ${assetsDir}.`);
}

const manifest = {
  version: tag.slice(1),
  notes: fs.existsSync(notesFile) ? fs.readFileSync(notesFile, "utf8").trim() : "",
  pub_date: new Date().toISOString(),
  platforms,
};

fs.writeFileSync(outFile, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Wrote ${path.relative(process.cwd(), outFile)} with platforms: ${Object.keys(platforms).join(", ")}`);
