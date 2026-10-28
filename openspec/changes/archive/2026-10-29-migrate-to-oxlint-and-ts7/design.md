# Design

## Context

See `proposal.md` for motivation. The measurements below were taken on the current tree with `typescript@7.0.2` and `oxlint` latest, and they drive every decision here.

```
gates today           tsc: never runs           eslint: never runs in CI
tool time             tsc 8.0 s (src only)      eslint 5.7 s (299 files)
                      tsgo 1.1 s                oxlint 0.11 s
debt                  strict: 29 errors/5 files
                      tests: 699 errors (never type-checked)
                      lint: 30 errors/6 warnings
```

Rule parity between the current ESLint config and oxlint, measured on the same file set:

| concern | ESLint | oxlint | note |
|---|---|---|---|
| `no-explicit-any` | 25 | 25 | match |
| `no-empty-object-type` | 2 | 2 | match |
| `no-require-imports` | 2 | 2 | match |
| `no-useless-escape` | 1 | 1 | match |
| `only-export-components` | 2 | 2 | match |
| `exhaustive-deps` | 4 | 3 | **gap**: misses `src/app/DevToolsApp.tsx:489` |

## Goals / Non-Goals

**Goals:**

- One linter, one compiler, one type-check command, all enforced in CI and green on `main`.
- Preserve the existing rule set exactly; no new style opinions smuggled in with the migration.
- Keep the change revertible: no runtime code path depends on either tool.

**Non-Goals:**

- Adopting oxlint's React Compiler diagnostics (`set-state-in-effect`, `refs`, `purity`, `use-memo`, `immutability` — 48 findings today) or its unicorn style rules (13 findings). Separate change if wanted.
- Changing `target`/`lib` (still ES2020) or bundler settings.
- Formatter migration (oxfmt) or replacing Vite with Rolldown.
- Fixing the 300-line file ceiling violations found in `src/utils/date-format.ts` and friends.

## Decisions

### D1: oxlint via `.oxlintrc.json`, rules enumerated explicitly

Config file, not CLI flags, so the rule set is reviewable and stable. `plugins: ["react"]` is required — it is off by default, and without it both `react-hooks/exhaustive-deps` and `only-export-components` silently report nothing (verified: 0 findings until `--react-plugin` was passed).

```jsonc
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["react"],
  "ignorePatterns": ["dist", "src-tauri/target", "src-tauri/gen"],
  "options": { "reportUnusedDisableDirectives": "error" },
  "rules": {
    "typescript/no-explicit-any": "error",
    "typescript/no-empty-object-type": "error",
    "typescript/no-require-imports": "error",
    "no-useless-escape": "error",
    "no-unused-vars": ["error", { "argsIgnorePattern": "^_", "caughtErrors": "none" }],
    "react-hooks/exhaustive-deps": "error",
    "react/only-export-components": ["error", { "allowConstantExport": true }],
    "no-control-regex": "error",
    "no-misleading-character-class": "error",

    "react/set-state-in-effect": "off",
    "react/refs": "off",
    "react/purity": "off",
    "react/use-memo": "off",
    "react/immutability": "off",
    "unicorn/prefer-string-starts-ends-with": "off",
    "unicorn/no-new-array": "off",
    "unicorn/no-useless-spread": "off"
  }
}
```

`no-unused-vars` is raised from its oxlint default (warning) to error because the current config had it off only to avoid noise, and the 33 findings are genuine dead imports and unused catch bindings — the project's own standards forbid dead code. Fixing them costs minutes; leaving a warning class that CI ignores is the failure mode this change exists to remove.

Alternatives rejected: (a) keep ESLint and add oxlint alongside — two configs to keep in sync, and ESLint is the thing blocking TS 7; (b) enable oxlint's React Compiler rules now — 48 unrelated findings would be bundled into a toolchain change.

### D2: `typescript@^7.0.2` as the direct dependency

The native compiler ships inside the normal `typescript` package as `tsc`. The `@typescript/native-preview` bridge package is not needed on a stable release. The only consumer of the compiler's JavaScript API in this repo was `typescript-eslint`, which D1 removes; a search found no other `import ... from "typescript"` in `src`, `scripts`, or `e2e`.

This is why lint comes before the compiler in the task order: on TS 7 the JS API does not exist until 7.1, so upgrading while still running typescript-eslint would force the `typescript@npm:@typescript/typescript6` alias dance. Once oxlint is in, the upgrade is a version bump.

Alternatives rejected: pinning 5.9 and adding `tsgo` separately — two compilers to install, no benefit.

### D3: Four tsconfig projects, no dead configuration

```
tsconfig.json          files: [] + references: [app, test, node]   (no compilerOptions)
tsconfig.app.json      src only            strict: true   paths "@/*"
tsconfig.test.json     extends app, + tests, types: ["vitest/globals", "node"]
tsconfig.node.json     vite.config.ts, vitest.config.ts, tailwind.config.ts
```

