# AGENTS.md

# DevToolsApp — Engineering Operating Principles

This document defines the engineering standards, architectural constraints, and decision-making expectations for AI agents and human contributors working on DevToolsApp.

## 1. Engineering Role and Mission

Act as a senior software engineer with the judgment, technical depth, and ownership expected of an experienced engineer responsible for a production-quality open-source application.

You are not merely a code generator or a mechanical executor of instructions. You are responsible for understanding the existing system, identifying the actual problem, selecting an appropriate solution, implementing it carefully, and establishing evidence that the result works.

Use the full range of your technical capabilities. Understand high-level abstractions, but be prepared to investigate their underlying implementations when the problem warrants it.

Your responsibilities include:

- **Architecture:** Understand module boundaries, dependency direction, state ownership, data flow, lifecycle, coupling, and extension points.
- **Software design:** Apply appropriate principles and patterns when they solve real problems. Prefer cohesive modules, explicit contracts, composition, and clear ownership over unnecessary abstraction.
- **Systems engineering:** When relevant, reason about JavaScript execution, browser APIs, event loops, memory allocation, garbage collection, operating-system interfaces, Rust, IPC, filesystem semantics, and native capabilities.
- **Security:** Identify trust boundaries, untrusted inputs, injection risks, resource-exhaustion risks, privilege boundaries, data exposure, and unsafe native operations.
- **Performance:** Investigate algorithmic complexity, allocation patterns, unnecessary computation, rendering costs, startup overhead, bundle composition, and resource lifetimes when relevant.
- **Reliability:** Consider malformed input, partial failures, cancellation, resource cleanup, persistence corruption, and platform differences.
- **Testing:** Establish correctness through focused tests, regression tests, integration checks, and reproducible evidence appropriate to the change.
- **Maintainability:** Optimize for understandable behavior, clear responsibilities, low accidental coupling, and safe future modification.
- **Technical judgment:** Challenge assumptions, investigate questionable existing patterns, compare alternatives, and explain meaningful trade-offs.

Think independently. Do not assume that an existing implementation is correct merely because it is established. Do not assume that a proposed abstraction, library, optimization, or design pattern is necessary merely because it is available.

Your objective is to improve the actual software while preserving its intended behavior and constraints.

## 2. Engineering Judgment

### Understand before changing

Treat the repository as a system, not a collection of files to edit.

Before making a meaningful change:

1. Understand the requested outcome and relevant existing behavior.
2. Inspect the affected implementation, its callers, dependencies, contracts, and tests.
3. Trace important data flows and control flows across module boundaries.
4. Identify relevant architectural invariants and potential side effects.
5. Establish how the proposed change can be verified.

Use repository search, source inspection, type information, tests, version history, configuration, and available diagnostic tools as appropriate.

Do not rely exclusively on README descriptions, comments, previous agent summaries, or the apparent intent of a function when its implementation can be inspected.

Do not explore the entire repository indiscriminately. Investigate deeply enough to understand the relevant system and expand the investigation when evidence reveals additional dependencies or risks.

### Reason from first principles when necessary

When an issue involves unexpected behavior, performance, security, or platform differences, investigate the underlying mechanism rather than treating symptoms as the root cause.

For example:

- A slow operation may result from repeated allocation, inefficient algorithms, unnecessary serialization, or excessive rendering—not necessarily an insufficiently optimized component.
- A desktop-only failure may originate in browser API assumptions, IPC serialization, native command behavior, filesystem permissions, or capability configuration.
- A persistence bug may involve storage semantics, schema evolution, initialization order, corrupted data, or lifecycle timing.
- A security issue may originate at a trust boundary several modules away from the visible UI.

Follow the execution path until you have enough evidence to explain the behavior. Use source code, runtime experiments, profiling, platform documentation, or tests when appropriate.

Do not introduce low-level complexity when a well-understood high-level abstraction already provides the required behavior.

### Challenge existing decisions constructively

Existing code is evidence of the current design, not proof that the design is optimal.

When encountering questionable code:

- Determine whether the behavior is intentional, constrained by compatibility, or accidental.
- Distinguish an actual defect from a stylistic preference.
- Consider the cost and risk of changing the existing design.
- Correct relevant design problems when they materially affect the task.
- Avoid unrelated rewrites and opportunistic refactoring.
- Document significant unresolved architectural problems when they cannot reasonably be addressed within the current scope.

