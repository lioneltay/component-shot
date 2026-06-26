---
name: component-shot
description: Use when creating, updating, rendering, inspecting, visually testing, or reviewing component-shot scenarios for UI components during component design iteration; capture screenshots through the component-shot CLI or MCP server; run the live scenario gallery; debug visual regressions; or produce reusable scenario files under component-shot/scenarios.
---

# Component Shot

Use component-shot to iterate component designs with live-rendered scenarios, browser screenshots, and reusable visual states.

## Workflow

1. Locate the project root and existing component-shot assets.
   - Scenarios usually live in `component-shot/scenarios`.
   - App providers usually live in `component-shot/setup.tsx`, `setup.ts`, `setup.jsx`, or `setup.js`.
   - Screenshot history usually lives in `component-shot/screenshots`.
2. Prefer creating or updating deterministic scenario files for important design states over one-off screenshots when the state may be reused.
3. Use the local project binary when possible. Prefer `component-shot ...` when available; otherwise use the repo package manager, for example `pnpm exec component-shot ...`, `npm exec component-shot -- ...`, or `yarn component-shot ...`.
4. Run the live gallery during UI iteration:

```bash
component-shot gallery
```

Use `--scenario-dir <path>` when scenarios are outside `component-shot/scenarios`.

5. Capture an existing scenario when a static screenshot is needed:

```bash
component-shot --scenario component-shot/scenarios/example.tsx --save --json
```

6. If a component-shot MCP server is available, use it for direct visual inspection:
   - `capture_component_shot` for an existing scenario file.
   - `capture_component_source` to write a scenario source file, capture it, and receive the image.

## Scenario Pattern

Create one file per important UI state. Export either a React node/function or a scenario object.

```tsx
import type { ComponentShotScenarioObject } from '@lioneltay/component-shot'
import { ProductCard } from '../../src/components/ProductCard'

const scenario: ComponentShotScenarioObject = {
  render: () => (
    <ProductCard
      badge="Popular"
      ctaLabel="Add kit"
      description="Reusable capture defaults, tuned for review."
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

Use `providerOptions` when `component-shot/setup.*` defines a Provider that accepts options. Use `beforeScreenshot` for deterministic async setup, such as waiting for animations or data mocks.

## Review Guidance

- Treat the gallery live render as the source of truth while iterating.
- Treat screenshot history as audit output. Do not delete screenshot history unless explicitly asked.
- Keep scenarios deterministic: fixed props, stable dates, mocked randomness, and no live network dependency.
- When a component is clipped, set an explicit `rootStyle.width` or update the scenario layout before capturing.
- When adding multiple states, prefer descriptive filenames such as `empty-state.tsx`, `loading.tsx`, and `error-banner.tsx`.

## Validation

After changing scenarios or setup:

1. Run the relevant app typecheck/build if available.
2. Run `component-shot gallery` for live inspection, or capture with `component-shot --scenario ... --save --json`.
3. Inspect the image or live render before reporting completion.
