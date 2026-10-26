import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { remote } from "webdriverio";

// Drives the built desktop app through tauri-driver and checks the main flows.
// tauri-driver supports Linux (WebKitWebDriver) and Windows (msedgedriver).
//
// Usage: node e2e/smoke.mjs [path-to-app-binary]

const rootDir = path.resolve(import.meta.dirname, "..");
const binaryName = process.platform === "win32" ? "DevToolsApp.exe" : "DevToolsApp";
const application = path.resolve(
  process.argv[2] ?? path.join(rootDir, "src-tauri", "target", "release", binaryName),
);
const screenshotDir = path.join(rootDir, "e2e", "screenshots");
const expectedVersion = JSON.parse(fs.readFileSync(path.join(rootDir, "package.json"), "utf8")).version;
const tauriDriverPath =
  process.env.TAURI_DRIVER ??
  path.join(os.homedir(), ".cargo", "bin", process.platform === "win32" ? "tauri-driver.exe" : "tauri-driver");

if (!fs.existsSync(application)) {
  console.error(`App binary not found: ${application}`);
  process.exit(1);
}

fs.mkdirSync(screenshotDir, { recursive: true });

// On Windows, NATIVE_DRIVER points to an msedgedriver that matches the WebView2 version.
const driverArgs = process.env.NATIVE_DRIVER ? ["--native-driver", process.env.NATIVE_DRIVER] : [];
const tauriDriver = spawn(tauriDriverPath, driverArgs, { stdio: ["ignore", "inherit", "inherit"] });
let browser;

async function openTool(name) {
  const search = await browser.$('input[placeholder="Search..."]');
  await search.setValue(name);
  // The sidebar and the home page can both list the tool. Use the sidebar entry.
  const toolButton = await browser.$$(`button*=${name}`)[0];
  await toolButton.waitForClickable({ timeout: 10000 });
  await toolButton.click();
}

async function waitForText(element, text) {
  await browser.waitUntil(async () => (await element.getText()).includes(text), {
    timeout: 10000,
    timeoutMsg: `Text did not appear: ${text}`,
  });
}

async function step(name, run) {
  process.stdout.write(`- ${name} ... `);
  try {
    await run();
    console.log("ok");
  } catch (error) {
    console.log("FAILED");
    await browser?.saveScreenshot(path.join(screenshotDir, "failure.png")).catch(() => {});
    throw error;
  }
}

try {
  // Give tauri-driver a moment to start listening.
  await new Promise((resolve) => setTimeout(resolve, 1000));

  browser = await remote({
    hostname: "127.0.0.1",
    port: 4444,
    logLevel: "warn",
    capabilities: {
      browserName: "wry",
      "wdio:enforceWebDriverClassic": true,
      "tauri:options": { application },
    },
  });

  await step("shows What's New for the installed version through the Tauri API", async () => {
    const dialog = await browser.$('[role="dialog"]');
    await dialog.waitForDisplayed({ timeout: 20000 });
    await waitForText(dialog, `DevToolsApp v${expectedVersion}`);
    await browser.saveScreenshot(path.join(screenshotDir, "whats-new.png"));
    await (await browser.$("button=Got it")).click();
    await dialog.waitForDisplayed({ reverse: true, timeout: 5000 });
  });

  await step("shows the app version in the sidebar footer", async () => {
    await waitForText(await browser.$("body"), `Version v${expectedVersion}`);
    await browser.saveScreenshot(path.join(screenshotDir, "home.png"));
  });

  await step("generates a SHA-256 hash", async () => {
    await openTool("Hash Generator");
    const input = await browser.$('textarea[placeholder="Enter text to generate hashes..."]');
    await input.waitForDisplayed({ timeout: 10000 });
    await input.setValue("hello");
    const output = await browser.$('[placeholder="SHA-256 hash will appear here..."]');
    await browser.waitUntil(
      async () =>
        (await output.getValue()) === "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
      { timeout: 5000, timeoutMsg: "SHA-256 output did not match" },
    );
    await browser.saveScreenshot(path.join(screenshotDir, "hash-generator.png"));
  });

  await step("encodes text to Base64", async () => {
    await openTool("Base64");
    const input = await browser.$('textarea[placeholder="Enter text to encode to Base64..."]');
    await input.waitForDisplayed({ timeout: 10000 });
    await input.setValue("hello");
    await (await browser.$("button*=Encode to Base64")).click();
    await waitForText(await browser.$("body"), "aGVsbG8=");
    await browser.saveScreenshot(path.join(screenshotDir, "base64.png"));
  });

  await step("opens a tool from the command palette shortcut", async () => {
    await (await browser.$("body")).click();
    await browser.keys([process.platform === "darwin" ? "Meta" : "Control", "k"]);
    const paletteInput = await browser.$('input[placeholder="Search tools..."]');
    await paletteInput.waitForDisplayed({ timeout: 5000 });
    await paletteInput.setValue("UUID");
    await browser.keys("Enter");
    await (await browser.$("label=Count")).waitForDisplayed({ timeout: 10000 });
    await browser.saveScreenshot(path.join(screenshotDir, "command-palette.png"));
  });

  console.log("E2E smoke test passed.");
} finally {
  await browser?.deleteSession().catch(() => {});
  tauriDriver.kill();
}