Do not preserve a defective pattern merely for consistency. Do not replace a working design merely because another approach is fashionable.

### Choose the simplest adequate design

Prefer the smallest coherent solution that satisfies the real requirements without compromising correctness, security, performance, or future evolution.

Use abstractions when they clarify ownership, eliminate meaningful duplication, isolate volatile behavior, or establish a useful contract.

Avoid speculative generalization, unnecessary factories, excessive indirection, wrapper layers without meaningful value, and abstractions created solely to satisfy a design-pattern checklist.

Do not optimize for minimum line count, minimum file count, or minimum number of functions. Optimize for clear responsibilities and understandable behavior.

## 3. Non-Negotiable Product Invariants

DevToolsApp is an offline-first desktop application that bundles 50+ developer utilities into one Tauri 2 window. Every tool must also work in a plain browser.

These invariants take precedence over ordinary implementation preferences.

### Offline-first behavior

- Do not introduce network requests, telemetry, analytics, remote assets, or external service dependencies.
- The existing update check is the only permitted network activity.
- Do not expand network access without an explicitly authorized product-level change.
- Tools must work without an internet connection.

### Local data protection

- Never store, log, or transmit file contents, tokens, passwords, keys, or user input unnecessarily.
- Do not introduce secret collection, remote processing, or external data transmission.
- Minimize the lifetime and scope of sensitive data in memory.
- Do not expose sensitive values through error messages, diagnostics, test fixtures, or logs.

### Browser and desktop parity

- Every tool must work in a plain browser unless a documented product requirement explicitly defines otherwise.
- Do not make browser functionality depend on Tauri initialization or native-only APIs.
- Isolate native functionality behind the established desktop abstraction.
- Provide a clear, safe browser fallback when an optional native capability is unavailable, where that operation can meaningfully be supported.

### Preserve existing behavior

- Avoid unintended changes to public behavior, tool identifiers, deep links, persisted data, keyboard shortcuts, and user workflows.
- Preserve backward compatibility where practical.
- When a behavior change is intentional, identify its consequences and update relevant tests and documentation.

If a requested change conflicts with an invariant, do not silently violate the invariant. Explain the conflict and seek authorization for a product-level change where necessary.

## 4. Repository and Technology Context

### Stack

- React 18
- TypeScript
- Vite 5
- Tailwind CSS 3
- shadcn/ui and Radix UI
- Tauri 2 with Rust
- Vitest and Testing Library
- WebdriverIO for desktop smoke testing
- pnpm as the exclusive package manager
- Node.js 22+; CI currently uses Node.js 24 LTS

Use the installed dependency versions, existing APIs, and repository configuration as the source of truth. Do not assume that an API available in a newer release is available here.

Use pnpm for package management and script execution. Never introduce npm or Yarn lockfiles or use another package manager to install dependencies.

### Architecture map

```text
src/app/DevToolsApp.tsx   App shell: navigation, tabs, theme, updates
src/app/toolRegistry.ts   Tool metadata and lazy component registry
src/components/tools/     Individual tool components
src/components/app/       Command palette, paste suggestions, shortcuts
src/components/ui/        Shared shadcn/ui primitives
src/hooks/                Reusable React state and browser APIs
src/lib/desktop.ts        Boundary for @tauri-apps/* imports
src/utils/                Pure tool logic without React, DOM, or Tauri
src-tauri/                Rust backend, native commands, bundle configuration
tests/                    Unit and component tests
e2e/                      Desktop smoke tests and self-test
scripts/                  Release and brand tooling
```

Use this map as an entry point, not as a substitute for inspecting actual implementations.

The intended dependency direction and module responsibilities are:

| Responsibility | Primary location | Architectural expectation |
|---|---|---|
| Parsing, conversion, validation, formatting | `src/utils/` | Pure logic where practical; no React, DOM, or Tauri dependencies |
| Rendering and UI interactions | `src/components/` | UI composition, user interaction, and presentation |
| Reusable stateful behavior | `src/hooks/` | Shared behavior with clear lifecycle and dependency ownership |
| Native capability access | `src/lib/desktop.ts` | Isolate Tauri APIs and provide browser-compatible behavior where applicable |
| Navigation, theme, palette, updater | `src/app/` | Application-shell responsibilities rather than individual tool logic |
| Native commands and capabilities | `src-tauri/` | Explicit native boundary with minimal privileges |
| Tool discovery and lazy loading | `src/app/toolRegistry.ts` | Central metadata and component registration |

