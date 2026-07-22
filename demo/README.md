# Component Shot Demo

Small React app used to exercise this repository's local `@lioneltay/component-shot` package.

## Setup

From the repository root:

```bash
pnpm install
pnpm --dir demo install
pnpm exec component-shot browser install chromium
```

## Run the App

```bash
pnpm --dir demo dev
```

## Capture the Scenario

```bash
pnpm --dir demo shot
```

Component Shot automatically uses an installed Chrome or Edge when its packaged Chromium is absent.

The gallery also includes standard, long-content, and mobile variants under `component-shot/scenarios/product-card/`. The shot command captures `product-card.tsx` and writes:

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
