# DevToolsApp — GitHub Copilot Instructions

## Mission

Help build and maintain DevToolsApp as a reliable, secure, maintainable, offline-first developer-tools application.

Work as an independent engineering collaborator, not a mechanical code generator. Understand the existing implementation, investigate the relevant architecture, identify the actual problem, and choose a solution based on evidence and engineering judgment.

Do not assume that existing code is necessarily correct. Do not introduce complexity merely to appear sophisticated. Prefer changes that improve correctness, clarity, security, performance, and maintainability without compromising established product behavior.

The repository's root `AGENTS.md` defines the broader engineering principles, product invariants, security requirements, testing expectations, and development workflow. Follow it alongside these instructions. Do not create conflicting rules or duplicate its entire contents here.

## 1. Understand the System Before Changing It

Treat DevToolsApp as a system with multiple execution environments and explicit boundaries.

Before making a meaningful change:

- Inspect the relevant implementation, callers, dependencies, configuration, and tests.
- Understand how data moves through the application and where state, side effects, and responsibilities belong.
- Identify the browser and desktop behavior affected by the change.
- Check existing abstractions and conventions, but evaluate whether they are appropriate for the problem.
- Expand the investigation when evidence reveals additional dependencies or failure modes.

Use repository search, source inspection, tests, type information, build output, and relevant documentation as needed. Do not rely solely on comments, architectural summaries, or assumptions about framework behavior.

Avoid both extremes: do not modify code without understanding its context, and do not perform an exhaustive repository audit for every small task.

## 2. Architecture and Dependency Boundaries

DevToolsApp is an offline-first desktop application built with React, TypeScript, Vite, Tailwind CSS, shadcn/ui, and Tauri 2. Its tools must also work in a plain browser.

### Frontend structure

```text
src/
├── app/
│   ├── DevToolsApp.tsx
│   └── toolRegistry.ts
├── components/
│   ├── tools/
│   ├── app/
│   └── ui/
├── hooks/
├── lib/
│   └── desktop.ts
└── utils/

src-tauri/
├── src/
│   └── main.rs
├── tauri.conf.json
└── capabilities/

tests/
e2e/
scripts/
docs/
```

Use the actual repository contents as the source of truth. The tree is an architectural guide, not an exhaustive inventory of files.

### Responsibilities

**`src/app/` — application shell**

Own application-level concerns such as navigation, tool discovery, theme, command palette, and updates. Avoid moving individual tool implementations or domain rules into the shell.

**`src/app/toolRegistry.ts` — tool discovery**

Own tool metadata, registration, and the mapping between tool definitions and lazily loaded components. Keep identifiers unique and metadata consistent with actual tool behavior.

**`src/components/tools/` — tool interfaces**

Own tool-specific rendering, user interaction, and UI state. Keep complex domain logic and unrelated infrastructure out of components when extracting them produces a clearer, more testable design.

**`src/components/app/` — shared application interactions**

Own reusable application-level interactions such as command palette behavior, paste suggestions, and keyboard shortcuts.

**`src/components/ui/` — shared UI primitives**

Reuse existing primitives when their contracts fit the requirement. Avoid introducing duplicate primitives or changing shared behavior to accommodate one tool without evaluating the effects on other consumers.

**`src/hooks/` — reusable React behavior**

Use hooks to encapsulate reusable stateful behavior and lifecycle-sensitive interactions. Do not create a hook merely to wrap a single expression or move code without establishing a meaningful responsibility.

**`src/utils/` — domain logic**

Prefer pure, deterministic functions for parsing, conversion, formatting, validation, and other operations that do not require UI or platform access.

Pure utilities should not import React, access the DOM, or depend on Tauri. Keep side effects at explicit boundaries.

**`src/lib/desktop.ts` — desktop integration boundary**

Centralize access to Tauri APIs and expose the application's intended desktop operations. Components and domain utilities should not bypass this boundary with direct `@tauri-apps/*` imports.

**`src-tauri/` — native execution**

Own native commands, Tauri configuration, filesystem operations, and capability permissions. Keep native behavior explicit, narrowly scoped, and compatible with the frontend's expected contracts.