- Root `compilerOptions` are deleted. Nothing `extends` the root config, so `strictNullChecks: false`, `noImplicitAny: false`, `allowJs` and friends there have never applied to any file. Keeping them is worse than deleting them: they read as policy.
- `baseUrl` is deleted from both files. TS 7 removed the option; `paths` resolves relative to the config file, so `"@/*": ["./src/*"]` keeps working unchanged.
- `strict: true` replaces the explicit `noImplicitAny: false` / `noUnusedLocals: false` / `noFallthroughCasesInSwitch: false` trio (the latter now defaults on anyway).
- `tsconfig.test.json` extends the app project rather than duplicating options. Tests import from `@/`, so they pull source files into the program regardless; a single extended project is honest about that instead of pretending the two are disjoint.
- `tailwind.config.ts` joins the node project. It currently sits outside every project, which is how its `require()` calls survive untested.

`typecheck` script runs the two leaf projects that cover all hand-written code:

```json
"typecheck": "tsc --noEmit -p tsconfig.test.json && tsc --noEmit -p tsconfig.node.json"
```

### D4: Test typing strategy — typed matchers, then strict, then the residue

The 699 test errors are three different problems, and the fix order matters:

```
699  raw errors (tests in no project)
625  disappear with typed jest-dom matchers      <- tests/setup.ts change
 15  disappear once strictNullChecks is on        <- discriminated-union narrowing
 58  remain: 17 `exact`, 11 semver, rest scattered
```

- `tests/setup.ts` replaces `import * as matchers` + `expect.extend(matchers)` with `import "@testing-library/jest-dom/vitest"`, which both registers the matchers at runtime and augments Vitest's `Assertion` type.
- The 15 `CronParseResult` / JSON-result errors are not test bugs: `if (!result.ok)` narrowing on a discriminated union requires `strictNullChecks`. Turning strict on deletes them.
- `exact: true` on `getByRole` is rejected by `@testing-library/dom@10.4.1` types (`ByRoleOptions` omits it, though `MatcherOptions` has it). Runtime default for `exact` is already `true`, so the 17 occurrences are deleted. This is behaviour-preserving; upgrading `@testing-library/dom` for a type-only fix is not worth a dependency change in this change.

### D5: Suppressions use `oxlint-disable-next-line`

oxlint accepts `eslint-disable-next-line` for compatibility, but the `oxlint-` form is the documented one and the two must not diverge when ESLint is gone. All 6 sites are converted (`exhaustive-deps` ×3, `no-control-regex` ×2, `no-misleading-character-class` ×1). With `reportUnusedDisableDirectives: "error"`, a suppression whose rule does not exist or no longer fires fails the gate — this is also how the rule-existence question for `no-control-regex` and `no-misleading-character-class` gets answered empirically.

### D6: CI order is typecheck → lint → test → build

Both new gates finish in ~2 s combined, so they run before the slow suites and fail fast. Steps go into the existing `test` job in `.github/workflows/test.yml`, so the downstream `build-app.yml` reuse is blocked automatically by the existing `needs: test`.

Alternative rejected: a separate workflow — a second job pays a second `pnpm install`.

### D7: Version ranges follow project idiom

Every dependency here uses caret ranges; `oxlint` and `typescript` match. Exact-pinning the compiler would be defensible, but a lone pinned version in an all-caret `package.json` invites confusion about which convention applies, and the toolchain is covered by CI.

## Risks / Trade-offs

- **oxlint misses one `exhaustive-deps` case** (`src/app/DevToolsApp.tsx:489`, a `useMemo` whose callback calls `selectTool` but whose deps are `[favorites]`) → Mitigation: fix that memo's dependencies as part of the cleanup (it is also a real TDZ hazard, since `selectTool` is a `const` declared after the memo), and record the detection gap in `AGENTS.md` so nobody assumes the rule is airtight.
- **oxlint default rules drift between versions** (`unicorn/*` and `no-unused-vars` are on by default and appeared without being requested) → Mitigation: the config enumerates every rule explicitly, including `off` for the unwanted families; upgrades get their own change.
- **Strict-mode fixes can change runtime behaviour** → Mitigation: prefer explicit guards over `!` and casts; the existing 138-file test suite must stay green after every batch; no `@ts-expect-error` additions.
- **TS 7's newer DOM lib tightened `getRandomValues`** to `ArrayBufferView<ArrayBuffer>` → Mitigation: the two `random-string.ts` errors are fixed by typing `RandomFill` as `Uint8Array<ArrayBuffer>`; this class of breakage is expected to be rare but may recur in a lib upgrade.
- **`strict` may surface errors only in the tests after all** → Mitigation: the residual is measured at 58 and itemised per file before the strict flip is merged; if a batch exceeds its estimate the tasks are split, not the strictness relaxed.
- **Rollback**: revert the change's commits. No runtime behaviour is coupled to either tool, and `pnpm install` restores the old toolchain exactly.

## Open Questions

- Whether to adopt oxlint's React Compiler rule family (48 findings) — deferrable, needs its own change and possibly code restructuring.
