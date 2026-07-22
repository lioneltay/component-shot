# Component Shot

Component Shot gives agents and people fast visual access to React UI. Mount a real application component or a prototype in a deterministic scenario, render any useful state directly, inspect the pixels, and iterate without navigating the real app.

It is designed for loading, empty, error, modal, permission, responsive, and other intermediate states that are slow or unreliable to reach with ordinary screenshot workflows. The same scenarios are available through a one-call MCP capture loop, a local CLI, and a human gallery workbench.

See [Purpose and use cases](docs/use-cases.md) for the product goals and boundaries.

## What It Provides

- React-specific scenarios with typed provider options and reusable app setup.
- One MCP call from complete TSX source or an existing scenario to a returned PNG image.
- A persistent renderer session that reuses its asset server, browser, and build cache.
- Deterministic defaults: fixed locale/timezone, reduced motion, disabled capture animations, and blocked external network.
- A full-height gallery with searchable scenarios, Live, History, and Overview views, viewport controls, diagnostics, capture, and export.
- Explicit local history and stable PNG export for pull requests or documentation.
- `init`, `doctor`, browser, MCP, and agent-skill installers with no global package requirement.

## Requirements

- Node.js `^20.19.0 || >=22.12.0`
- React and React DOM `>=18` in the target project
- The packaged Playwright Chromium or a supported local Chrome/Edge installation

## Install

```bash
pnpm add -D @lioneltay/component-shot
pnpm exec component-shot browser install chromium
pnpm exec component-shot init
pnpm exec component-shot doctor
```

`browser install` invokes the Playwright CLI shipped with Component Shot. Captures automatically use an installed Chrome or Edge when the packaged Chromium is absent.

`init` creates:

```text
component-shot/setup.tsx
component-shot/scenarios/example.tsx
```

## First Scenario

Configure app providers once:

```tsx
// component-shot/setup.tsx
import type { ReactNode } from 'react'
import { createComponentShot } from '@lioneltay/component-shot/react'
import { MemoryRouter } from 'react-router-dom'
import { AppThemeProvider } from '../src/theme/AppThemeProvider'

type ShotOptions = {
  route?: string
  theme?: 'light' | 'dark'
}

export const componentShot = createComponentShot<ShotOptions>()
export const scenario = componentShot.scenario

function Provider({ children, options }: { children: ReactNode; options?: ShotOptions }) {
  return (
    <AppThemeProvider mode={options?.theme ?? 'light'}>
      <MemoryRouter initialEntries={[options?.route ?? '/']}>{children}</MemoryRouter>
    </AppThemeProvider>
  )
}

export default componentShot.setup({ Provider })
```

Mount a real component in a deliberate state:

```tsx
// component-shot/scenarios/billing/payment-failed.tsx
import { InvoicePanel } from '../../../src/billing/InvoicePanel'
import { scenario } from '../../setup'

export default scenario({
  title: 'Invoice payment failed',
  description: 'Retryable card failure with a past-due invoice.',
  tags: ['billing', 'error'],
  viewport: { width: 1024, height: 768 },
  providerOptions: { route: '/billing/invoices/inv_123' },
  rootStyle: { display: 'block', width: '100%' },
  render: () => (
    <InvoicePanel
      invoice={{ id: 'inv_123', status: 'past_due', total: 12900 }}
      paymentError="Card declined"
    />
  ),
})
```

Capture it or open the workbench:

```bash
pnpm exec component-shot capture --scenario component-shot/scenarios/billing/payment-failed.tsx --json
pnpm exec component-shot gallery
```

## Agent Workflow

Install the project MCP config and packaged skill:

```bash
pnpm exec component-shot mcp install --client codex
pnpm exec component-shot skill
```

The intended loop is:

1. Inspect the workspace and existing scenarios with normal filesystem tools.
2. Edit the real React component and a deterministic scenario, or prepare complete TSX source for an ephemeral prototype.
3. Call `capture_component_shot` and receive the rendered PNG in the same call.
4. Inspect the image and structured diagnostics.
5. Iterate without traversing the real application.
6. Persist source, save gallery history, or export a durable image only when useful.

The packaged skill includes provider patterns, state-authoring guidance, capture modes, visual review, responsive checks, and PR/documentation artifact guidance.

## MCP Tools

