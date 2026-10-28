# Tasks

## 1. Replace ESLint with oxlint

- [x] 1.1 Add `oxlint` to devDependencies and create `.oxlintrc.json` exactly as specified in design D1, and verify `pnpm exec oxlint` runs and reports the known baseline (25 `no-explicit-any`, 33 `no-unused-vars`, 13 `unicorn/*`)
- [x] 1.2 Point the `lint` script at `oxlint`, delete `eslint.config.js`, remove `eslint`, `@eslint/js`, `typescript-eslint`, `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh`, and `globals` from devDependencies, then verify `pnpm install` succeeds and `node_modules/.bin/eslint` no longer exists
- [x] 1.3 Replace the 25 `any` usages in `src/utils/json.ts` with explicit `unknown` plus narrowing or a local `JsonValue` union, and verify `pnpm run lint` reports zero findings in that file and `pnpm exec vitest run tests/tools/json` still passes unchanged
- [x] 1.4 Remove the 33 dead symbols flagged by `no-unused-vars` (unused imports across 13 files, unused catch bindings, unused `let`), renaming intentionally-unused parameters to the `_` prefix, and verify `oxlint` reports zero `no-unused-vars` findings
- [x] 1.5 Fix the remaining lint errors: the empty interfaces in `src/components/ui/input.tsx` and `textarea.tsx`, the two `require()` calls in `tailwind.config.ts` (convert to ESM `import`), and the useless escape in `tests/tools/password-generator.test.ts`, then verify `pnpm run lint` exits 0
- [x] 1.6 Convert the six `eslint-disable-next-line` comments to `oxlint-disable-next-line` (`exhaustive-deps` ×3, `no-control-regex` ×2, `no-misleading-character-class` ×1), confirm with `reportUnusedDisableDirectives` that each suppression still suppresses a real finding, and verify `pnpm run lint` exits 0 with no stale-suppression errors
- [x] 1.7 Fix `src/app/DevToolsApp.tsx:489` — the `useMemo` that calls `selectTool` but declares only `[favorites]`, which oxlint does not report — by hoisting `selectTool` above the memo or listing it in the dependencies, and verify `pnpm exec vitest run tests/app` passes
- [x] 1.8 Record the residual linter gap in `AGENTS.md`: oxlint did not detect the `DevToolsApp.tsx:489` dependency omission that ESLint did, so future dependency-array review cannot rely on the linter alone; verify the note names the file and the rule

## 2. Move to TypeScript 7 and rebuild the tsconfig layout

- [x] 2.1 Bump `typescript` to `^7.0.2` and verify `pnpm exec tsc --version` reports 7.x
- [x] 2.2 Delete `baseUrl` from `tsconfig.app.json` and rewrite root `tsconfig.json` as a pure solution file (`files: []` plus references to app, test, node, with no `compilerOptions`), then verify `pnpm exec tsc -p tsconfig.app.json --noEmit` no longer reports `TS5102`
- [x] 2.3 Set `strict: true` in `tsconfig.app.json`, drop the now-redundant `noImplicitAny`/`noUnusedLocals`/`noUnusedParameters`/`noFallthroughCasesInSwitch` overrides, and verify the compiler accepts the config and reports the expected 29 strict errors across 5 files
- [x] 2.4 Add `vitest.config.ts` and `tailwind.config.ts` to `tsconfig.node.json`'s `include` and verify `pnpm exec tsc -p tsconfig.node.json --noEmit` exits 0
- [x] 2.5 Create `tsconfig.test.json` extending `tsconfig.app.json` with `include: ["src", "tests"]` and `types: ["vitest/globals", "node"]`, and verify `pnpm exec tsc -p tsconfig.test.json --noEmit` runs and reports the full error set instead of skipping the test files
- [x] 2.6 Add the `typecheck` script (`tsc --noEmit -p tsconfig.test.json && tsc --noEmit -p tsconfig.node.json`) and verify it runs both projects and exits non-zero while errors remain

## 3. Fix strict-mode errors in application source

- [x] 3.1 Type `RandomFill` in `src/utils/random-string.ts` as `(bytes: Uint8Array<ArrayBuffer>) => Uint8Array<ArrayBuffer>` and verify the two `TS2740`/`TS2345` errors are gone and `pnpm exec vitest run tests/tools/random-string.test.ts` passes
- [x] 3.2 Fix the 20 strict errors in `src/utils/semver.ts` (11 of them `Type 'undefined' is not assignable to type 'Pep440Version'`) with explicit guards instead of non-null assertions, and verify `pnpm exec vitest run tests/tools/semver` passes
- [x] 3.3 Fix the 5 strict errors in `src/utils/uuid.ts` and verify `pnpm exec vitest run tests/tools/uuid` passes
- [x] 3.4 Fix the remaining strict errors in `src/utils/date-format.ts` and `src/components/tools/NumberBaseConverter.tsx` and verify their tests pass
- [x] 3.5 Verify `pnpm exec tsc -p tsconfig.app.json --noEmit` exits 0 with no `@ts-expect-error` or `@ts-ignore` additions in the diff

## 4. Type-check the test suite for the first time

- [x] 4.1 In `tests/setup.ts`, replace `import * as matchers` plus `expect.extend(matchers)` with `import "@testing-library/jest-dom/vitest"`, and verify the `tsconfig.test.json` error count drops from 699 to roughly 58 and `pnpm test` still passes
- [x] 4.2 Delete the 17 redundant `exact: true` arguments on `getByRole` (the runtime default is already `true`), and verify the `TS2769` errors are gone and the affected tests in `tests/app/` still pass
- [x] 4.3 Fix the residual test type errors in `tests/tools/json-workspace.test.tsx`, `tests/tools/json-schema.test.ts`, `tests/tools/json-repair.test.ts`, `tests/tools/json-diff.test.ts`, and `tests/app/devtools-updates.test.tsx`, and verify `pnpm exec tsc -p tsconfig.test.json --noEmit` exits 0
- [x] 4.4 Verify the whole suite is green and deterministic with `pnpm test`

## 5. Enforce the gates in CI and update the docs

- [x] 5.1 Add `pnpm run typecheck` and `pnpm run lint` steps to the `test` job in `.github/workflows/test.yml`, before `pnpm test`, and verify by running the same three commands locally in that order
- [x] 5.2 Prove the gates actually fail: introduce a temporary type error and a temporary lint error, confirm each produces a non-zero exit from the corresponding script, then revert both and confirm the tree is clean with `git status`
- [x] 5.3 Update `AGENTS.md` — the Commands block (`pnpm run lint` now runs oxlint, new `pnpm run typecheck`), the Testing section, and the removal of both entries from **Known gaps** (`~30 pre-existing eslint errors`, `strict is disabled`) — and update the `pnpm run lint` row in `README.md`; verify no doc still claims ESLint or `strict: false`
- [x] 5.4 Run the full pre-merge sequence sequentially — `pnpm run lint`, `pnpm run typecheck`, `pnpm test`, `pnpm run build:web` — and confirm all four pass without the OOM issues that running the last two concurrently causes

## Workflow follow-up

- Archive this change once the gates are green on `main` and the artifacts have been reviewed.