### Dependency direction

Preserve the intended separation between domain logic, UI, and platform-specific capabilities.

- Pure domain logic should remain independent of the UI and native runtime.
- UI components may consume domain utilities, hooks, and established application services.
- Native operations should be accessed through the desktop abstraction.
- Application-shell code should coordinate tools rather than absorb their internal logic.
- Shared abstractions should have clear ownership and a justified set of consumers.

If an existing dependency violates these intentions, investigate the reason before changing it. Correct architectural problems when they materially affect the task, but avoid unrelated rewrites.

## 3. Browser and Desktop Are Different Execution Environments

A tool must work in both the Tauri desktop application and the browser-only application.

Use `getDesktopBridge()` from `src/lib/desktop.ts` to determine whether the desktop bridge is available. In a plain browser, it returns `null`.

Design the UI around explicit capability availability rather than assuming that native functionality always exists.

When an operation requires a native capability:

1. Keep the native call behind the desktop abstraction.
2. Handle an unavailable bridge explicitly.
3. Provide an appropriate browser-compatible behavior when possible.
4. Otherwise, explain the limitation to the user without crashing or leaving an ambiguous UI.
5. Test the relevant browser and desktop behavior.

Save files through `saveFile()` from `src/lib/desktop.ts`. Do not assume ordinary browser blob-download behavior works consistently in the application's webview.

When investigating cross-runtime bugs, trace the complete operation as needed: UI interaction, frontend state, bridge invocation, IPC serialization, Rust command execution, filesystem behavior, and error propagation.

Do not add runtime-specific complexity unless the behavior requires it.

## 4. Tool Development and Registration

When adding a developer utility, use the existing tool architecture as the starting point.

1. Inspect comparable tools, utility functions, shared UI primitives, registry conventions, and tests.
2. Define the tool's inputs, outputs, expected behavior, invalid-input handling, and relevant resource limits.
3. Implement domain logic in `src/utils/<tool>.ts` when a separate pure-logic module is appropriate.
4. Implement the UI in `src/components/tools/<Tool>.tsx`.
5. Add a unique entry to `ALL_TOOLS` in `src/app/toolRegistry.ts`, including the required category, icon, and search keywords.
6. Register the component in `TOOL_COMPONENTS` using the existing lazy-loading convention.
7. Add tests in `tests/tools/` for the core behavior, meaningful edge cases, and relevant UI interactions.
8. Update the README tool list and other affected documentation.
9. Verify browser compatibility, lazy loading, and native behavior where applicable.

These are the normal integration points, not a requirement to introduce unnecessary layers into every tool.

### Lazy loading and bundle size

New tools must remain lazy-loaded.

Keep tool-specific heavy dependencies out of the initial import graph when practical. Inspect Vite's generated output when a dependency's bundle impact or code-splitting behavior matters.

Do not assume that writing a dynamic import automatically guarantees the intended final bundle structure. Verify the build output when the distinction is important.

## 5. Engineering and Implementation Judgment

Use established project conventions when they help maintain consistency, but do not reproduce a defective design simply because it already exists.

Choose abstractions based on responsibility, coupling, reuse, complexity, and testability.

- Prefer cohesive modules and explicit contracts.
- Separate domain rules from UI and infrastructure when the separation provides real value.
- Use precise TypeScript types and validate untrusted runtime data.
- Handle errors at meaningful boundaries and preserve useful diagnostic context.
- Avoid unnecessary indirection, speculative generalization, and design patterns without a concrete purpose.
- Avoid arbitrary line-count targets and artificial restrictions on how many functions or hooks an operation may use.
- Keep simple code simple; introduce stronger structure when complexity justifies it.

When a proposed implementation seems unnecessarily complicated, investigate whether the underlying problem can be solved more directly. When a simple patch hides a broader correctness or architectural defect, address the actual cause rather than only its visible symptom.

For complex changes, consider alternative approaches and explain the meaningful trade-offs.

## 6. Systems, Security, and Performance Reasoning

Use the appropriate level of technical depth for the problem.

For ordinary UI work, reason primarily about state, rendering, user interaction, accessibility, and browser behavior.

