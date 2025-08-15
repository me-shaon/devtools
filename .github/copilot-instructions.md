# DevTools Desktop - AI Development Guide

## Project Architecture

**Single-Page Electron App**: This is an offline-first desktop application built with Electron + vanilla JavaScript. No frameworks, no build steps for frontend code.

```
src/
├── main.js              # Electron main process (menu, window management)
└── renderer/
    ├── index.html       # SPA with all tools in one file (1327 lines)
    ├── js/main.js       # App router, tool switching, IPC communication
    └── js/tools/        # 22 self-contained tool modules
```

## Critical Patterns

### Tool Module Structure

Each tool follows this exact pattern - **always match this when adding new tools**:

```javascript
class ToolName {
  constructor() {
    this.init();
  }

  init() {
    // Set up event listeners for tool-specific buttons
    const btn = document.getElementById('tool-button');
    if (btn) {
      btn.addEventListener('click', () => this.methodName());
    }
  }
}

// Global instance registration
window.ToolName = new ToolName();
```

### Tool Registration Workflow

Adding a new tool requires **exactly 4 steps**:

1. **Create module**: `src/renderer/js/tools/new-tool.js`
2. **Add HTML section**: In `index.html` with class `tool-container` and matching ID
3. **Add navigation**: In `index.html` sidebar with `data-tool="new-tool"`
4. **Add menu item**: In `src/main.js` electron menu (if needed)

### Dual Environment Support

**Critical**: All tools must work in both Electron and browser environments:

```javascript
const isElectron =
  typeof require !== 'undefined' &&
  window.process &&
  window.process.type === 'renderer';
```

Use `window.app?.showMessage()` for notifications (fails gracefully in browser).

### Error Handling Pattern

**Standard error display** used across all tools:

```javascript
showError(message) {
    const errorDiv = document.getElementById('tool-error');
    if (errorDiv) {
        errorDiv.textContent = message;
        errorDiv.style.display = 'block';
    }
}

clearErrors() {
    const errorDiv = document.getElementById('tool-error');
    if (errorDiv) {
        errorDiv.style.display = 'none';
    }
}
```

## Testing Architecture

**Jest + Node.js environment** with extensive DOM mocking in `tests/setup.js`. Tests are split into:

- **Unit tests**: `src/utils/*.js` modules (extracted logic)
- **Integration tests**: Tool classes with mocked DOM
- **Security tests**: Referenced but `scripts/security-check.sh` missing

**Test file naming**: `toolname.test.js` and `toolname-integration.test.js`

## Development Commands

```bash
npm start              # Electron dev mode
npm run dev            # Electron with DevTools open
npm test               # Jest test suite
npm run test:watch     # Jest watch mode
npm run dist           # Build distribution packages
```

## Dependencies & Constraints

**Runtime deps**: `crypto-js`, `jsonwebtoken`, `marked`, `node-cron`, `qrcode`, `uuid`
**No build pipeline**: Vanilla JS/CSS, direct file serving
**No analytics**: Completely offline, no telemetry
**Security-first**: GitGuardian integration, pre-commit hooks

## State Management

**No global state** - each tool is isolated. App state limited to:

- `currentTool` in DevToolsApp class
- Tool-specific state in individual tool instances
- Electron preferences via IPC (`src/main.js` handles file operations)

## Key Integration Points

- **IPC**: `ipcRenderer.invoke('save-file')` for file operations
- **Tool activation**: `switchTool()` method triggers tool-specific `init()` methods
- **Menu navigation**: Electron menu items trigger IPC messages to switch tools
- **Clipboard**: Used extensively but mocked in tests with `navigator.clipboard`

Focus on self-contained, offline-capable tools that follow the established module pattern.