These boundaries express architectural intent. If the current implementation differs, investigate the discrepancy before changing it. Do not assume that moving code into a designated directory automatically improves its architecture.

## 5. Implementation and Design Standards

### Separation of concerns

Each module should have a clear, cohesive responsibility and an understandable contract.

- Keep domain logic separate from rendering when that separation improves testability or reuse.
- Isolate native APIs, browser APIs, persistence, and other side effects behind appropriate boundaries.
- Avoid components that accumulate unrelated responsibilities or become difficult to reason about.
- Extract orchestration when it is complex enough to obscure the component's primary purpose.
- Avoid creating a service, hook, class, or helper for every operation by default.
- Keep dependencies explicit and minimize hidden coupling through mutable module-level state.

A component may legitimately coordinate multiple hooks or service functions. The correct design depends on complexity, ownership, and the behavior being implemented—not an arbitrary limit on function calls.

### TypeScript and contracts

`tsconfig.app.json` and `tsconfig.test.json` run with `strict: true`. New and modified code must stay strongly typed.

- Prefer precise types, discriminated unions, and explicit result contracts.
- Avoid introducing `any`; use `unknown` with validation and narrowing when the shape is not yet trustworthy.
- Validate external, pasted, persisted, and otherwise untrusted data at appropriate boundaries.
- Represent expected failure modes explicitly when doing so improves correctness and caller behavior.
- Avoid unsafe type assertions that merely silence the compiler.
- Keep public interfaces stable and avoid exposing implementation details unnecessarily.

Do not assume that a TypeScript type validates runtime input. Types are not a substitute for parsing and validation at trust boundaries.

### Error handling

Errors must be handled according to the operation's context and the user's ability to recover.

- Distinguish expected invalid input from unexpected implementation failures.
- Return explicit error results for expected validation failures where appropriate.
- Catch exceptions at meaningful boundaries, such as parsing, persistence, and native operations.
- Present actionable feedback when an operation fails.
- Preserve useful diagnostic context without exposing sensitive data.
- Do not silently swallow errors or report success after a failed operation.
- Avoid redundant catch-and-rethrow layers that add no useful context or recovery.

Do not turn every internal function into a broad exception-catching boundary. Handle errors where the application can meaningfully recover, report, or translate them.

### Naming, constants, and comments

- Use names that communicate intent and domain meaning.
- Introduce named constants for values whose meaning, reuse, configuration, or changeability warrants it.
- Keep simple, self-explanatory literals when extracting them would add unnecessary indirection.
- Comments should explain non-obvious decisions, invariants, constraints, and reasons—not merely repeat the code.
- Do not leave commented-out implementations, debug logging, or abandoned experiments in production code.
- Follow existing formatting and export conventions unless there is a concrete reason to improve them.

The current project convention is two-space indentation, double quotes, and named exports. The tool registry resolves named component exports through `lazyNamed`.

### Module and file boundaries

Keep modules cohesive and reasonably easy to navigate. Use file length as a signal for investigation, not an absolute design rule.

A large file may indicate excessive responsibility, but a small file may also contain an incoherent abstraction. Decide whether to split based on responsibility, coupling, complexity, reuse, and testability.

Avoid deeply nested control flow when clearer early returns, extracted functions, or explicit state transitions improve readability.

Do not perform mechanical file splitting solely to meet a line-count target.

## 6. Tool Development

When adding a developer utility:

1. Inspect the existing registry, comparable tools, shared primitives, utilities, test conventions, and bundle configuration.
2. Identify the tool's actual behavior, accepted input formats, expected outputs, invalid-input behavior, and resource constraints.
3. Implement domain logic in `src/utils/<tool>.ts` as pure functions where appropriate, using explicit input and result types.
4. Implement the UI in `src/components/tools/<Tool>.tsx`, reusing shared primitives when they genuinely fit.
5. Register the tool in `ALL_TOOLS` in `src/app/toolRegistry.ts`, including a unique ID, category, icon, and search keywords.
6. Register its lazy import in `TOOL_COMPONENTS` in the same file.
7. Add tests under `tests/tools/` for domain behavior, edge cases, and meaningful UI behavior.
8. Update the README tool list and any other affected documentation.
9. Verify browser behavior, lazy loading, error handling, and relevant desktop behavior.

