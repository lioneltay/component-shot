# Contributing

Thanks for working on Component Shot.

## Development Setup

```bash
pnpm install
pnpm browsers
pnpm build
pnpm check
```

The demo app is a separate package that depends on the repository root package:

```bash
pnpm --dir demo install
pnpm --dir demo build
pnpm --dir demo gallery
```

## Validation

Run the full local validation before opening a pull request:

```bash
pnpm verify
```

For visual changes to the gallery, also run:

```bash
pnpm build
node dist/cli.js gallery
```

Use the checked-in `component-shot/scenarios/gallery-workbench.tsx` scenario for quick visual review of the gallery surface.

## Release Checklist

1. Update `CHANGELOG.md`.
2. Confirm the package version in `package.json`.
3. Run `pnpm release:dry-run` and inspect the package contents.
4. Confirm Playwright browser installation instructions still work.
5. Publish with `pnpm release:publish`.

## Bun Binary Note

The current release path is an npm package with Node.js binaries. A Bun-compiled single executable is not the primary target yet because Component Shot bundles user scenario files at runtime and depends on Playwright browser installation. Revisit a Bun binary after the npm package API and gallery workflow stabilize.
