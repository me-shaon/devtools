# Proposal

## Why

Nothing type-checks this project. `pnpm test` transpiles with Vite, `pnpm run build:web` transpiles with SWC, and no CI job runs `tsc` or `eslint` — 138 test files are in no tsconfig project at all, and the ~30 pre-existing lint errors are documented as known debt instead of being fixed. Meanwhile `typescript-eslint` pins the compiler to the JavaScript implementation, which blocks TypeScript 7's native compiler (no stable JS API until 7.1), and ESLint spends 5.7 s per run on a codebase oxlint can cover in 0.1 s.

The cost of fixing the baseline is now measured and small: 29 errors under `strict`, 72 in the untyped test suite, and a handful of mechanical lint fixes. Doing it now buys a compiler that is ~7x faster, a linter ~50x faster, and gates that make the baseline stay at zero.

## What Changes

- **BREAKING (dev workflow)**: replace ESLint with oxlint as the only linter. `eslint.config.js` is deleted; `.oxlintrc.json` replaces it. `pnpm run lint` keeps its name but runs oxlint. Removes `eslint`, `@eslint/js`, `typescript-eslint`, `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh` from devDependencies.
- **BREAKING (toolchain)**: upgrade `typescript` from 5.9.3 to 7.x (native Go compiler, currently 7.0.2). `tsc` becomes `tsgo` semantics; the JS compiler API is no longer available to tooling (acceptable because the only consumer was typescript-eslint).
- Delete dead and removed tsconfig options: `baseUrl` in `tsconfig.app.json` and `tsconfig.json` (removed in TS 7 — hard error), and the inert `compilerOptions` block in root `tsconfig.json` that no project extends.
- Enable `strict: true` for the app project and fix the 29 resulting errors across 5 files.
- Add `tsconfig.test.json` so `tests/**` is type-checked for the first time; fix the 72 resulting type errors, starting with the one-line typed jest-dom import that clears 46 of them.
- Fix all lint debt rather than suppressing it: 25 `no-explicit-any` in `src/utils/json.ts`, 2 empty interfaces, 2 `require()` calls in `tailwind.config.ts`, 1 useless escape, and 33 unused-symbol findings (dead imports and catch bindings).
- Convert the 6 inline `eslint-disable` comments to `oxlint-disable` form and enable `reportUnusedDisableDirectives` so stale suppressions fail.
- Add `pnpm run typecheck` and wire both `lint` and `typecheck` into `.github/workflows/test.yml` as required steps.
- Update `AGENTS.md` (Known gaps section currently documents the old debt) and `README.md` (`pnpm run lint | Run ESLint`).

## Capabilities

### New Capabilities

- `code-quality-gates`: The repository's static-analysis contract — which tools run, what they must cover, that a clean tree reports zero findings, and that CI blocks on regressions.

### Modified Capabilities

None. No existing specs exist in this project.

## Impact

- **Dependencies**: `typescript` 5.9.3 → 7.x; `oxlint` added; 5 ESLint-related packages removed.
- **Config**: `tsconfig.json`, `tsconfig.app.json` (new `tsconfig.test.json`); `eslint.config.js` deleted in favour of `.oxlintrc.json`; `package.json` scripts.
- **CI**: `.github/workflows/test.yml` gains two steps.
- **Source**: ~20 files touched by type/lint fixes, concentrated in `src/utils/semver.ts`, `src/utils/uuid.ts`, `src/utils/json.ts`, `src/utils/random-string.ts`, `tests/setup.ts`.
- **Docs**: `AGENTS.md`, `README.md`, `.github/copilot-instructions.md`.
- **Runtime**: no change. Vite/SWC continues to transpile; the compiler is only used for type-checking.
- **Non-goal**: no tool behaviour, UI, or storage changes; no `target`/`lib` modernisation; no adoption of oxlint's React Compiler or unicorn rule families in this change.
