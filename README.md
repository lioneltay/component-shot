# Component Shot

Capture, inspect, and iterate React component scenarios from the command line, a live gallery, or MCP tools.

Component Shot is built for design review and agent workflows. You write small scenario files that render important UI states, then Component Shot bundles them, serves them locally, renders them in Playwright, and captures or previews the result.

## Features

- One-command screenshots for React scenario modules.
- A live scenario gallery with search, column layout controls, pinning, delete, clear, and detail views.
- Screenshot history for saved captures.
- App-level setup providers for themes, routers, data clients, or other wrappers.
- MCP tools that return screenshots as image content.
- A repo-local Codex skill installer for repeatable Component Shot workflows.
- Built-in Rspack bundling with a build-command escape hatch.

## Requirements

- Node.js `>=20.11`
- React and React DOM in the app using Component Shot
- A Playwright browser, or an installed Chrome/Edge channel

Install Chromium for Playwright when needed:

```bash
pnpm exec playwright install chromium
```

If you already have Google Chrome installed, pass `--browser-channel chrome` to the capture command instead.

## Install

```bash
pnpm add -D @lioneltay/component-shot react react-dom
```

The package exposes two binaries:

```bash
component-shot
component-shot-mcp
```

## Quick Start

Create a scenario:

```tsx
// component-shot/scenarios/product-card.tsx
import type { ComponentShotScenarioObject } from '@lioneltay/component-shot'
import { ProductCard } from '../../src/components/ProductCard'

const scenario: ComponentShotScenarioObject = {
  render: () => (
    <ProductCard
      badge="Popular"
      ctaLabel="Add kit"
      description="Reusable capture defaults, tuned for design review."
      name="Shot Runner"
      price="$49"
    />
  ),
  rootStyle: {
    display: 'block',
    width: 380,
  },
}

export default scenario
```

Capture it:

```bash
pnpm exec component-shot \
  --scenario component-shot/scenarios/product-card.tsx \
  --output /tmp/product-card.png
```

Save latest and historical screenshots:

```bash
pnpm exec component-shot \
  --scenario component-shot/scenarios/product-card.tsx \
  --save \
  --json
```

This writes:

```text
component-shot/screenshots/product-card/latest.png
component-shot/screenshots/product-card/history/<timestamp>.png
```

## App Setup

Add `component-shot/setup.tsx` when scenarios need app providers:

```tsx
import type { ComponentShotAppSetup } from '@lioneltay/component-shot'
import { ThemeProvider } from '../src/theme'

const setup: ComponentShotAppSetup = {
  Provider: ({ children }) => <ThemeProvider>{children}</ThemeProvider>,
  rootStyle: {
    display: 'inline-block',
  },
}

export default setup
```

Scenario objects can opt out of the setup provider with `providerOptions: false`, or pass options to the provider with `providerOptions`.

## Scenario API

A scenario can export:

- a React node
- a function returning a React node
- a `ComponentShotScenarioObject`

```tsx
import type { ComponentShotScenarioObject } from '@lioneltay/component-shot'

const scenario: ComponentShotScenarioObject = {
  setup: async () => {
    localStorage.clear()
  },
  render: () => <button>Save</button>,
  beforeScreenshot: async () => {
    await new Promise((resolve) => window.setTimeout(resolve, 100))
  },
  rootStyle: {
    display: 'inline-block',
    width: 240,
  },
}

export default scenario
```

Use deterministic props, mocked data, fixed dates, and stable dimensions. If the gallery clips or scales a component unexpectedly, set an explicit `rootStyle.width`.

## CLI

```bash
component-shot --scenario <file.tsx> [options]
```

Common options:

