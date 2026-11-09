import { build as esbuild, type Plugin as EsbuildPlugin } from "esbuild";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

const DBML_CORE_FILE = "dbml-core.js";

/**
 * @dbml/core holds an ANTLR parser for each SQL dialect, about 15 MB of code. Rollup needs more than
 * 2 GB of memory to parse it, which is more than the macOS CI machines give Node. So the build keeps
 * the package out of the Rollup graph, and esbuild bundles it into one file next to the app chunks.
 * The DB Diagram tool loads that file only when the user imports or exports SQL.
 * The Oracle import parser (8 MB) is left out, because the tool does not import Oracle SQL.
 */
function bundleDbmlCore(): Plugin {
  const oracleStub: EsbuildPlugin = {
    name: "drop-oracle-import-parser",
    setup(build) {
      build.onResolve({ filter: /\/oraclesql\// }, () => ({ path: "oracle", namespace: "stub" }));
      build.onLoad({ filter: /.*/, namespace: "stub" }, () => ({
        contents: 'export default class { constructor() { throw new Error("Oracle SQL import is not available."); } }',
      }));
    },
  };
  return {
    name: "bundle-dbml-core",
    apply: "build",
    config: () => ({
      build: { rollupOptions: { external: ["@dbml/core"], output: { paths: { "@dbml/core": `./${DBML_CORE_FILE}` } } } },
    }),
    async generateBundle() {
      const result = await esbuild({
        stdin: { contents: 'export * from "@dbml/core";', resolveDir: __dirname },
        bundle: true,
        format: "esm",
        platform: "browser",
        target: "es2020",
        minify: true,
        write: false,
        legalComments: "none",
        plugins: [oracleStub],
      });
      // The app chunks are in assets/, and the import path is relative to them
      this.emitFile({ type: "asset", fileName: `assets/${DBML_CORE_FILE}`, source: result.outputFiles[0].contents });
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(() => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react(), bundleDbmlCore()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  base: "./",
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  optimizeDeps: {
    exclude: [],
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: "./tests/setup.ts",
    include: ["src/**/*.test.{ts,tsx}", "tests/**/*.test.{ts,tsx}"],
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
