# Component Shot Demo

Small React app used to exercise this repository's local `@lioneltay/component-shot` package.

## Setup

From the repository root:

```bash
pnpm install
pnpm --dir demo install
pnpm browsers
```

## Run the App

```bash
pnpm --dir demo dev
```

## Capture the Scenario

```bash
pnpm --dir demo shot
```

If the Playwright browser download is unavailable locally and Google Chrome is installed:

```bash
pnpm --dir demo shot:chrome
```

This captures `component-shot/scenarios/product-card.tsx` and writes:

```text
demo/component-shot/screenshots/product-card/latest.png
demo/component-shot/screenshots/product-card/history/<timestamp>.png
```

## Open the Gallery

```bash
pnpm --dir demo gallery
```

## Install the Codex Skill

From the repository root:

```bash
pnpm exec component-shot skill
```

## MCP

The project-level config at `.codex/config.toml` registers `component-shot-demo`.
After restarting in this trusted repo, use `/mcp` to confirm the server is active.