| Option | Description |
| --- | --- |
| `--scenario <path>` | Scenario module to render. |
| `--output <path>` | PNG output path. Defaults to a temp PNG. |
| `--save` | Write `latest.png` and a timestamped history image. |
| `--save-name <name>` | Screenshot folder name. Defaults to scenario filename. |
| `--screenshots-dir <path>` | Screenshot root. Defaults to `component-shot/screenshots`. |
| `--selector <selector>` | Element to capture. Defaults to `[data-component-shot-root]`. |
| `--full-page` | Capture the whole page instead of the component root. |
| `--viewport <WxH>` | Browser viewport. Defaults to `1440x900`. |
| `--wait-for <selector>` | Wait for an additional selector before capture. |
| `--browser-channel <id>` | Use a system browser channel, for example `chrome`. |
| `--setup <path>` | Override setup module discovery. |
| `--build-command <cmd>` | Escape hatch for custom build pipelines. |
| `--json` | Print machine-readable output. |

Write a scenario and capture it in one command:

```bash
component-shot \
  --source "export default { render: () => <button>Save</button> }" \
  --name save-button \
  --save
```

## Gallery

Open the live gallery:

```bash
component-shot gallery
```

The gallery scans `component-shot/scenarios`, bundles scenarios on demand, and renders each one in a live iframe preview. It watches the active `component-shot` directory and reloads when scenarios, setup, or screenshot history changes.

Gallery features:

- Search by scenario name or path.
- Switch between auto layout and fixed two-, three-, or four-column grids.
- Pin scenarios to keep them at the top.
- Delete one scenario source file.
- Clear all discovered scenario source files.
- Open a scenario detail page with the live render first and screenshot history below it.

Use a custom scenario directory:

```bash
component-shot gallery \
  --scenario-dir packages/client/component-shot/scenarios
```

Use `--screenshots-dir` when screenshot history is not beside the scenario directory. Use `--no-open` to print the local URL without opening a browser.

## MCP Server

Run `component-shot-mcp` from an MCP client to capture scenarios directly from an agent.

Example config:

```json
{
  "mcpServers": {
    "component-shot": {
      "command": "component-shot-mcp",
      "env": {
        "COMPONENT_SHOT_PROJECT_ROOT": "/path/to/app",
        "COMPONENT_SHOT_SCENARIO_DIR": "component-shot/scenarios"
      }
    }
  }
}
```

Tools:

- `capture_component_shot`: capture an existing scenario file.
- `capture_component_source`: write scenario source, capture it, and return the image.

For worktrees that share dependencies from another checkout, set `COMPONENT_SHOT_DEPENDENCY_ROOT` to that installed checkout.

## Codex Skill

Install a repo-local Component Shot skill:

```bash
component-shot skill
```

This writes:

```text
.codex/skills/component-shot/SKILL.md
```

Use `--output-dir` or `--path` to choose a different skill parent directory, and `--overwrite` to replace an existing generated skill.

## Programmatic API

Apps can create thin wrappers when they need project-specific defaults:

```ts
#!/usr/bin/env node
import { runComponentShotCli } from '@lioneltay/component-shot'

await runComponentShotCli({
  argv: process.argv.slice(2),
  setup: 'component-shot/setup.tsx',
})
```

The package also exports the scenario/setup types and `createRspackBuild` for custom wrappers.

## Development

```bash
pnpm install
pnpm browsers
pnpm build
pnpm check
pnpm --dir demo build
```

Run the demo gallery:

```bash
pnpm --dir demo gallery
```

Run the full verification command:

```bash
pnpm verify
```

## Publishing

The intended release path is the npm package with Node.js binaries:

```bash
pnpm release:dry-run
pnpm release:publish
```

Before publishing:

- Confirm `CHANGELOG.md` is current.
- Confirm the version in `package.json`.
- Inspect the `npm pack --dry-run` output.
- Confirm the package name and `publishConfig.access` are correct for a public scoped package.

### Bun Binary

A Bun-compiled single executable is not the primary release target yet. Component Shot bundles user scenario files at runtime and depends on Playwright browser installation, so the npm binary is the lower-risk first public release. Revisit a Bun binary once the npm package API and gallery workflow stabilize.

## License

MIT
