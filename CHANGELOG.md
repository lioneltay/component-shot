# Changelog

All notable changes to Component Shot will be documented here.

## 0.1.0 - Initial public release

- Capture React component scenario modules with Playwright.
- Bundle scenarios through the built-in Rspack pipeline.
- Save latest and historical screenshots for named scenarios.
- Run a typed React master-detail gallery with sidebar Overview navigation, per-scenario action menus, local Live/History tabs, draggable viewport resizing, collapsible side panels, export, and diagnostics.
- Render the production gallery itself as Component Shot scenarios for deterministic Live, History, and Overview review.
- Resolve NodeNext `.js` specifiers to TypeScript source in the built-in Rspack renderer.
- Expose one structured `capture_component_shot` MCP tool for existing scenarios or complete TSX source, viewport/page/element capture, optional source persistence, gallery history, and stable PNG export.
- Reuse a persistent browser/build session with deterministic rendering and bounded paths.
- Initialize typed providers, diagnose setup, install the package-owned browser, and configure MCP from the CLI.
- Package and install a comprehensive Component Shot agent skill with focused references.
