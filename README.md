# Dev Tools Desktop

A comprehensive desktop application built with Electron that replicates the full functionality of dev-tool.dev. This application provides 21 essential developer tools in a clean, native desktop interface with offline functionality.

## 🎉 All Features Completed! ✅

### Text Processing & Formatting Tools
1. **JSON Viewer** - Format, minify, validate JSON with syntax highlighting and detailed info
2. **Text Compare** - Line-by-line diff comparison with similarity metrics and highlighting
3. **Case Converter** - Convert between camelCase, PascalCase, snake_case, kebab-case, UPPER, lower, Title Case
4. **SQL Formatter** - Format and minify SQL queries with keyword highlighting and indentation options
5. **Markdown Editor** - Live preview markdown editor with toolbar and export functionality

### Data Conversion & Generation Tools
6. **Base64 Converter** - Bidirectional Base64 encoding/decoding with error handling
7. **URL Encoder/Decoder** - Encode and decode URLs and URI components safely
8. **CSV ↔ JSON Converter** - Convert between CSV and JSON with header support and delimiter options
9. **JSON to TypeScript** - Smart conversion of JSON to TypeScript interfaces with nested support
10. **Number Base Converter** - Convert between decimal, binary, octal, and hexadecimal with live sync

### Security & Encoding Tools
11. **JWT Decoder** - Decode JWT tokens with header, payload, signature display and expiration info
12. **Hash Generator** - Generate MD5, SHA-1, SHA-256, SHA-512 hashes with live updates
13. **UUID Generator** - Generate UUID v1/v4 with batch generation up to 100 UUIDs

### Development Tools
14. **Regex Generator** - Interactive regex builder with pattern explanation and live testing
15. **Code Playground** - Multi-language code editor supporting JavaScript, HTML, CSS, JSON, Markdown
16. **Cron Calculator** - Cron expression builder with natural language description and next run times
17. **Timestamp Converter** - Bidirectional timestamp conversion with live clock and multiple formats

### Media & Visual Tools
18. **Image Format Converter** - Convert between PNG, JPEG, WebP, BMP with quality settings
19. **QR Code Generator** - Generate QR codes with size and error correction options
20. **Color Palette Generator** - Create color schemes (monochromatic, analogous, complementary, triadic, tetradic)

### Content Generation
21. **Lorem Ipsum Generator** - Generate placeholder text (paragraphs, sentences, words) with customizable count

## Installation

1. **Prerequisites**
   - Node.js (v14 or higher)
   - npm or yarn

2. **Install Dependencies**
   ```bash
   npm install
   ```

3. **Run the Application**
   ```bash
   npm start
   ```

4. **Development Mode**
   ```bash
   npm run dev
   ```

## Build & Distribution

- **Build for Current Platform**
  ```bash
  npm run build
  ```

- **Package Without Distribution**
  ```bash
  npm run pack
  ```

- **Create Distributables**
  ```bash
  npm run dist
  ```

## Features & Functionality

### Core Features
- **Native Desktop Interface** - Built with Electron for cross-platform compatibility
- **Responsive Design** - Works on various screen sizes with mobile-friendly navigation
- **Privacy-First** - All processing happens locally, no data sent to external servers
- **Keyboard Shortcuts** - Full menu bar integration with standard shortcuts
- **File Operations** - Import/export functionality for supported tools
- **Real-time Processing** - Instant results as you type
- **Error Handling** - Comprehensive error messages and validation

### Technical Highlights
- **Modern JavaScript** - ES6+ features with async/await
- **Modular Architecture** - Each tool is a separate, self-contained module
- **Clean UI/UX** - Inspired by modern developer tools with intuitive navigation
- **Performance Optimized** - Efficient algorithms for text processing and conversions
- **Cross-Platform** - Supports macOS, Windows, and Linux

## Project Structure

```
dev-tools-desktop/
├── src/
│   ├── main.js                 # Main Electron process
│   └── renderer/
│       ├── index.html          # Main application window
│       ├── styles/
│       │   └── main.css        # Application styles
│       └── js/
│           ├── main.js         # Application navigation & core
│           └── tools/          # Individual tool modules
│               ├── json-viewer.js
│               ├── text-compare.js
│               ├── case-converter.js
│               ├── uuid-generator.js
│               ├── base64-converter.js
│               ├── jwt-decoder.js
│               ├── json-to-ts.js
│               ├── hash-generator.js
│               ├── url-encoder.js
│               ├── timestamp.js
│               └── lorem-generator.js
├── package.json
└── README.md
```

## Contributing

Contributions are welcome! Here's how you can help:

1. **Fork the repository**
2. **Create a feature branch** (`git checkout -b feature/new-tool`)
3. **Implement your changes**
4. **Add tests if applicable**
5. **Commit your changes** (`git commit -am 'Add new tool'`)
6. **Push to the branch** (`git push origin feature/new-tool`)
7. **Create a Pull Request**

### Adding New Tools

To add a new tool:

1. **Create HTML structure** in `src/renderer/index.html`
2. **Add navigation link** in the sidebar
3. **Create tool JavaScript module** in `src/renderer/js/tools/`
4. **Include script tag** in the HTML
5. **Add menu integration** in `src/main.js`
6. **Test functionality**

## License

MIT License - see LICENSE file for details.

## Acknowledgments

- Inspired by [dev-tool.dev](https://dev-tool.dev/)
- Built with [Electron](https://www.electronjs.org/)
- Icons by [Font Awesome](https://fontawesome.com/)

## 🚀 Ready for Production

This is a complete implementation of dev-tool.dev as a desktop application. All 21 tools are fully functional with professional-grade features:

- **Privacy-first**: All processing happens locally - no data sent to servers
- **Offline-ready**: Works without internet connection  
- **Cross-platform**: Runs on macOS, Windows, and Linux
- **Native performance**: Built with Electron for smooth desktop experience
- **Professional UI/UX**: Clean, intuitive interface with responsive design

## Quick Start

```bash
# Install dependencies
npm install

# Run the application
npm start

# Package for distribution
npm run pack
```

## 📋 Complete Feature List

### Core Capabilities
- ✅ Real-time processing and live updates
- ✅ Error handling and validation for all tools  
- ✅ Copy-to-clipboard functionality
- ✅ File import/export where applicable
- ✅ Keyboard shortcuts and menu integration
- ✅ Responsive design for different screen sizes
- ✅ Professional error messages and user feedback

### Advanced Features  
- ✅ Syntax highlighting for code/JSON
- ✅ Live preview for Markdown and code
- ✅ Batch processing (UUID generation, hash calculation)
- ✅ Multiple format outputs (hex, rgb, hsl for colors)
- ✅ Natural language descriptions (cron expressions)
- ✅ Interactive testing (regex patterns)
- ✅ Image drag-and-drop support
- ✅ Quality controls for image conversion

## Future Enhancements

- [ ] Dark mode theme toggle
- [ ] Tool favorites and recent history  
- [ ] Plugin system for custom tools
- [ ] More hash algorithms (Blake2, etc.)
- [ ] Advanced regex features (named groups, etc.)
- [ ] Batch file processing
- [ ] Tool-specific keyboard shortcuts
- [ ] Export/import of tool configurations

---

**Version:** 1.0.0  
**Status:** ✅ Production Ready  
**Platform:** Cross-platform (macOS, Windows, Linux)  
**License:** MIT