`component-shot-mcp` exposes one tool:

| Tool | Purpose | Persists |
| --- | --- | --- |
| `capture_component_shot` | Render an existing scenario or complete TSX source, optionally crop the result, and return diagnostics plus the PNG in the same call. | Nothing by default; source, history, or a PNG only when requested. |

Use an existing scenario:

```json
{
  "target": {
    "type": "scenario",
    "path": "component-shot/scenarios/billing/payment-failed.tsx"
  },
  "viewport": { "width": 1024, "height": 768 }
}
```

Or render complete source immediately without keeping it:

```json
{
  "target": {
    "type": "source",
    "project": ".",
    "code": "export default { render: () => <button>Continue</button> }"
  },
  "area": { "type": "element", "selector": "button" }
}
```

Temporary source requires `target.project`, relative to the MCP process working directory or absolute, because it has no filesystem location from which to resolve React, imports, `tsconfig.json`, or providers. Existing scenario paths derive their project automatically. To retain source, provide a repository-relative or absolute `target.persistAs` inside `<project>/component-shot/scenarios`; that path also derives the project, so `target.project` is optional. When supplied with a scenario or `persistAs`, `project` must agree with the path.

Add `saveScreenshot: { "type": "history" }` for gallery history, or `{ "type": "file", "path": "docs/images/example.png" }` for a stable artifact relative to the resolved project. History requires a persistent scenario; explicit file export also works with temporary source. Every successful call returns the image regardless of persistence.

Capture area defaults to the visible viewport. Use `{ "type": "page" }` for the full scrollable document or `{ "type": "element", "selector": "[data-shot=dialog]" }` to render a complex composition while returning only its first matching visible element. Stable `data-shot` selectors are preferable to styling selectors.

The MCP process derives projects per request and keeps one renderer session alive for each project it touches. It discovers `<project>/component-shot/setup.*` when present and otherwise renders with a no-op provider. Scenario writes are constrained to `<project>/component-shot/scenarios`, output files are constrained to the resolved project, and `persistAs` never overwrites an existing scenario.

Structured results include the resolved `projectRoot` and setup mode (`project`, `configured`, `default`, or `custom-build`) so an agent can verify the rendering context it actually used.

The installer writes a generic repository-local server entry to `.codex/config.toml`. For another MCP client, run the binary from the repository or monorepo root:

```text
component-shot-mcp
```

No workspace environment variables are required. `COMPONENT_SHOT_BROWSER_CHANNEL` remains available as an optional browser override. Relative `project`, scenario, and `persistAs` paths are resolved from the MCP process working directory, so one server can render every conventionally structured app in a monorepo.

## Gallery

```bash
component-shot gallery [options]
```

Run the command from a React project or a monorepo root. Component Shot prefers a scenario directory in the current project, auto-selects a single nested project such as `packages/client`, and reports the available project paths when more than one is found. Use `--cwd packages/client` to choose explicitly in a multi-app repository.

The gallery is an operational master-detail workbench rather than a static screenshot grid:

- **Overview** is the collection view and the first item in the scenario browser. It lazily renders every React scenario as a live thumbnail. A saved PNG is only a loading or error fallback, and the filters and counts describe saved screenshots.
- Selecting a scenario opens its detail workspace. **Live** and **History** are local detail tabs rather than global application modes.
- **Live** renders the selected React scenario itself in one responsive canvas with exact viewport, zoom, and background controls. Drag the right, bottom, or corner handle to resize; typed dimensions commit on Enter or blur.
- **History** uses the full detail stage for saved PNG captures of the selected scenario.
- **Inspector** shows state identity, metadata, effective viewport, tags, history count, and render diagnostics.
- Every scenario row has an actions menu for destructive operations such as deletion.
- The scenario browser and inspector collapse into narrow rails when more canvas space is useful.
- **Capture** creates explicit local history; **Export** writes a stable project PNG.
- Source and imported component changes invalidate the build cache and refresh the workbench.

Live uses the viewer's browser so it remains immediate and inspectable. Capture and MCP screenshots use the declared deterministic profile; use a capture when locale, timezone, media emulation, or network policy is part of the review.

Common options:

```bash
component-shot gallery --cwd packages/client
component-shot gallery --scenario-dir packages/web/component-shot/scenarios
component-shot gallery --screenshots-dir .artifacts/component-shot
component-shot gallery --read-only --no-open --port 4400
```

