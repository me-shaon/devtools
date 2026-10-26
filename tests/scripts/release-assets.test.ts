// @vitest-environment node
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const rootDir = path.resolve(__dirname, "..", "..");
const collectScript = path.join(rootDir, "scripts", "collect-release-assets.mjs");
const manifestScript = path.join(rootDir, "scripts", "create-updater-manifest.mjs");

const tempDirs: string[] = [];

const makeTempDir = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "release-assets-"));
  tempDirs.push(dir);
  return dir;
};

const writeFile = (filePath: string, content = "data") => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
};

const run = (script: string, args: string[], cwd = rootDir) => {
  try {
    const stdout = execFileSync(process.execPath, [script, ...args], { cwd, encoding: "utf8", stdio: "pipe" });
    return { status: 0, output: stdout };
  } catch (error) {
    const failure = error as { status: number; stdout: string; stderr: string };
    return { status: failure.status, output: `${failure.stdout}${failure.stderr}` };
  }
};

afterEach(() => {
  tempDirs.splice(0).forEach((dir) => fs.rmSync(dir, { recursive: true, force: true }));
});

describe("collect-release-assets", () => {
  it("copies Linux bundles and signatures to the stable names", () => {
    const bundleDir = makeTempDir();
    const outDir = makeTempDir();
    writeFile(path.join(bundleDir, "appimage", "DevToolsApp_1.4.0_aarch64.AppImage"));
    writeFile(path.join(bundleDir, "appimage", "DevToolsApp_1.4.0_aarch64.AppImage.sig"), "sig");
    writeFile(path.join(bundleDir, "deb", "DevToolsApp_1.4.0_arm64.deb"));
    writeFile(path.join(bundleDir, "rpm", "DevToolsApp-1.4.0-1.aarch64.rpm"));

    const result = run(collectScript, [
      "--platform", "linux", "--arch", "arm64", "--bundle-dir", bundleDir, "--out", outDir,
    ]);

    expect(result.status).toBe(0);
    expect(fs.readdirSync(outDir).sort()).toEqual([
      "DevToolsApp-linux-aarch64.rpm",
      "DevToolsApp-linux-arm64.AppImage",
      "DevToolsApp-linux-arm64.AppImage.sig",
      "DevToolsApp-linux-arm64.deb",
    ]);
  });

  it("skips the optional macOS updater archive", () => {
    const bundleDir = makeTempDir();
    const outDir = makeTempDir();
    writeFile(path.join(bundleDir, "dmg", "DevToolsApp_1.4.0_x64.dmg"));

    const result = run(collectScript, [
      "--platform", "darwin", "--arch", "x64", "--bundle-dir", bundleDir, "--out", outDir,
    ]);

    expect(result.status).toBe(0);
    expect(fs.readdirSync(outDir)).toEqual(["DevToolsApp-macos-x64.dmg"]);
  });

  it("fails when a required bundle is missing", () => {
    const bundleDir = makeTempDir();
    fs.mkdirSync(path.join(bundleDir, "nsis"));

    const result = run(collectScript, [
      "--platform", "win32", "--arch", "x64", "--bundle-dir", bundleDir, "--out", makeTempDir(),
    ]);

    expect(result.status).toBe(1);
    expect(result.output).toContain("Missing -setup.exe bundle");
  });

  it("fails when a bundle folder has more than one match", () => {
    const bundleDir = makeTempDir();
    writeFile(path.join(bundleDir, "nsis", "DevToolsApp_1.3.0_x64-setup.exe"));
    writeFile(path.join(bundleDir, "nsis", "DevToolsApp_1.4.0_x64-setup.exe"));

    const result = run(collectScript, [
      "--platform", "win32", "--arch", "x64", "--bundle-dir", bundleDir, "--out", makeTempDir(),
    ]);

    expect(result.status).toBe(1);
    expect(result.output).toContain("more than one -setup.exe file");
  });
});

describe("create-updater-manifest", () => {
  const signedAssets = [
    "DevToolsApp-macos-x64.app.tar.gz",
    "DevToolsApp-macos-arm64.app.tar.gz",
    "DevToolsApp-windows-setup.exe",
    "DevToolsApp-linux-x86_64.AppImage",
    "DevToolsApp-linux-arm64.AppImage",
  ];

  const writeSignedAssets = (dir: string, names: string[]) => {
    names.forEach((name) => {
      writeFile(path.join(dir, name));
      writeFile(path.join(dir, `${name}.sig`), `sig-${name}\n`);
    });
  };

  it("writes latest.json with every required platform", () => {
    const assetsDir = makeTempDir();
    writeSignedAssets(assetsDir, signedAssets);

    const result = run(manifestScript, ["v1.4.0", "--assets", assetsDir, "--repo", "owner/repo"]);

    expect(result.status).toBe(0);
    const manifest = JSON.parse(fs.readFileSync(path.join(assetsDir, "latest.json"), "utf8"));
    expect(manifest.version).toBe("1.4.0");
    expect(Object.keys(manifest.platforms).sort()).toEqual([
      "darwin-aarch64",
      "darwin-x86_64",
      "linux-aarch64",
      "linux-x86_64",
      "windows-x86_64",
    ]);
    expect(manifest.platforms["windows-x86_64"]).toEqual({
      signature: "sig-DevToolsApp-windows-setup.exe",
      url: "https://github.com/owner/repo/releases/download/v1.4.0/DevToolsApp-windows-setup.exe",
    });
  });

  it("fails when a required platform has no signed asset", () => {
    const assetsDir = makeTempDir();
    writeSignedAssets(assetsDir, signedAssets.slice(1));

    const result = run(manifestScript, ["v1.4.0", "--assets", assetsDir]);

    expect(result.status).toBe(1);
    expect(result.output).toContain("Missing signed updater assets for: darwin-x86_64");
  });

  it("allows a partial manifest when asked", () => {
    const assetsDir = makeTempDir();
    writeSignedAssets(assetsDir, signedAssets.slice(1));

    const result = run(manifestScript, ["v1.4.0", "--assets", assetsDir, "--allow-partial"]);

    expect(result.status).toBe(0);
  });

  it("rejects an invalid tag", () => {
    const result = run(manifestScript, ["1.4.0", "--assets", makeTempDir()]);

    expect(result.status).toBe(1);
    expect(result.output).toContain("Pass a release tag like v1.2.0");
  });
});
