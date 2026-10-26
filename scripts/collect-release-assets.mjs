import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { getBundleRules } from "./release-assets.mjs";

// Copies Tauri bundles into one folder with the stable names from release-assets.mjs.
//
// Usage: node scripts/collect-release-assets.mjs --arch <x64|arm64> [--bundle-dir <dir>] [--out <dir>]

function fail(message) {
  console.error(`Collect release assets failed: ${message}`);
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

const arch = readOption("arch", process.arch === "arm64" ? "arm64" : "x64");
const bundleDir = path.resolve(readOption("bundle-dir", "src-tauri/target/release/bundle"));
const outDir = path.resolve(readOption("out", "release"));
const platform = readOption("platform", process.platform);

if (arch !== "x64" && arch !== "arm64") {
  fail(`Unsupported arch: ${arch}. Use x64 or arm64.`);
}

if (!fs.existsSync(bundleDir)) {
  fail(`Bundle directory not found: ${bundleDir}`);
}

const rules = getBundleRules(platform, arch);
if (!rules) {
  fail(`Unsupported platform: ${platform}`);
}

fs.mkdirSync(outDir, { recursive: true });

function findBundle(dir, suffix) {
  const fullDir = path.join(bundleDir, dir);
  if (!fs.existsSync(fullDir)) {
    return null;
  }

  const matches = fs.readdirSync(fullDir).filter((entry) => entry.endsWith(suffix));
  if (matches.length > 1) {
    fail(`Found more than one ${suffix} file in ${fullDir}: ${matches.join(", ")}`);
  }

  return matches.length === 1 ? path.join(fullDir, matches[0]) : null;
}

let copied = 0;

for (const rule of rules) {
  const source = findBundle(rule.dir, rule.suffix);
  if (!source) {
    if (rule.optional) {
      continue;
    }
    fail(`Missing ${rule.suffix} bundle in ${path.join(bundleDir, rule.dir)}`);
  }

  fs.copyFileSync(source, path.join(outDir, rule.name));
  console.log(`${path.relative(process.cwd(), source)} -> ${rule.name}`);
  copied += 1;

  const signature = `${source}.sig`;
  if (fs.existsSync(signature)) {
    fs.copyFileSync(signature, path.join(outDir, `${rule.name}.sig`));
    console.log(`${path.relative(process.cwd(), signature)} -> ${rule.name}.sig`);
  }
}

console.log(`Collected ${copied} release assets in ${path.relative(process.cwd(), outDir) || "."}`);
