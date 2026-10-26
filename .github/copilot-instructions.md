# DevToolsApp: AI Development Guide

## Project Architecture

DevToolsApp is an offline-first desktop app. The UI is React, TypeScript, Vite, Tailwind CSS, and shadcn/ui. The desktop runtime is Tauri 2.

```
src/
├── app/
│   ├── DevToolsApp.tsx     # App shell: sidebar, search, command palette, updates
│   └── toolRegistry.ts     # Tool definitions and lazy-loaded tool components
├── components/tools/       # One React component per tool
├── lib/desktop.ts          # Bridge to the Tauri runtime
└── utils/                  # Pure tool logic, covered by unit tests

src-tauri/
├── src/main.rs             # Tauri entry point and the save_file command
├── tauri.conf.json         # Window, bundle, and updater configuration
└── capabilities/           # Permissions for the app window
```

## Adding a Tool

1. Put the pure logic in `src/utils/<tool>.ts`.
2. Create the component in `src/components/tools/<Tool>.tsx`.
3. Add the tool to `ALL_TOOLS` in `src/app/toolRegistry.ts`.
4. Register the lazy-loaded component in `TOOL_COMPONENTS` in the same file.
5. Add tests in `tests/tools/`.

## Desktop Runtime Rules

- Call Tauri APIs only through `src/lib/desktop.ts`. The UI must also work in a plain browser, where `getDesktopBridge()` returns `null`.
- Save files with `saveFile()` from `src/lib/desktop.ts`. Webviews do not handle blob downloads.
- Add a permission to `src-tauri/capabilities/default.json` only when a new plugin command needs it.
- Keep all tools offline. Do not add network calls or telemetry.

## Commands

```bash
npm run dev        # Tauri app with hot reload
npm run dev:web    # Web UI only, in a browser
npm test           # Unit tests (Vitest)
npm run build      # App and installers for the current platform
```

## Release

Follow `docs/release-process.md`. CI builds macOS, Windows, and Linux on each pull request and publishes releases from `v*` tags.
