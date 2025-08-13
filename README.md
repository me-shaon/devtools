# DevTools Desktop

Offline-first developer utilities for macOS, Windows, and Linux. No cloud dependencies, no data collection.

![DevTools Desktop](https://github.com/me-shaon/devtools/blob/main/assets/screenshot.png?raw=true)

## Features

### Text & Code

- **JSON Viewer** - Format, validate, and minify JSON with syntax highlighting
- **Text Compare** - Diff viewer with line-by-line comparison
- **Case Converter** - Transform between camelCase, snake_case, kebab-case, and more
- **SQL Formatter** - Format SQL queries with customizable indentation
- **Markdown Editor** - Live preview with export support
- **Code Playground** - Multi-language editor (JS, HTML, CSS, JSON, Markdown)

### Converters

- **Base64** - Encode/decode text and files
- **URL Encoder** - Encode/decode URLs and URI components
- **CSV ↔ JSON** - Bidirectional conversion with custom delimiters
- **JSON → TypeScript** - Generate TypeScript interfaces from JSON
- **Number Base** - Convert between decimal, binary, octal, hex

### Generators

- **UUID** - Generate v1/v4 UUIDs with batch support
- **Password Generator** - Generate secure passwords and passphrases with strength analysis
- **Hash** - MD5, SHA-1, SHA-256, SHA-512
- **QR Code** - Generate QR codes with custom size and error correction
- **Color Palette** - Create monochromatic, analogous, complementary schemes
- **Lorem Ipsum** - Generate placeholder text

### Developer Utilities

- **JWT Decoder** - Decode and inspect JWT tokens
- **Regex Builder** - Interactive regex construction with live testing
- **Cron Parser** - Build cron expressions with plain English descriptions
- **Timestamp Converter** - Unix timestamp conversion with multiple formats
- **Image Converter** - Convert between PNG, JPEG, WebP, BMP

## Quick Start

```bash
# Clone and install
git clone https://github.com/yourusername/devtools-desktop.git
cd devtools-desktop
npm install

# Run locally
npm start

# Build for distribution
npm run dist

# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Run tests in watch mode
npm run test:watch
```

## Testing

This project uses Jest for unit testing with comprehensive test coverage for utility functions:

- **Base64Utils** - Complete test coverage for encoding/decoding functionality
- **PasswordUtils** - Comprehensive testing for password generation and strength analysis
- **jsdom environment** - Tests run in a simulated browser environment
- **Mocked browser APIs** - Navigator, clipboard, and DOM APIs are properly mocked

Run `npm test` to execute all tests or `npm run test:watch` for development with auto-reload.

## Requirements

- Node.js 14+
- npm or yarn

## Architecture

```
src/
├── main.js              # Electron main process
└── renderer/
    ├── index.html       # Single-page application
    ├── styles/          # CSS modules
    └── js/
        ├── main.js      # App router and state
        └── tools/       # Tool implementations (21 modules)
```

Each tool is a self-contained module with no external dependencies. All processing happens client-side.

## Development

### Adding a Tool

1. Create module in `src/renderer/js/tools/`
2. Add HTML section in `index.html`
3. Register in navigation sidebar
4. Add menu item in `src/main.js`

### Build Scripts

```bash
npm start          # Development server
npm run build      # Build executable
npm run pack       # Package without distributing
npm run dist       # Create installer
```

## Tech Stack

- Electron 22+ for desktop runtime
- Vanilla JavaScript (ES6+)
- No framework dependencies
- No analytics or telemetry

## Contributing

Pull requests welcome. For major changes, open an issue first.

## License

MIT