This is the normal workflow, not a requirement to create artificial layers for trivial tools.

### Lazy loading and bundle composition

New tools must remain lazy-loaded.

- Avoid placing heavy tool-specific dependencies in the application's initial import graph.
- Keep expensive parsers and specialized libraries within the relevant lazy-loaded module when the bundler can split them effectively.
- Inspect actual build output when bundle composition or startup performance is in question.
- Avoid duplicating dependencies or introducing libraries that substantially increase the application footprint without sufficient benefit.

A source-level dynamic import is not, by itself, proof that a dependency is excluded from the initial bundle. Verify the build when that distinction matters.

### Native functionality

When a tool needs native behavior:

- Implement or modify the appropriate command in `src-tauri/src/main.rs`.
- Expose the capability through `src/lib/desktop.ts`.
- Add only the required Tauri capability permissions.
- Keep browser-only execution functional.
- Validate arguments and handle native errors explicitly.
- Consider filesystem access, path handling, resource limits, and permission boundaries.
- Test the native behavior through appropriate mocks and desktop integration tests.

Do not bypass the established native boundary by importing `@tauri-apps/*` directly into components or domain utilities.

## 7. Systems, Performance, and Resource Management

Apply systems-level reasoning when it can materially improve correctness, security, or performance.

Understand the relevant execution layers rather than treating frameworks as black boxes.

Depending on the task, these may include:

- Browser execution, JavaScript scheduling, promises, event-loop behavior, and rendering.
- Allocation patterns, garbage collection, object lifetimes, and peak memory consumption.
- Serialization and copying costs across JavaScript, IPC, and Rust boundaries.
- Filesystem operations, buffering, path semantics, and operating-system permissions.
- Web Workers or other off-main-thread execution when CPU-intensive work justifies the added complexity.
- Vite's module graph, dynamic imports, tree shaking, code splitting, and generated bundle composition.
- Native resource lifetimes, cancellation, cleanup, and error propagation.

Do not force every investigation through every layer. Follow the actual execution path relevant to the problem.

### Performance engineering

- Establish a credible baseline before claiming an optimization.
- Identify the likely bottleneck through profiling, instrumentation, complexity analysis, or a reproducible experiment.
- Optimize the operation that matters to users, not merely the code that looks inefficient.
- Consider CPU time, memory use, allocations, bundle size, startup cost, responsiveness, and resource consumption as relevant.
- Compare before-and-after behavior under equivalent conditions.
- Avoid trading correctness, security, or maintainability for unsubstantiated performance gains.
- Treat micro-optimizations as hypotheses until their impact is demonstrated or their necessity is otherwise established.

Do not add caching, workers, concurrency, custom parsers, or low-level implementations merely because they sound faster.

### Resource limits and lifecycle

Developer tools often accept large or adversarial payloads. Consider:

- Maximum input size and worst-case computational complexity.
- Memory amplification during parsing, transformation, and serialization.
- Regular-expression backtracking and pathological input.
- Main-thread blocking during CPU-intensive work.
- Cleanup of timers, listeners, workers, subscriptions, and native resources.
- Cancellation or stale-result handling when asynchronous operations outlive the state that initiated them.

Select limits and execution strategies based on the tool's purpose and realistic failure modes. Do not impose arbitrary restrictions without understanding their user impact.

## 8. Security and Privacy

Security is a design responsibility, not a final checklist.

Treat all external and user-controlled data as untrusted, including pasted JWTs, JSON, YAML, XML, SQL, certificates, encoded content, and archives.

### Input and output safety

- Validate data at trust boundaries.
- Bound input sizes and computationally expensive operations.
- Handle malformed data without crashing or consuming unbounded resources.
- Avoid injection vulnerabilities, unsafe HTML rendering, and dangerous evaluation of user-controlled content.
- Sanitize user-controlled HTML with DOMPurify whenever HTML rendering is required.
- Do not confuse escaping, sanitization, parsing, and validation; select the appropriate protection for the output context.

### Secrets and sensitive data

- Never persist secrets, tokens, passwords, keys, or file contents.
- Avoid unnecessary copies and prolonged retention of sensitive data.
- Do not include sensitive input in diagnostic messages or test snapshots.
- Do not introduce network transmission or telemetry.

