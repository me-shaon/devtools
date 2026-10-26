# Release Process

This project uses a small human-reviewed release workflow with CI validation. The goal is to keep these in sync for every version bump:

- app version in `package.json` (the Tauri bundle reads its version from this file)
- packaged app version in `package-lock.json`
- Rust crate version in `src-tauri/Cargo.toml`
- GitHub release notes in `release-notes/vX.Y.Z.md`

## Quick Flow

1. Run `npm run release:prepare -- 1.2.0`
2. Edit `release-notes/v1.2.0.md`
3. Run `npm run release:check -- v1.2.0`
4. Commit the changes
5. Create and push the tag: `git tag v1.2.0 && git push origin v1.2.0`

On tag push, CI will:

- verify the version and changelog files are consistent
- run the test suite
- build the desktop packages for macOS (arm64 and x64), Windows (x64), and Linux (x64 and arm64)
- run the end-to-end smoke test on Linux
- create the updater manifest `latest.json`
- publish the GitHub release using `release-notes/vX.Y.Z.md` as the release body

## Signing and Updates

The release workflow uses the secrets in the `Production` environment.

| Secret | Use |
| --- | --- |
| `TAURI_SIGNING_PRIVATE_KEY` | Signs the updater artifacts. The public key is in `src-tauri/tauri.conf.json`. |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Password of the updater key. Leave it empty if the key has no password. |
| `CSC_LINK` | Base64 Developer ID Application certificate (`.p12`) for macOS code signing. |
| `CSC_KEY_PASSWORD` | Password of the macOS certificate. |
| `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` | macOS notarization. |

If `TAURI_SIGNING_PRIVATE_KEY` is missing or a platform has no signed updater asset, the release job fails. A release without a complete `latest.json` would stop installed apps from updating. If the macOS certificate is missing, the macOS app gets an ad-hoc signature.

Keep a backup of the updater private key. If you lose it, installed apps cannot verify new updates. To replace the key, run `npx tauri signer generate`. Put the new public key in `src-tauri/tauri.conf.json`. Update the secret. Users of older versions must then download the new version manually.

The release assets use fixed names, for example `DevToolsApp-macos-arm64.dmg`. The download links in `README.md` depend on these names. `scripts/collect-release-assets.mjs` sets the names.

## Source Files

### GitHub release body

Write the public release notes in:

- `release-notes/vX.Y.Z.md`

This file is published directly to the GitHub release page.

### In-app "What's New"

The app also reads the same `release-notes/vX.Y.Z.md` file for the first-launch changelog modal and the persistent `What's New` link. This markdown file is the single source of truth for both GitHub and the in-app release notes.

## Writing Guidelines

Keep release notes short and readable:

- start with 2 to 4 clear highlights
- group changes into simple sections like `Tool Improvements` and `App Updates`
- describe user-facing outcomes, not implementation trivia
- avoid raw commit-style bullets like `fix bug` or `refactor code`

Good example:

- `Text Compare now includes git-style unified diff and character-level detail.`

Weak example:

- `updated diff utility and changed rendering logic`

## AI Agent Checklist

If an AI agent is preparing a release, it should follow this exact checklist:

1. Determine the target version number.
2. Run `npm run release:prepare -- <version>`.
3. Write `release-notes/v<version>.md` in clear human-facing language.
4. Run `npm run release:check -- v<version>`.
5. Run the relevant tests or validation commands.
6. Commit the release changes.
7. Create the tag only after the validation passes.

The agent must not create or push a release tag if:

- `package.json` version does not match the tag
- `package-lock.json` version does not match the tag
- `release-notes/vX.Y.Z.md` is missing or empty

## AI Agent Prompt

Use this prompt when you want an AI agent to prepare a release and you only want to provide the version tag:

```text
Prepare release v1.2.0 for DevToolsApp.

Follow docs/release-process.md exactly and complete the full release-preparation workflow.

Requirements:
1. Run `npm run release:prepare -- 1.2.0`
2. Write or refine `release-notes/v1.2.0.md`
3. Treat `release-notes/v1.2.0.md` as the single source of truth for both the GitHub release body and the in-app What's New modal
4. Run `npm run release:check -- v1.2.0`
5. Run the relevant tests or validation commands
6. Fix any issues found during validation
7. Commit the release-preparation changes
8. Do not create or push the git tag unless I explicitly ask you to

Important:
- Do not skip any step in docs/release-process.md
- Do not maintain duplicate changelog data elsewhere
- If validation fails, fix it before proceeding
```

If you want the agent to also create and push the tag, use this variant instead:

```text
Prepare and ship release v1.2.0 for DevToolsApp.

Follow docs/release-process.md exactly and complete the full release workflow.

Requirements:
1. Run `npm run release:prepare -- 1.2.0`
2. Write or refine `release-notes/v1.2.0.md`
3. Run `npm run release:check -- v1.2.0`
4. Run the relevant tests or validation commands
5. Fix any issues found during validation
6. Commit the release changes
7. Create git tag `v1.2.0`
8. Push the commit and tag

Important:
- Do not skip any step in docs/release-process.md
- Do not continue if validation is failing
```

## Commands

Prepare a new release:

```bash
npm run release:prepare -- 1.2.0
```

Validate a release locally:

```bash
npm run release:check -- v1.2.0
```
