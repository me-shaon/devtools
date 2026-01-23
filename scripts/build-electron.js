import esbuild from "esbuild";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = resolve(__dirname, "..");

const isWatch = process.argv.includes("--watch");

async function build() {
  // Build main process as ESM
  const mainContext = await esbuild.context({
    entryPoints: [resolve(rootDir, "src-electron/main.ts")],
    bundle: true,
    platform: "node",
    target: "node20",
    format: "esm",
    outfile: resolve(rootDir, "dist-electron/main.js"),
    external: ["electron", "electron-updater"],
    logLevel: "info",
  });

  // Build preload script as CommonJS (Electron requires this)
  const preloadContext = await esbuild.context({
    entryPoints: [resolve(rootDir, "src-electron/preload.ts")],
    bundle: true,
    platform: "node",
    target: "node20",
    format: "cjs",
    outfile: resolve(rootDir, "dist-electron/preload.js"),
    external: ["electron"],
    logLevel: "info",
  });

  if (isWatch) {
    await mainContext.watch();
    await preloadContext.watch();
    console.log("Watching for changes...");
  } else {
    await mainContext.rebuild();
    await mainContext.dispose();
    await preloadContext.rebuild();
    await preloadContext.dispose();
    console.log("Build complete!");
  }
}

build().catch((err) => {
  console.error(err);
  process.exit(1);
});