Deletion is available only in editable mode on a loopback host.

## CLI

```text
component-shot capture --scenario <file.tsx> [options]
component-shot capture --source <complete-tsx-module> --name <name> [options]
component-shot gallery [options]
component-shot list [options]
component-shot init [options]
component-shot doctor [options]
component-shot browser install [chromium]
component-shot mcp install [--client codex]
component-shot skill [options]
```

Capture flags include `--save`, `--output`, `--viewport 390x844`, `--selector`, `--full-page`, `--wait-for`, `--setup`, `--scenario-dir`, `--screenshots-dir`, `--allow-network`, `--animations allow`, `--timeout`, `--json`, and `--debug`.

Machine-readable failures use an error envelope with the failing stage: `discover`, `build`, `serve`, `render`, `capture`, or `artifact`.

## Scenario API

A scenario may export a React node, a render function, or an object. Object scenarios support:

- `render`
- `title`, `description`, and `tags`
- `providerOptions`
- `viewport` and `environment`
- `rootStyle` and `wrapper`
- `capture.selector`, `capture.fullPage`, and `capture.animations`
- `setup`, `afterRender`, and `beforeScreenshot`

Use lifecycle hooks for explicit readiness conditions, not arbitrary sleeps. Component Shot already waits for React mount, multiple animation frames, document fonts, and the capture target.

Important states should be separate files such as:

```text
component-shot/scenarios/invoice/default.tsx
component-shot/scenarios/invoice/loading.tsx
component-shot/scenarios/invoice/empty.tsx
component-shot/scenarios/invoice/payment-failed.tsx
```

## Artifacts

Ephemeral capture is the default. CLI `--save` or MCP `saveScreenshot: { type: "history" }` publishes:

```text
component-shot/screenshots/<scenario-id>/latest.png
component-shot/screenshots/<scenario-id>/history/<timestamp>-<id>.png
```

Use CLI `--output docs/images/example.png` or MCP `saveScreenshot: { type: "file", path: "docs/images/example.png" }` for a stable PR/documentation image. Existing screenshot history is user output and is never cleared implicitly.

## Programmatic API

One-shot capture:

```ts
import { captureComponentShot } from '@lioneltay/component-shot'

const result = await captureComponentShot({
  scenario: 'component-shot/scenarios/invoice/empty.tsx',
  viewport: { width: 390, height: 844 },
})
```

Persistent iteration session:

```ts
import { createComponentShotSession } from '@lioneltay/component-shot'

const session = await createComponentShotSession({ cwd: process.cwd() })
try {
  await session.capture({ scenario: 'component-shot/scenarios/card/default.tsx' })
  await session.capture({ scenario: 'component-shot/scenarios/card/error.tsx' })
} finally {
  await session.close()
}
```

An ephemeral `outputPath` returned by a persistent session remains valid until that session closes. Pass `output`, use `save`, or export when the file must outlive the session. One-shot API and CLI results use a caller-owned temporary PNG.

Public subpaths are available for browser-safe scenario helpers (`/react`), the gallery (`/gallery`), MCP embedding (`/mcp`), and custom Rspack configuration (`/rspack`).

For a worktree that resolves dependencies from another checkout, set `COMPONENT_SHOT_DEPENDENCY_ROOTS` to a platform-delimited list of installed roots.

## Scope And Safety

Component Shot is React-specific on purpose. It complements unit, integration, and end-to-end tests; it does not replace application behavior testing. Scenario modules and custom build commands are trusted project code, not a sandbox for untrusted input.

External requests are blocked by default, browser state is deterministic, preview operations do not silently save history, and writes are explicit and path-bounded.

## Development

```bash
pnpm install
pnpm verify
pnpm --dir demo gallery
```

`pnpm verify` typechecks, builds, runs behavior tests, and builds the demo app. Use `pnpm release:dry-run` to verify package contents before publishing.

The gallery dogfoods its production React workbench through `component-shot/scenarios/gallery-workbench.tsx` and the adjacent Live and History scenarios. Capture those states when changing the workbench so inactive panels, asynchronous readiness, wide layouts, and narrow controls are reviewed through Component Shot itself.

## License

MIT
