# Component Shot Purpose And Use Cases

## Purpose

Component Shot gives agents and people a fast, isolated way to render React UI in any useful state, inspect the actual pixels, exchange visual feedback, and produce durable screenshots without navigating the real application.

The scenario is the durable unit of work: a small React module that mounts either a real application component or a prototype with deterministic props, providers, mocks, and browser conditions.

## Core Goals

- Give an agent eyes into React components while it designs, builds, and fixes UI.
- Make hard-to-reach states as easy to inspect as ordinary states.
- Let an agent render complete source or an existing scenario and receive the screenshot in one MCP call.
- Keep repeated iteration fast by reusing render and browser infrastructure.
- Let a person inspect every scenario, capture, and error through an intuitive gallery workbench.
- Make feedback loops explicit: scenario, pixels, feedback, source change, refreshed pixels.
- Produce deterministic PNGs for pull requests, documentation, design review, and release notes.
- Reuse the real application component and provider stack whenever that gives the most faithful result.

## Primary Use Cases

### Build Or Redesign A Real Component

An agent edits the production React component, mounts it in a focused scenario with app providers and mock data, captures it, inspects the image, and iterates without traversing the application.

### Prototype UI Before Integration

An agent passes complete TSX plus the React project directory for an immediate disposable capture, adds a self-locating `persistAs` path when the user should see the state in the gallery, and turns the accepted prototype into production components later.

### Inspect Intermediate And Hard-To-Reach States

Scenarios render loading, streaming, optimistic, empty, error, permission, validation, modal, hover, selected, partially complete, and long-content states directly rather than reproducing a long interaction sequence.

### Review Responsive And Environmental Variants

The same component can be inspected at exact desktop/mobile viewports and under controlled color scheme, locale, timezone, reduced-motion, and network conditions.

### Collaborate With A Person

The gallery presents a searchable scenario list, live canvas, live all-scenario overview, effective viewport and state metadata, saved screenshot history, comparison, and diagnostics. A person can inspect the same rendered React state the agent sees and give concrete feedback. Overview thumbnails are live scenarios; saved PNGs appear only as loading or failure fallbacks.

### Create Pull Request And Documentation Screenshots

An accepted scenario can be exported to a stable output path with known viewport and state metadata. Iteration history stays local; explicit exports can be committed.

### Capture Arbitrary React UI

Component Shot can capture the visible viewport, a selected element, or a full page. A scenario can render a realistic complex composition while an element selector returns only the modal, card, menu, table, or other region under review.

### Reproduce A Visual Bug

A failing UI state becomes a scenario that can be captured repeatedly, shared in review, and retained as a regression fixture after the fix.

## Agent Workflow

1. Inspect the Component Shot workspace and existing scenarios with normal filesystem tools.
2. Reuse the real component and setup provider when practical.
3. Edit a deterministic scenario, or provide complete TSX and its React project directory for a disposable prototype.
4. Call the single `capture_component_shot` tool and receive the image in the same call.
5. Inspect the image and diagnostics, edit the component or scenario, and repeat.
6. Persist source, save history, or export an artifact only when the state is worth retaining.
7. Run the application's normal tests before reporting production work complete.

## Human Workflow

1. Open the gallery workbench.
2. Start in Overview to scan all live scenarios, or search the scenario browser.
3. Select a scenario to open its detail workspace.
4. Use the local Live and History tabs to switch between the rendered component and explicitly saved PNG captures.
5. In Live, adjust the viewport with presets, typed dimensions, or drag handles, and use Diagnostics for render failures.
6. Collapse the scenario browser or inspector when the canvas needs more room.
7. Use a scenario row's actions menu for deletion.
8. Capture or export the current state when useful.
9. Give feedback using the scenario name and visible state.

## Product Principles

- **Fast by default**: reuse compilers, servers, and browsers during iteration.
- **Deterministic by default**: no accidental live network, remote fonts, animation timing, or host-specific locale state.
- **One visual tool**: one MCP operation accepts source or a scenario and always returns the rendered pixels.
- **Projects are request-scoped**: scenario and `persistAs` paths self-locate; only temporary source must name its React project.
- **One state, one identity**: scenario IDs, history, exports, gallery routes, and MCP results use the same key.
- **Preview is read-like**: looking at pixels does not silently create persistent artifacts.
- **Writes are explicit**: `persistAs` retains source and `saveScreenshot` retains pixels; omission leaves both ephemeral.
- **Errors are visible**: build, runtime, browser, and capture failures include stage and actionable diagnostics.
- **Real code is preferred**: Component Shot complements application tests; it does not replace integration correctness.
- **React-specific on purpose**: the provider and scenario model optimize for React rather than pretending to be framework neutral.

## Non-Goals

- Replacing full application end-to-end testing.
- Running untrusted code as a security boundary; scenarios and build configuration are trusted project code.
- Becoming a general-purpose browser automation product.
- Reproducing every application backend. Scenarios should mock or seed the data they need.
- Growing into a large component documentation framework when a small scenario and workbench are sufficient.

## Success Criteria

- A new React project can reach its first screenshot using documented commands without global installs.
- An agent can submit source or a scenario and receive a rendered image in one MCP call.
- Editing an imported production component refreshes the open gallery without touching the scenario.
- Build and runtime failures are visible within one feedback cycle.
- Previewing does not modify persistent history unless requested.
- A person can find a scenario and distinguish its live render, viewport, saved screenshot history, and diagnostics without reading source.
- The installed package, MCP server, generated skill, and gallery exercise the same underlying contracts.