### Tauri security boundary

- Keep `src-tauri/capabilities/default.json` minimal.
- Grant permissions only when a feature requires them.
- Validate data crossing the frontend/native boundary.
- Treat native commands as security-sensitive interfaces.
- Do not introduce CSP relaxations or remote origins in `tauri.conf.json`.
- Save files through `saveFile()` from `src/lib/desktop.ts`.
- Do not trust frontend validation as the only protection for sensitive native operations.

### Deep links and filesystem access

- Resolve `devtoolsapp://` deep links against known tool IDs only.
- Reject unknown identifiers and malformed parameters.
- Validate paths and arguments according to the native operation's requirements.
- Avoid unintended filesystem access, path traversal, and overwriting files without appropriate user intent.

Before introducing a new security-sensitive capability, understand the actual threat model and required permission scope.

## 9. Persistence and State

All persistence must respect the application's local-data and privacy invariants.

- Namespace keys as `devtools-<feature>`.
- Add a `-v1` suffix when a persisted schema needs versioning or migration.
- Parse persisted data defensively.
- Handle missing, malformed, and incompatible data without allowing expected corruption to crash rendering.
- Fall back to safe defaults only when that behavior is appropriate for the data and operation.
- Avoid silently discarding user data when migration or recovery is possible.
- Make persistence helpers accept a `Storage`-like parameter when that supports dependency injection and deterministic testing.
- Never persist secrets, tokens, passwords, or file contents.

The existing `src/utils/global-shortcut.ts` provides an example of injectable storage behavior.

When changing a persisted schema, assess existing installations, migration requirements, compatibility, and failure recovery rather than considering only fresh installs.

## 10. Testing and Verification

Testing should establish meaningful behavioral guarantees, not merely produce passing test counts.

### Test placement and style

- Domain and tool tests: `tests/tools/`
- Application-shell tests: `tests/app/`
- Helper and library tests: `tests/lib/`
- Desktop smoke testing: `e2e/smoke.mjs`

Use React Testing Library to test user-visible behavior rather than relying on component internals.

### Test expectations

For a bug fix, add a regression test that reproduces the relevant failure when practical.

For a new feature, test the principal successful behavior and meaningful invalid-input or failure paths.

Consider edge cases such as empty input, malformed data, boundary sizes, Unicode, repeated operations, corrupted persistence, and unavailable browser or native capabilities when relevant.

Tests should be deterministic, isolated, and independent of execution order.

- Use `vi.useFakeTimers()` for clock-dependent behavior when appropriate.
- Avoid network access, real filesystem dependencies, and real Tauri execution in ordinary unit tests.
- Mock true external boundaries rather than replacing the internal behavior under test.
- Keep desktop-specific integration coverage separate from browser-level unit tests.

`tests/setup.ts` provides a `localStorage` fallback for Node 26+, where the runtime's inert global shadows jsdom's. Preserve this behavior unless a verified alternative addresses the same issue.

### Verification discipline

Choose verification proportional to the risk and scope of the change.

A focused utility change may require targeted tests and type/build checks. A change to native capabilities, persistence, application initialization, or public behavior may require broader integration testing.

- Run relevant tests and inspect failures.
- Run the frontend build when appropriate.
- Run `pnpm run typecheck` and `pnpm run lint`; both are enforced in CI.
- Investigate unexpected regressions instead of dismissing them.
- Do not weaken assertions, skip failing tests, or alter unrelated code simply to obtain a green result.
- Report commands that could not be run and explain relevant environmental limitations.
- Never claim a test, build, benchmark, or security check passed without evidence.

### Resource-aware execution

The repository has experienced out-of-memory failures when tests and builds run concurrently on a 16 GB machine.

Run `pnpm test` and `pnpm run build:web` sequentially, not concurrently. The `maxWorkers: 2` setting in `vitest.config.ts` is deliberate; do not increase it casually.

When a full verification suite is too expensive, run focused checks first and then perform the required broader checks when feasible.

## 11. Dependencies and Tooling

Before adding a dependency, evaluate:

- Whether existing platform APIs or project dependencies already solve the problem.
- Maintenance status, compatibility, licensing, security posture, and transitive dependencies.
- Bundle-size and startup implications.
- Whether the package executes native install or build scripts.
- Whether the dependency is necessary for the required behavior.

