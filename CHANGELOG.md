# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.1] - 2025-08-13

### Fixed

- **API Response Formatter**: Fixed critical search functionality bug where multi-character search queries would fail after the first character
  - Root cause: DOM manipulation in `clearSearchHighlights()` was creating adjacent text nodes that broke TreeWalker traversal
  - Solution: Added DOM normalization after highlight removal to merge fragmented text nodes
  - Impact: Search now works correctly for any length query (single character, multi-character, full words)
  - Technical: Enhanced `clearSearchHighlights()` method with parent node tracking and `normalize()` calls

## [1.0.0] - 2025-08-13

### Added

- Initial release of DevTools Desktop
- 24 developer utility tools in single offline-first Electron application
- JSON Viewer with syntax highlighting and tree navigation
- API Response Formatter with interactive tree view and search
- Text comparison tool with line-by-line diff
- Base64, URL, CSV/JSON converters
- UUID, password, hash, QR code generators
- JWT decoder, regex builder, cron parser
- Unit converter for length, weight, temperature, currency
- Color palette generator and image converter
- No external dependencies, all processing client-side
- Cross-platform support (macOS, Windows, Linux)
- Zero telemetry and complete offline functionality
