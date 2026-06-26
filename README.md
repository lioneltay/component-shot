# Component Shot

One-shot browser screenshots for React/Vue/Svelte/etc. component scenario modules.

The package owns the generic capture pipeline:

1. Resolve a scenario file.
2. Create a temporary public directory.
3. Bundle the scenario with the built-in Rspack entry.
4. Render the scenario in a tiny browser page.
5. Serve the built files on localhost.
6. Open the page in Playwright.
7. Wait for a ready global or error global.
8. Screenshot a selector or the full page.
9. Clean up temporary build output.

Your app normally owns only a setup module for providers at `component-shot/setup.tsx`:

```tsx
import type { ComponentShotAppSetup } from '@lioneltay/component-shot'
import { ThemeProvider } from './theme'

const setup: ComponentShotAppSetup = {
  Provider: ({ children }) => <ThemeProvider>{children}</ThemeProvider>,
}

export default setup
```

## Standalone CLI

```bash
component-shot \
  --scenario /tmp/example.tsx \
  --output /tmp/example.png
```

The CLI can also write a scenario and capture it in one command:

```bash
component-shot \
  --source "export default { render: () => <button>Save</button> }" \
  --name button \
  --save
```

This creates `component-shot/scenarios/button.tsx` when the scenario directory is missing.
If `--save` is enabled, it also creates the screenshot audit directory.

Use `--save` when the app wants a local audit trail for named scenarios:

```bash
component-shot \
  --scenario ./component-shot/scenarios/basic.tsx \
  --save
```

This writes:

```text
component-shot/screenshots/basic/latest.png
component-shot/screenshots/basic/history/<timestamp>.png
```

## Gallery

Open a local gallery for scenario modules:

```bash
component-shot gallery
```

The gallery scans `component-shot/scenarios`, bundles scenarios on demand, and
renders each one in a live iframe preview.
It watches the active `component-shot` directory and reloads the browser when
scenarios, setup, or screenshot history changes. Opening a scenario shows the
live render first, with historical screenshots below it when they exist.
Use the Columns control to switch between smart layout and fixed two-, three-,
or four-column grids. Pinning scenarios keeps them at the top of the gallery;
both preferences are stored in the browser. Delete removes a scenario source
file, and Clear removes all currently discovered scenario source files. Screenshot
history is left intact.

For apps that keep scenarios somewhere else:

```bash
component-shot gallery \
  --scenario-dir packages/client/component-shot/scenarios
```

Use `--screenshots-dir` when screenshot history is not beside the scenario
directory. Use `--no-open` to print the local URL without opening a browser.

## Skill

Install a repo-local skill for component-shot workflows:

```bash
component-shot skill
```

This writes:

```text
.codex/skills/component-shot/SKILL.md
```

Use `--output-dir` or `--path` to choose a different skill parent directory,
and `--overwrite` to replace an existing generated skill.

Use `--build-command` only as an escape hatch when the built-in Rspack build is not enough.

## MCP Server

MCP clients can call the server directly and receive the PNG as image content:

```json
{
  "mcpServers": {
    "component-shot": {
      "command": "node",
      "args": ["/Users/lioneltay/lioneltay/component-shot/dist/mcp.js"],
      "env": {
        "COMPONENT_SHOT_PROJECT_ROOT": "/path/to/app",
        "COMPONENT_SHOT_SCENARIO_DIR": "packages/client/component-shot/scenarios"
      }
    }
  }
}
```

The server exposes:

- `capture_component_shot` for an existing scenario file.
- `capture_component_source` to write a scenario source file, capture it, and return the image.

For worktrees that share dependencies from another checkout, set `COMPONENT_SHOT_DEPENDENCY_ROOT`
to that installed checkout.

## Programmatic CLI

Apps can provide a thin wrapper when they need app-specific defaults beyond the standard `component-shot/setup.tsx` and `component-shot/screenshots` conventions:

```ts
#!/usr/bin/env node
import { runComponentShotCli } from '@lioneltay/component-shot'

await runComponentShotCli({
  argv: process.argv.slice(2),
  setup: 'component-shot/setup.tsx',
})
```
