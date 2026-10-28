# code-quality-gates Specification

## Purpose

Defines the static-analysis contract for the repository: which checks must run over which code, what counts as a clean result, and that continuous integration refuses to accept a regression.

## Requirements

### Requirement: Lint gate

The repository SHALL provide a single lint command that analyses every hand-written TypeScript and TSX file in the project — application source, tests, and build scripts — and exits non-zero when any finding at error severity exists.

#### Scenario: Clean tree passes
- **WHEN** the lint command runs on the repository with no findings
- **THEN** it exits with status 0

#### Scenario: A violation fails the command
- **WHEN** any covered file contains a construct the enabled rule set classifies as an error
- **THEN** the command reports the file, line, rule, and exits with a non-zero status

#### Scenario: Generated output is excluded
- **WHEN** the lint command runs
- **THEN** it does not analyse build output, Tauri generated bindings, or vendored dependency folders

### Requirement: Rule set preserves existing coverage

The enabled rule set SHALL cover, at minimum, the concerns the project enforced before the change: forbidden explicit `any`, forbidden empty object types, forbidden CommonJS `require` in ES modules, forbidden useless regex escapes, exhaustive React hook dependency arrays, and React Fast Refresh export boundaries.

#### Scenario: Existing rule families still fire
- **WHEN** a file introduces an explicit `any`, an empty interface, or a dependency array missing a referenced value
- **THEN** the lint command reports it

#### Scenario: Unrelated rule families stay off
- **WHEN** the lint command runs
- **THEN** rule families the project did not previously enforce — React Compiler diagnostics and unicorn style preferences — do not produce findings

### Requirement: Type check gate

The repository SHALL provide a type-check command that type-checks the application source and the test suite together under strict null and strict type checking, without emitting output.

#### Scenario: Both source and tests are covered
- **WHEN** the type-check command runs
- **THEN** a type error in application source and a type error in a test file are both reported

#### Scenario: Nullability is enforced
- **WHEN** source code dereferences a value that may be null or undefined
- **THEN** the type-check command reports an error

#### Scenario: Clean tree passes
- **WHEN** the type-check command runs on a tree with no type errors
- **THEN** it exits with status 0

### Requirement: Zero-debt baseline

The repository SHALL reach and hold a baseline of zero lint findings and zero type errors, so that both gates are meaningful.

#### Scenario: Baseline is clean
- **WHEN** both gates run on the main branch
- **THEN** neither reports any finding

#### Scenario: Suppressions must be justified
- **WHEN** a suppression comment disables a rule that no longer produces a finding on that line
- **THEN** the lint command reports the stale suppression as an error

### Requirement: CI enforcement

Continuous integration SHALL run the lint gate and the type-check gate on every push and pull request to the main branch, and SHALL fail the run before building when either gate fails.

#### Scenario: Lint failure blocks the pipeline
- **WHEN** a pull request introduces a lint error
- **THEN** CI fails and the build stage does not run

#### Scenario: Type failure blocks the pipeline
- **WHEN** a pull request introduces a type error
- **THEN** CI fails and the build stage does not run

#### Scenario: Passing gates do not block
- **WHEN** a pull request leaves both gates clean
- **THEN** CI proceeds to tests and build

### Requirement: Compiler configuration validity

The project SHALL use the current major release of the TypeScript compiler and SHALL NOT carry configuration options the compiler rejects or options that no project consumes.

#### Scenario: Removed options are absent
- **WHEN** the compiler runs against each project configuration
- **THEN** it reports no configuration errors

#### Scenario: No inert configuration remains
- **WHEN** a compiler option is declared in a configuration that no project extends or includes
- **THEN** that option is removed

#### Scenario: Toolchain is not blocked by removed APIs
- **WHEN** the compiler major version is upgraded
- **THEN** no enabled tool depends on the compiler's programmatic JavaScript API
