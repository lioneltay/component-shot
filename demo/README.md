# Component Shot Demo

Small React app used to test this repo's local `@lioneltay/component-shot` package.

## Run

```bash
pnpm --dir demo install
pnpm --dir demo browsers
pnpm --dir demo dev
```

## Capture the scenario

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

## Gallery

```bash
pnpm --dir demo gallery
```

## Skill

From the repo root:

```bash
pnpm exec component-shot skill
```

## MCP

The project-level config at `.codex/config.toml` registers `component-shot-demo`.
After restarting in this trusted repo, use `/mcp` to confirm the server is active.
