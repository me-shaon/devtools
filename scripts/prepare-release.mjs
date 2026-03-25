import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const cwd = process.cwd();

function fail(message) {
  console.error(`Release prepare failed: ${message}`);
  process.exit(1);
}

function normalizeVersion(input) {
  if (!input) {
    fail("Missing version. Pass a version like 1.2.0.");
  }

  const normalized = input.startsWith("v") ? input.slice(1) : input;
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(normalized)) {
    fail(`Invalid version format: ${input}`);
  }

  return normalized;
}

function updateJsonVersion(filePath, version, updateRootPackage = false) {
  const json = JSON.parse(fs.readFileSync(filePath, "utf8"));
  json.version = version;

  if (updateRootPackage && json.packages?.[""]) {
    json.packages[""].version = version;
  }

  fs.writeFileSync(filePath, `${JSON.stringify(json, null, 2)}\n`);
}

const version = normalizeVersion(process.argv[2]);
const tag = `v${version}`;

updateJsonVersion(path.join(cwd, "package.json"), version);
updateJsonVersion(path.join(cwd, "package-lock.json"), version, true);

const releaseNotesDir = path.join(cwd, "release-notes");
const releaseNotesPath = path.join(releaseNotesDir, `${tag}.md`);

fs.mkdirSync(releaseNotesDir, { recursive: true });

if (!fs.existsSync(releaseNotesPath)) {
  const template = `# DevToolsApp ${tag}

## Highlights

- Add 2 to 4 user-facing highlights here.

## Tool Improvements

- List important tool changes here.

## App Updates

- List platform, UX, packaging, or updater changes here.
`;
  fs.writeFileSync(releaseNotesPath, template);
}

console.log(`Prepared release ${tag}`);
console.log("");
console.log("Next steps:");
console.log(`1. Review package.json and package-lock.json version ${version}.`);
console.log(`2. Edit release-notes/${tag}.md with human-readable release notes.`);
console.log(`3. Run: npm run release:check -- ${tag}`);
console.log(`4. Commit, tag ${tag}, and push.`);
