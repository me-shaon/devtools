import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { remote } from "webdriverio";

// Drives an e2e build of the desktop app and checks the main flows.
//
// Linux: starts the app through tauri-driver and WebKitWebDriver. CI runs it under xvfb.
// Windows: starts the app with a WebView2 debugging port and attaches msedgedriver to it.
//   Set NATIVE_DRIVER to an msedgedriver.exe that matches the WebView2 version.
//
// Build the app with the e2e feature first, so file saves skip the native dialog:
//   npx tauri build --no-bundle --features e2e   (Windows: add --config e2e/tauri.e2e.conf.json)
//
// Usage: node e2e/smoke.mjs [path-to-app-binary]

const isWindows = process.platform === "win32";
const rootDir = path.resolve(import.meta.dirname, "..");
const application = path.resolve(
  process.argv[2] ??
    path.join(rootDir, "src-tauri", "target", "release", isWindows ? "DevToolsApp.exe" : "DevToolsApp"),
);
const screenshotDir = path.join(rootDir, "e2e", "screenshots");
const saveDir = fs.mkdtempSync(path.join(os.tmpdir(), "devtools-e2e-saves-"));
const expectedVersion = JSON.parse(fs.readFileSync(path.join(rootDir, "package.json"), "utf8")).version;
const toolNames = [
  ...fs.readFileSync(path.join(rootDir, "src", "app", "toolRegistry.ts"), "utf8").matchAll(/name: "([^"]+)"/g),
].map((match) => match[1]);

// WebView2 debugging port. It must match additionalBrowserArgs in e2e/tauri.e2e.conf.json.
const WEBVIEW2_DEBUG_PORT = 9222;

if (!fs.existsSync(application)) {
  console.error(`App binary not found: ${application}`);
  process.exit(1);
}

fs.mkdirSync(screenshotDir, { recursive: true });

const children = [];
let browser;