For more complex issues, investigate the underlying mechanisms where relevant:

- JavaScript execution, event-loop scheduling, asynchronous operations, and memory allocation.
- Browser APIs, webview differences, rendering costs, and main-thread blocking.
- Data serialization, IPC boundaries, and JavaScript-to-Rust interactions.
- Filesystem semantics, native resource lifetimes, and operating-system permissions.
- Input size, algorithmic complexity, pathological payloads, and peak memory consumption.
- Vite module graphs, code splitting, initial bundle size, and startup costs.

Treat pasted data and external inputs as untrusted. Consider malformed input, injection risks, resource exhaustion, accidental data exposure, and unsafe native operations.

For performance changes, establish a baseline, investigate the likely bottleneck, and compare results under equivalent conditions. Do not add caching, workers, dependencies, or low-level optimizations without a credible justification.

These considerations complement the security and performance requirements in the root `AGENTS.md`; they do not override them.

## 7. Testing and Verification

Use the repository's existing test conventions and tooling.

- Domain and tool tests belong in `tests/tools/`.
- Application-shell tests belong in `tests/app/`.
- Helper and library tests belong in `tests/lib/`.
- Desktop smoke testing uses `e2e/smoke.mjs`.

Prefer tests that establish observable behavior rather than implementation details.

For bug fixes, add a regression test that would have exposed the original defect when practical. For new features, test successful behavior and meaningful invalid-input or failure paths.

Mock external boundaries appropriately. Avoid unnecessary mocking of the internal behavior that the test is intended to verify.

Choose verification proportional to the scope and risk of the change. Run targeted tests first when useful, then broader checks as appropriate.

The repository has a known memory constraint: run `pnpm test` and `pnpm run build:web` sequentially, not concurrently. Preserve the deliberate `maxWorkers: 2` configuration unless a separate, evidence-backed change justifies revisiting it.

Do not claim that a test, build, benchmark, or other check passed unless it was actually executed and its result inspected. Report relevant verification gaps honestly.

Consult the root `AGENTS.md` for the complete command list, known repository issues, and required verification expectations.

## 8. Tooling and Dependencies

Use pnpm exclusively for package management and repository scripts.

Before adding a dependency, consider whether existing APIs or packages already solve the problem, and evaluate maintenance, compatibility, security, transitive dependencies, bundle impact, and native build requirements.

When a dependency has a postinstall or build script, follow the workspace's `allowBuilds` configuration requirements.

Do not introduce npm or Yarn lockfiles, bypass package-manager safeguards, or add unnecessary dependencies.

Verify commands and APIs against the actual installed versions and repository configuration rather than assuming newer documentation applies.

## 9. Change Scope and Review

Keep changes focused on the requested outcome and its necessary dependencies.

Before editing, inspect the working tree and relevant existing changes. Preserve unrelated user modifications. Do not reset, overwrite, or remove work that you did not create without authorization.

Before finishing:

- Review the resulting diff.
- Check for unintended changes and regressions.
- Confirm that affected contracts and documentation remain consistent.
- Identify meaningful unresolved risks or assumptions.
- Summarize what changed and which checks were actually performed.

Do not perform unrelated refactors merely because they are nearby. Equally, do not ignore a directly relevant defect just to preserve superficial consistency.

## 10. Source of Truth

Use these sources in order of relevance:

1. The actual implementation and its executable behavior.
2. Tests, type definitions, and configuration that establish contracts.
3. Root `AGENTS.md` for repository-wide engineering principles and constraints.
4. Relevant documentation, including `README.md` and `docs/release-process.md`.
5. `.github/copilot-instructions.md` for the supplementary context defined here.

Consult official framework and platform documentation when implementation details, security semantics, or runtime behavior are uncertain.

Do not invent repository APIs, assume unsupported runtime capabilities, or treat stale documentation as proof of current behavior.

## Engineering Principle

Understand the relevant system before changing it. Preserve product invariants. Challenge flawed assumptions. Choose a coherent solution based on evidence. Verify behavior at the boundaries that matter.

The goal is not merely to produce code that compiles. The goal is to make the software more correct, secure, maintainable, and reliable.