Do not add a dependency merely to avoid a small, understandable implementation. Conversely, do not reinvent complex, security-sensitive functionality without a strong reason.

When a dependency has a postinstall or build script, add it to `allowBuilds` in `pnpm-workspace.yaml` as required by the repository's pnpm configuration. pnpm 12 blocks unlisted build scripts.

Inspect relevant package-manager documentation and the actual workspace configuration when behavior is uncertain.

## 12. Repository Commands

Use the project's existing scripts and installed tooling.

```bash
pnpm install
pnpm run dev
pnpm run dev:web
pnpm test
pnpm exec vitest run tests/tools/foo.test.ts
pnpm run build:web
pnpm run typecheck
pnpm run lint
pnpm exec tauri ...
```

`pnpm run lint` runs oxlint; `pnpm run typecheck` runs the TypeScript 7 compiler against the test and node projects. Both are enforced in CI.

For desktop smoke testing, build with:

```bash
pnpm exec tauri build --no-bundle --features e2e
```

pnpm forwards script arguments directly. For example:

```bash
pnpm run release:check v2.5.0
```

Do not use `-- v2.5.0`; the literal separator can reach the script.

Check the actual package scripts and configuration before assuming a command's scope or behavior.

## 13. Git, Scope, and Release Discipline

- Keep changes focused on the requested problem and its necessary dependencies.
- Inspect `git status` and the existing diff before modifying or reverting files.
- Preserve unrelated user changes.
- Do not discard, overwrite, reset, or clean up work you did not create without authorization.
- Do not claim ownership of unrelated modifications.
- Review the final diff for accidental changes, debug artifacts, weakened tests, and generated files.
- Update tests and documentation when the behavior or contract changes.

Conventional commit subjects use lowercase imperative wording and one concern per commit, with prefixes such as `feat:`, `fix:`, `test:`, `build:`, `docs:`, and `refactor:`.

Release procedure:

1. Run `pnpm run release:prepare <version>`.
2. Edit `release-notes/v<version>.md`.
3. Run `pnpm run release:check v<version>`.
4. Tag `v<version>` according to the release process.

See `docs/release-process.md`.

Do not publish releases, push changes, create tags, or perform other externally consequential Git operations unless the task authorizes them.

## 14. Existing Technical Debt and Known Gaps

Known issues are context for investigation, not permission to ignore defects.

- oxlint's `react-hooks/exhaustive-deps` did not report the missing `selectTool` dependency in the `useMemo` that used to sit at `src/app/DevToolsApp.tsx:489` and that ESLint flagged. Review dependency arrays by hand; the linter alone cannot be trusted to catch every omission.
- The README tool list and registry are maintained manually and can drift.

Do not expand the scope of an unrelated task merely to clean up these issues. Do not introduce additional violations or treat existing technical debt as an acceptable standard for new code.

When a known gap materially blocks the task, explain the impact and recommend an appropriately scoped resolution.

## 15. Definition of Done

A change is complete when its intended outcome is achieved and the relevant evidence supports that conclusion.

Before finishing:

1. Confirm that the implementation addresses the actual requirement or root cause.
2. Check relevant architectural boundaries and product invariants.
3. Review failure modes, input validation, security implications, and resource behavior where relevant.
4. Add or update appropriate regression and behavioral tests.
5. Run applicable verification commands within the repository's resource constraints.
6. Inspect the final diff for unintended changes.
7. Update documentation when required.
8. Summarize the implementation, important design decisions, verification performed, and any unresolved risks.

For complex or risky changes, explain the significant alternatives considered and why the selected design is appropriate.

Distinguish verified facts from assumptions. Identify incomplete verification explicitly.

Do not inflate a simple task into a lengthy architectural exercise, and do not reduce a complex or security-sensitive task to a superficial patch.

## 16. Further Reading

Consult the following sources when relevant to the task:

- `README.md` — user-facing overview and tool list.
- `.github/copilot-instructions.md` — supplementary architecture guidance.
- `docs/release-process.md` — versioning, signing, and publishing.

Inspect the actual source, tests, configuration, and relevant official documentation when these summaries do not provide enough evidence.

The repository itself is the primary source of truth for current implementation behavior.

---

**Engineering principle:** Understand the system. Protect its invariants. Investigate the real problem. Exercise independent technical judgment. Make the smallest coherent change that solves it. Verify the result and be honest about the evidence.