// In-app smoke test for platforms without a WebDriver for the system webview (macOS).
// The e2e build injects this script when DEVTOOLS_E2E_SELFTEST is set. The script drives
// the UI through the DOM and reports the result through the e2e_report command, which
// prints the log and exits the app with the test result.
(async () => {
  const invoke = (command, args) => window.__TAURI_INTERNALS__.invoke(command, args);
  const log = [];
  const errors = [];
  window.addEventListener("error", (event) => errors.push(String(event.message)));
  window.addEventListener("unhandledrejection", (event) => errors.push(String(event.reason)));

  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  async function waitFor(check, description, timeout = 15000) {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      const result = await check();
      if (result) {
        return result;
      }
      await delay(100);
    }
    throw new Error(`Timed out: ${description}`);
  }

  const text = (element = document.body) => element.innerText || "";
  const buttons = (label) =>
    [...document.querySelectorAll("button")].filter((button) => text(button).includes(label));

  function setValue(element, value) {
    const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, "value").set.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  }

  async function openTool(name) {
    setValue(document.querySelector('input[placeholder="Search..."]'), name);
    const button = await waitFor(() => buttons(name)[0], `tool button ${name}`);
    button.click();
    await waitFor(
      () => [...document.querySelectorAll("main h1")].some((heading) => text(heading) === name),
      `tool page ${name}`,
    );
  }

  async function step(name, run) {
    try {
      await run();
      log.push(`- ${name} ... ok`);
    } catch (error) {
      log.push(`- ${name} ... FAILED: ${error.message}`);
      throw error;
    }
  }

  const PNG_HEADER = "89504e47";
  const SAMPLE_PNG =
    "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg==";

  let passed = false;
  try {
    const version = await invoke("plugin:app|version");
    const isMac = navigator.platform.toLowerCase().includes("mac");

    await step("shows What's New for the installed version through the Tauri API", async () => {
      const dialog = await waitFor(() => document.querySelector('[role="dialog"]'), "What's New dialog", 20000);
      await waitFor(() => text(dialog).includes(`DevToolsApp v${version}`), "dialog version");
      buttons("Got it")[0].click();
      await waitFor(() => !document.querySelector('[role="dialog"]'), "dialog closes");
    });

    await step("shows the app version in the sidebar footer", async () => {
      await waitFor(() => text().includes(`Version v${version}`), "footer version");
    });

    await step("opens every tool", async () => {
      const toolNames = await invoke("e2e_tool_names");
      if (toolNames.length < 20) {
        throw new Error(`Expected the full tool list, found ${toolNames.length} tools`);
      }
      for (const name of toolNames) {
        await openTool(name);
        await waitFor(() => text(document.querySelector("main")).length > name.length + 20, `content of ${name}`);
      }
    });

    await step("generates a SHA-256 hash", async () => {
      await openTool("Hash Generator");
      setValue(document.querySelector('textarea[placeholder="Enter text to generate hashes..."]'), "hello");
      await waitFor(
        () =>
          document.querySelector('[placeholder="SHA-256 hash will appear here..."]').value ===
          "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
        "SHA-256 output",
      );
    });

    await step("encodes text to Base64", async () => {
      await openTool("Base64");
      setValue(document.querySelector('textarea[placeholder="Enter text to encode to Base64..."]'), "hello");
      buttons("Encode to Base64")[0].click();
      await waitFor(() => text().includes("aGVsbG8="), "Base64 output");
    });

    await step("formats JSON", async () => {
      await openTool("JSON Viewer");
      setValue(document.querySelector('textarea[placeholder="Paste your JSON here..."]'), '{"a":1,"b":[true]}');
      buttons("Format")[0].click();
      await waitFor(() => text(document.querySelector("main")).includes('"b": ['), "formatted JSON");
    });

    await step("saves a QR code PNG through the save_file command", async () => {
      await openTool("QR Generator");
      setValue(document.querySelector("#qr-text"), "https://example.com");
      (await waitFor(() => buttons("Download QR Code")[0], "download button")).click();
      await waitFor(async () => {
        const files = await invoke("e2e_saved_files");
        return files.some(([name, header]) => /^qr-code-\d+\.png$/.test(name) && header === PNG_HEADER);
      }, "saved QR code PNG");
    });

    await step("compresses and saves an image", async () => {
      await openTool("Image Converter");
      const bytes = Uint8Array.from(atob(SAMPLE_PNG), (char) => char.charCodeAt(0));
      const transfer = new DataTransfer();
      transfer.items.add(new File([bytes], "sample-image.png", { type: "image/png" }));
      const input = document.querySelector('input[type="file"]');
      input.files = transfer.files;
      input.dispatchEvent(new Event("change", { bubbles: true }));
      const download = await waitFor(
        () => buttons("Download Image").find((button) => !button.disabled),
        "image download button",
      );
      download.click();
      await waitFor(async () => {
        const files = await invoke("e2e_saved_files");
        return files.some(([name, header]) => name.startsWith("sample-image") && header === PNG_HEADER);
      }, "saved compressed image");
    });

    await step("toggles the theme", async () => {
      const before = document.documentElement.classList.contains("dark");
      buttons(before ? "Dark" : "Light")[0].click();
      await waitFor(() => document.documentElement.classList.contains("dark") !== before, "theme change");
    });

    await step("opens a tool from the command palette shortcut", async () => {
      document.body.focus();
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key: "k", metaKey: isMac, ctrlKey: !isMac, bubbles: true }),
      );
      const input = await waitFor(() => document.querySelector('input[placeholder="Search tools..."]'), "palette");
      setValue(input, "UUID");
      await delay(200);
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      await waitFor(
        () => [...document.querySelectorAll("label")].some((label) => text(label) === "Count"),
        "UUID Generator",
      );
    });

    await step("has no uncaught errors in the page", async () => {
      if (errors.length > 0) {
        throw new Error(errors.join(" | "));
      }
    });

    passed = true;
    log.push("E2E self-test passed.");
  } catch (error) {
    log.push(`E2E self-test failed: ${error.message}`);
  }

  await invoke("e2e_report", { passed, output: log.join("\n") });
})();
