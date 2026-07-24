# Changelog

All notable changes to Component Shot will be documented here.

## Unreleased

- Export every scenario as a fresh, self-contained offline HTML gallery with a near-full-viewport, scrollable fit-width/actual-size image viewer, scrubbed diagnostics, visible partial failures and history warnings, bounded optional screenshot history, and no application source or history mutation.

## 0.2.0 - 2026-07-23

- Run a typed React master-detail gallery with sidebar Overview navigation, per-scenario action menus, local Live/History tabs, draggable viewport resizing, collapsible side panels, export, and diagnostics.
- Render the production gallery itself as Component Shot scenarios for deterministic Live, History, and Overview review.
- Resolve NodeNext `.js` specifiers to TypeScript source in the built-in Rspack renderer.
- Expose one structured `capture_component_shot` MCP tool for existing scenarios or complete TSX source, viewport/page/element capture, optional source persistence, gallery history, and stable PNG export.
- Derive MCP projects from scenario and `persistAs` paths, require a project only for temporary source, and cache independent renderer sessions across monorepo apps without workspace environment variables.
- Auto-discover a single nested Component Shot project for gallery, list, and doctor commands launched from a monorepo root, with an explicit ambiguity error for multi-app repositories.
- Share recursive source watching across the gallery and MCP, backstop direct scenario edits with content checks, and serialize captures per project to prevent invalidation races.
- Reuse a persistent browser/build session with deterministic rendering and bounded paths.
- Initialize typed providers, diagnose setup, install the package-owned browser, and configure MCP from the CLI.
- Package and install a comprehensive Component Shot agent skill with focused references.
- Generate portable repository-local Codex MCP configuration without machine-specific paths.
- Build Git-based package installations with npm so they do not require a globally installed pnpm.

## 0.1.0 - 2026-06-26

- Capture React component scenario modules with Playwright.
- Bundle scenarios through the built-in Rspack pipeline.
- Save latest and historical screenshots for named scenarios.
- Run the original live scenario gallery with search, layout, pinning, deletion, and detail views.
- Expose separate MCP tools for scenario and inline-source capture using one configured workspace.
- Install the initial repository-local Component Shot skill.