function startProcess(command, args, env = {}) {
  const child = spawn(command, args, {
    stdio: ["ignore", "inherit", "inherit"],
    env: { ...process.env, DEVTOOLS_E2E_SAVE_DIR: saveDir, ...env },
  });
  children.push(child);
  return child;
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function startSession() {
  if (isWindows) {
    startProcess(application, []);
    startProcess(process.env.NATIVE_DRIVER ?? "msedgedriver.exe", ["--port=4444"]);
    await delay(5000);
    return remote({
      hostname: "127.0.0.1",
      port: 4444,
      logLevel: "warn",
      capabilities: {
        browserName: "webview2",
        "wdio:enforceWebDriverClassic": true,
        "ms:edgeOptions": { debuggerAddress: `localhost:${WEBVIEW2_DEBUG_PORT}` },
      },
    });
  }

  startProcess(process.env.TAURI_DRIVER ?? path.join(os.homedir(), ".cargo", "bin", "tauri-driver"), []);
  await delay(1000);
  return remote({
    hostname: "127.0.0.1",
    port: 4444,
    logLevel: "warn",
    capabilities: {
      browserName: "wry",
      "wdio:enforceWebDriverClassic": true,
      "tauri:options": { application },
    },
  });
}

async function openTool(name) {
  const search = await browser.$('input[placeholder="Search..."]');
  await search.setValue(name);
  // The sidebar and the home page can both list the tool. Use the sidebar entry.
  const toolButton = await browser.$$(`button*=${name}`)[0];
  await toolButton.waitForClickable({ timeout: 10000 });
  await toolButton.click();
  await browser.waitUntil(async () => {
    // App tool tabs have ids that start with "tab-". Tools can contain their own tabs.
    const selected = await browser.$('[role="tab"][aria-selected="true"][id^="tab-"]');
    return await selected.isExisting() && (await selected.getText()) === name;
  }, { timeout: 10000, timeoutMsg: `Tool page did not open: ${name}` });
  await browser.$('section[role="tabpanel"]:not([hidden])').waitForDisplayed();
}

async function waitForText(element, text) {
  await browser.waitUntil(async () => (await element.getText()).includes(text), {
    timeout: 10000,
    timeoutMsg: `Text did not appear: ${text}`,
  });
}

async function waitForSavedFile(pattern) {
  let match;
  await browser.waitUntil(
    async () => {
      match = fs.readdirSync(saveDir).find((name) => pattern.test(name));
      return Boolean(match) && fs.statSync(path.join(saveDir, match)).size > 0;
    },
    { timeout: 15000, timeoutMsg: `No saved file matched ${pattern}` },
  );
  return fs.readFileSync(path.join(saveDir, match));
}

async function uploadFile(inputSelector, filePath) {
  // File inputs in the app are hidden behind buttons. Show the input so WebDriver can use it.
  await browser.execute((selector) => {
    const input = document.querySelector(selector);
    input.classList.remove("hidden");
    input.style.display = "block";
  }, inputSelector);
  await (await browser.$(inputSelector)).addValue(filePath);
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

// A 2x2 PNG for the image converter.
const SAMPLE_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg==",
  "base64",
);
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

try {
  browser = await startSession();

  await step("records uncaught errors in the page", async () => {
    await browser.execute(() => {
      window.__e2eErrors = [];
      window.addEventListener("error", (event) => window.__e2eErrors.push(String(event.message)));
      window.addEventListener("unhandledrejection", (event) =>
        window.__e2eErrors.push(String(event.reason)),
      );
    });
  });

  await step("shows What's New for the installed version through the Tauri API", async () => {
    const dialog = await browser.$('[role="dialog"]');
    await dialog.waitForDisplayed({ timeout: 20000 });
    await waitForText(dialog, `DevTools v${expectedVersion}`);
    await browser.saveScreenshot(path.join(screenshotDir, "whats-new.png"));
    await (await browser.$("button=Got it")).click();
    await dialog.waitForDisplayed({ reverse: true, timeout: 5000 });
  });

  await step("shows the app version in the sidebar footer", async () => {
    await waitForText(await browser.$("body"), `Version v${expectedVersion}`);
    await browser.saveScreenshot(path.join(screenshotDir, "home.png"));
  });

  await step(`opens all ${toolNames.length} tools`, async () => {
    if (toolNames.length < 20) {
      throw new Error(`Expected the full tool list, found ${toolNames.length} tools.`);
    }

    for (const name of toolNames) {
      await openTool(name);
      // Each lazy-loaded tool renders its own content below the page title.
      await browser.waitUntil(
        async () => (await (await browser.$("main")).getText()).length > name.length + 20,
        { timeout: 10000, timeoutMsg: `Tool content did not render: ${name}` },
      );
    }
  });

  await step("generates a SHA-256 hash", async () => {
    await openTool("Hash Generator");
    const input = await browser.$('textarea[placeholder="Enter text to generate hashes..."]');
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
    await (await browser.$('textarea[placeholder="Enter text to encode to Base64..."]')).setValue("hello");
    await (await browser.$("button*=Encode to Base64")).click();
    await waitForText(await browser.$("body"), "aGVsbG8=");
  });

  await step("formats JSON", async () => {
    await openTool("JSON Viewer");
    await (await browser.$('#json-workspace-input')).setValue('{"a":1,"b":[true]}');
    // Text selectors cannot follow a CSS selector, so find the visible panel first.
    await (await browser.$("section.tool-panel:not([hidden])").$("button=Format")).click();
    await waitForText(await browser.$("main"), '"b": [');
  });

  await step("saves a QR code PNG through the save_file command", async () => {
    await openTool("QR Generator");
    await (await browser.$("#qr-text")).setValue("https://example.com");
    await (await browser.$("button*=Download QR Code")).click();
    const png = await waitForSavedFile(/^qr-code-\d+\.png$/);
    if (!png.subarray(0, 4).equals(PNG_SIGNATURE)) {
      throw new Error("The saved QR code is not a PNG file.");
    }
  });

  await step("compresses and saves an image", async () => {
    const samplePath = path.join(saveDir, "..", `sample-${Date.now()}.png`);
    fs.writeFileSync(samplePath, SAMPLE_PNG);
    await openTool("Image Converter");
    await uploadFile('input[type="file"]', samplePath);
    const download = await browser.$("button*=Download Image");
    await download.waitForClickable({ timeout: 15000 });
    await download.click();
    const image = await waitForSavedFile(new RegExp(`^sample-\\d+.*\\.png$`));
    if (!image.subarray(0, 4).equals(PNG_SIGNATURE)) {
      throw new Error("The saved image is not a PNG file.");
    }
    await browser.saveScreenshot(path.join(screenshotDir, "image-converter.png"));
  });

  await step("toggles the theme", async () => {
    const isDark = () => browser.execute(() => document.documentElement.classList.contains("dark"));
    const before = await isDark();
    await (await browser.$(`button*=${before ? "Dark" : "Light"}`)).click();
    await browser.waitUntil(async () => (await isDark()) !== before, {
      timeout: 5000,
      timeoutMsg: "The theme did not change",
    });
  });

  await step("opens a tool from the command palette shortcut", async () => {
    await (await browser.$("body")).click();
    await browser.keys(["Control", "k"]);
    const paletteInput = await browser.$('input[placeholder="Search tools..."]');
    await paletteInput.waitForDisplayed({ timeout: 5000 });
    await paletteInput.setValue("UUID");
    await browser.keys("Enter");
    await (await browser.$("label=Count")).waitForDisplayed({ timeout: 10000 });
    await browser.saveScreenshot(path.join(screenshotDir, "command-palette.png"));
  });

  await step("has no uncaught errors in the page", async () => {
    const errors = await browser.execute(() => window.__e2eErrors);
    if (errors.length > 0) {
      throw new Error(`Uncaught errors: ${errors.join(" | ")}`);
    }
  });

  console.log("E2E smoke test passed.");
} finally {
  await browser?.deleteSession().catch(() => {});
  children.forEach((child) => child.kill());
}
