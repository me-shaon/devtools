# AGENTS.md

Guidance for AI agents and contributors working on DevToolsApp.

## Product invariants

DevToolsApp is an offline-first desktop app that bundles 50+ developer utilities
into one Tauri 2 window. Every tool must also work in a plain browser.

- **Offline by design.** No network calls, telemetry, analytics, or remote assets.
  The only network activity is the update check; do not add more.
- **Local data only.** Never store, log, or transmit file contents, tokens,
  passwords, keys, or any user input.
- **Browser parity.** A tool that only works inside Tauri is a bug.

## Stack

React 18, TypeScript, Vite 5, Tailwind CSS 3, shadcn/ui (Radix), Tauri 2 (Rust),
Vitest + Testing Library, WebdriverIO for the desktop smoke test.

Package manager is **pnpm only**. Node 22+ (CI runs 24 LTS). Never add an
`npm`/`yarn` lockfile or run installs with another manager.

## Commands

```bash
pnpm install            # install dependencies
pnpm run dev            # Tauri app with hot reload
pnpm run dev:web        # browser-only UI
pnpm test               # Vitest (all tests)
pnpm exec vitest run tests/tools/foo.test.ts   # one file
pnpm run build:web      # frontend only, fast check
pnpm run lint           # ESLint (see Known gaps)
pnpm exec tauri ...     # Tauri CLI
```

pnpm forwards script arguments directly: `pnpm run release:check v2.5.0`, never
`-- v2.5.0` (a literal `--` reaches the script).

Run `pnpm test` and `pnpm run build:web` sequentially; running both at once
caused an OOM kill on a 16 GB machine. `maxWorkers: 2` in `vitest.config.ts`
is deliberate.

When adding a dependency with a postinstall/build script (native binaries,
drivers), add it to `allowBuilds` in `pnpm-workspace.yaml`; pnpm 12 blocks
unlisted build scripts.

## Architecture

```text
src/app/DevToolsApp.tsx   app shell: navigation, tabs, theme, updates
src/app/toolRegistry.ts   tool metadata + lazy component map
src/components/tools/     one component per tool
src/components/app/       command palette, paste suggestions, shortcuts
src/components/ui/        shared shadcn/ui primitives
src/hooks/                reusable React state and browser APIs
src/lib/desktop.ts        the only module that imports @tauri-apps/*
src/utils/                pure tool logic (no React, no DOM, no Tauri)
src-tauri/                Rust backend, native commands, bundle config
tests/                    unit + component tests (mirrors src/)
e2e/                      desktop smoke test and self-test
scripts/                  release and brand tooling
```

Keep responsibilities separated:

| Logic | Lives in | Must not |
|---|---|---|
| Parsing, conversion, validation, formatting | `src/utils/` | touch React, DOM, storage, or Tauri |
| Event wiring and rendering | `src/components/` | contain domain rules or deep async orchestration |
| Native capability access | `src/lib/desktop.ts` | leak into components directly |
| Shell concerns (nav, palette, theme, updater) | `src/app/` | absorb individual tool logic |

Components may call one hook or one service function per action. If a component
is fetching, computing a domain rule, and rendering at once, split it.

Files: keep tool logic modules under ~200 lines and components under ~200
lines; split at 300. Extract a helper instead of nesting three levels deep.

## Adding a tool

1. Implement the logic in `src/utils/<tool>.ts` as pure functions with explicit
   input types and error results (no throwing for expected bad input).
2. Build the UI in `src/components/tools/<Tool>.tsx`.
3. Add an entry to `ALL_TOOLS` in `src/app/toolRegistry.ts` (unique `id`,
   category, icon, search `keywords`).
4. Register the lazy import in `TOOL_COMPONENTS` in the same file.
5. Add tests in `tests/tools/` for the logic and non-trivial UI behavior.
6. Update the tool list in `README.md`.
7. If the tool needs a native behavior, add a command in `src-tauri/src/main.rs`,
   expose it through `src/lib/desktop.ts`, and add the capability only if a
   plugin requires it.

