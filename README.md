# DevToolsApp Desktop

Offline-first developer utilities for macOS, Windows, and Linux. No cloud dependencies, no data collection.

![DevToolsApp Desktop](assets/app-screenshot.png)

## Features

### Development Tools

- **JSON Viewer** - Format, validate, and minify JSON with syntax highlighting
- **Code Playground** - Multi-language editor (JS, HTML, CSS, JSON, Markdown)
- **Regex Generator** - Interactive regex construction with live testing
- **JSON to TypeScript** - Generate TypeScript interfaces from JSON

### Generators

- **Hash Generator** - MD5, SHA-1, SHA-256, SHA-512
- **UUID Generator** - Generate v1/v4/v6/v7 UUIDs and ULIDs with batch support
- **Password Generator** - Generate secure passwords and passphrases with strength analysis
- **Lorem Ipsum** - Generate placeholder text
- **QR Generator** - Generate QR codes with custom size and error correction
- **Bcrypt Generator** - Generate bcrypt hashes locally

### Converters

- **Base64** - Encode/decode text and files
- **Case Converter** - Transform between camelCase, snake_case, kebab-case, and more
- **Number Base** - Convert between decimal, binary, octal, hex
- **Markdown** - Live preview and export markdown content
- **URL Encoder** - Encode/decode URLs and URI components
- **CSV to JSON** - Bidirectional CSV and JSON conversion with custom delimiters

### Time & Date

- **Timestamp** - Unix timestamp conversion with multiple formats
- **Date Difference** - Calculate the difference between two dates
- **Cron Calculator** - Build cron expressions with plain English descriptions

### Media

- **Color Palette** - Create monochromatic, analogous, complementary schemes
- **Image Converter** - Convert between PNG, JPEG, WebP, BMP

### Text Tools

- **Text Compare** - Diff viewer with line-by-line comparison
- **JWT Decoder** - Decode and inspect JWT tokens
- **API Formatter** - Format REST and GraphQL responses with tree view and search

### Utilities

- **Unit Converter** - Convert length, weight, temperature, and currency units

## Download

Get the latest release for your platform:

- **[macOS (Intel)](https://github.com/me-shaon/devtools/releases/latest/download/DevToolsApp-macos-x64.dmg)**
- **[macOS (Apple Silicon)](https://github.com/me-shaon/devtools/releases/latest/download/DevToolsApp-macos-arm64.dmg)**
- **[Windows](https://github.com/me-shaon/devtools/releases/latest/download/DevToolsApp-windows-setup.exe)**
- **[Linux — .deb (Debian, Ubuntu, Mint) (x64)](https://github.com/me-shaon/devtools/releases/latest/download/DevToolsApp-linux-amd64.deb)**
- **[Linux — .deb (Debian, Ubuntu, Mint) (arm64)](https://github.com/me-shaon/devtools/releases/latest/download/DevToolsApp-linux-arm64.deb)**
- **[Linux — .rpm (Fedora, RHEL, openSUSE) (x64)](https://github.com/me-shaon/devtools/releases/latest/download/DevToolsApp-linux-x86_64.rpm)**
- **[Linux — .rpm (Fedora, RHEL, openSUSE) (arm64)](https://github.com/me-shaon/devtools/releases/latest/download/DevToolsApp-linux-aarch64.rpm)**
- **[Linux — .AppImage (x64)](https://github.com/me-shaon/devtools/releases/latest/download/DevToolsApp-linux-x86_64.AppImage)**
- **[Linux — .AppImage (arm64)](https://github.com/me-shaon/devtools/releases/latest/download/DevToolsApp-linux-arm64.AppImage)**

## Quick Start

```bash
# Clone and install
git clone https://github.com/me-shaon/devtools.git
cd devtools
npm install

# Run locally (development mode)
npm run dev

# Build for distribution
npm run dist
```

## Requirements

- Node.js 18+
- npm or yarn

## Architecture

```
src/
├── components/
│   └── tools/       # Tool implementations (25 React components)
├── app/
│   └── DevToolsApp.tsx   # Main app with sidebar navigation
└── main.tsx         # React entry point

src-electron/
├── main.ts          # Electron main process
└── preload.ts       # Secure IPC bridge
```

### Tech Stack

- **Electron** 40+ for desktop runtime
- **React** 18+ with TypeScript
- **Vite** for fast builds and hot reload
- **Tailwind CSS** for styling
- **shadcn/ui** for UI components
- No analytics or telemetry

## Development

### Running in Development

```bash
npm run dev    # Starts Vite dev server + Electron
```

### Build Scripts

```bash
npm run dev              # Development mode with hot reload
npm run build            # Build React app + Electron
npm run test             # Run the test suite
npm run lint             # Run ESLint
npm run dist             # Create installers for all platforms
npm run dist:mac         # Build macOS packages
npm run dist:win         # Build Windows packages
npm run dist:linux       # Build Linux packages
npm run dist:publish     # Build and publish to GitHub releases
```

## Adding a Tool

1. Create component in `src/components/tools/YourTool.tsx`
2. Add tool definition to `ALL_TOOLS` array in `src/app/DevToolsApp.tsx`
3. Register the lazy-loaded component in `TOOL_COMPONENTS` in `src/app/DevToolsApp.tsx`
4. Add tests if the new tool has non-trivial behavior
5. That's it! The tool will appear in the sidebar automatically

## Contributing

We welcome contributions! This project is continuously being improved by user feedback and contributions.

### Pull Requests

Pull requests welcome. For major changes, open an issue first to discuss the proposed changes.

### Development Setup

```bash
git clone https://github.com/me-shaon/devtools.git
cd devtools
npm install
npm run dev  # Run in development mode
```

## License

MIT
