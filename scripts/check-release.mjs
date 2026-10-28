import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const cwd = process.cwd();

function fail(message) {
  console.error(`Release check failed: ${message}`);
  process.exit(1);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function normalizeVersion(input) {
  if (!input) {
    fail("Missing version or tag. Pass a version like 1.1.0 or a tag like v1.1.0.");
  }

  const normalized = input.startsWith("v") ? input.slice(1) : input;
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(normalized)) {
    fail(`Invalid version format: ${input}`);
  }

  return normalized;
}

const rawInput = process.argv[2] ?? process.env.RELEASE_VERSION ?? process.env.GITHUB_REF_NAME;
const version = normalizeVersion(rawInput);
const tag = `v${version}`;

const packageJsonPath = path.join(cwd, "package.json");
const cargoTomlPath = path.join(cwd, "src-tauri", "Cargo.toml");
const releaseNotesPath = path.join(cwd, "release-notes", `${tag}.md`);

if (!fs.existsSync(packageJsonPath)) {
  fail("package.json not found.");
}

if (!fs.existsSync(releaseNotesPath)) {
  fail(`Missing release notes file: release-notes/${tag}.md`);
}

const packageJson = readJson(packageJsonPath);

if (packageJson.version !== version) {
  fail(`package.json version is ${packageJson.version}, expected ${version}.`);
}

if (!fs.existsSync(cargoTomlPath)) {
  fail("src-tauri/Cargo.toml not found.");
}

const cargoVersion = fs
  .readFileSync(cargoTomlPath, "utf8")
  .match(/^\[package\][\s\S]*?^version = "([^"]*)"/m)?.[1];
if (cargoVersion !== version) {
  fail(`src-tauri/Cargo.toml version is ${cargoVersion}, expected ${version}.`);
}

const releaseNotes = fs.readFileSync(releaseNotesPath, "utf8").trim();
if (!releaseNotes) {
  fail(`release-notes/${tag}.md is empty.`);
}

if (/TODO|TBD|coming soon/i.test(releaseNotes)) {
  fail(`release-notes/${tag}.md still contains placeholder text.`);
}

console.log(`Release check passed for ${tag}`);
