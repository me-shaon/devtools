import esbuild from "esbuild";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = resolve(__dirname, "..");

const isWatch = process.argv.includes("--watch");

async function build() {
  const context = await esbuild.context({
    entryPoints: [
      resolve(rootDir, "src-electron/main.ts"),
      resolve(rootDir, "src-electron/preload.ts"),
    ],
    bundle: true,
    platform: "node",
    target: "node20",
    format: "esm",
    outdir: resolve(rootDir, "dist-electron"),
    outExtension: { ".js": ".mjs" },
    external: [
      "electron",
      "electron-updater",
    ],
    logLevel: "info",
  });

  if (isWatch) {
    await context.watch();
    console.log("Watching for changes...");
  } else {
    await context.rebuild();
    await context.dispose();
    console.log("Build complete!");
  }
}

build().catch((err) => {
  console.error(err);
  process.exit(1);
});