New tools must stay lazy-loaded; heavy third-party parsers belong inside the
tool's module so they never enter the initial bundle.

## Coding standards

- TypeScript: new code should be strictly typed even though `tsconfig.app.json`
  currently has `strict: false`. Avoid `any`; prefer `unknown` plus narrowing.
  Validate external and pasted data at the boundary.
- No magic strings or numbers that carry meaning: name storage keys, limits,
  timeouts, and formats as constants near their use.
- Errors must be visible. Catch at boundaries (native calls, parsing, storage)
  and surface a state or message. Never swallow an error silently; never leave a
  blank UI when work fails.
- Prefer pure functions and composition. No hidden coupling through module-level
  mutable state.
- Match existing idiom: 2-space indent, double quotes, named exports everywhere.
  The registry maps a tool's named component export through `lazyNamed`.
- Comments explain *why*, not *what*. No commented-out code, no debug logging.

## Persistence

- All keys are namespaced `devtools-<feature>`; add a `-v1` suffix when the
  stored shape may change and you need to migrate.
- Parse defensively: missing or corrupt JSON falls back to defaults, never throws
  into render.
- Persistence helpers accept a `Storage`-like parameter so tests can inject a
  fake (see `src/utils/global-shortcut.ts`).
- Never persist secrets, tokens, or file contents.

## Testing

- Put logic tests in `tests/tools/`, shell behavior in `tests/app/`, and helper
  tests in `tests/lib/`.
- Use React Testing Library and assert user-visible behavior, not internals.
- Use `vi.useFakeTimers()` for clock-dependent tools; tests must be
  deterministic and order-independent.
- No network, no real filesystem, no real Tauri. Mock only true boundaries.
- Every bug fix gets a regression test. New features need tests for the happy
  path and the invalid-input path.
- `tests/setup.ts` provides a `localStorage` fallback for Node 26+, where the
  runtime's inert global shadows jsdom's. Keep it.
- Desktop behavior is covered by `e2e/smoke.mjs`; build with
  `pnpm exec tauri build --no-bundle --features e2e` before running it.

## Security

- Treat every pasted payload (JWT, JSON, YAML, XML, SQL, certificates, archives)
  as hostile: bound sizes, handle malformed input, avoid regex backtracking.
- Sanitize any HTML rendered from user input with DOMPurify.
- Deep links (`devtoolsapp://`) must resolve against known tool ids only; reject
  anything else.
- Save files through `saveFile()` from `src/lib/desktop.ts`.
- Keep `src-tauri/capabilities/default.json` minimal; add a permission only for
  a command that needs it.
- Do not add CSP relaxations or remote origins to `tauri.conf.json`.

## Git and releases

- Conventional commit subjects (`feat:`, `fix:`, `test:`, `build:`, `docs:`,
  `refactor:`), lowercase, imperative, one concern per commit.
- Before finishing: `pnpm test`, `pnpm run build:web`, and a lint check on the
  files you touched.
- Releases: `pnpm run release:prepare <version>`, edit
  `release-notes/v<version>.md`, `pnpm run release:check v<version>`, then tag
  `v<version>`. See `docs/release-process.md`.

## Known gaps

Do not "clean up" these opportunistically; they are separate work:

- `pnpm run lint` reports ~30 pre-existing errors (`src/utils/json.ts` explicit
  `any`, `tailwind.config.ts` `require`, empty interfaces in `input.tsx` and
  `textarea.tsx`, one test escape). Do not add new violations.
- `strict` is disabled in `tsconfig.app.json`; enabling it is a separate task.
- The README tool list and registry are maintained by hand and can drift.

## Read next

- `README.md` — user-facing overview and tool list
- `.github/copilot-instructions.md` — short architecture summary
- `docs/release-process.md` — versioning, signing, publishing
