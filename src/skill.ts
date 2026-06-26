import fs from 'node:fs/promises'
import path from 'node:path'

export type ComponentShotSkillInstallOptions = {
	cwd?: string
	json?: boolean
	name?: string
	outputDir?: string
	overwrite?: boolean
}

export type ComponentShotSkillInstallResult = {
	files: string[]
	skillDir: string
}

type ParsedSkillOptions = Required<Pick<ComponentShotSkillInstallOptions, 'name' | 'outputDir'>> &
	ComponentShotSkillInstallOptions & {
		json?: boolean
	}

const defaultSkillOptions = {
	name: 'component-shot',
	outputDir: '.codex/skills',
} satisfies Required<Pick<ComponentShotSkillInstallOptions, 'name' | 'outputDir'>>

const isValidSkillName = (value: string) =>
	value.length <= 64 &&
	/^[a-z0-9-]+$/.test(value) &&
	!value.startsWith('-') &&
	!value.endsWith('-') &&
	!value.includes('--')

const readFlagValue = (args: string[], index: number, flag: string): [string, number] => {
	const inlineValue = flag.includes('=') ? flag.slice(flag.indexOf('=') + 1) : undefined
	if (inlineValue) {
		return [inlineValue, index]
	}

	const value = args[index + 1]
	if (!value || value.startsWith('--')) {
		throw new Error(`Missing value for ${flag}`)
	}

	return [value, index + 1]
}

const createSkillUsage = (usageCommand: string) => `Usage:
  ${usageCommand}

Options:
  --output-dir <path>  Skill parent directory. Defaults to .codex/skills.
  --path <path>        Alias for --output-dir.
  --name <name>        Skill folder/name. Defaults to component-shot.
  --cwd <path>         Repository root. Defaults to the current directory.
  --overwrite          Replace an existing skill.
  --json               Print machine-readable install details.
  --help               Show this help message.`

const parseSkillCliArgs = ({
	argv,
	usageCommand,
}: {
	argv: string[]
	usageCommand: string
}): ParsedSkillOptions => {
	const options: ParsedSkillOptions = { ...defaultSkillOptions }
	const usage = createSkillUsage(usageCommand)

	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index]
		const flag = arg.includes('=') ? arg.slice(0, arg.indexOf('=')) : arg

		switch (flag) {
			case '--cwd': {
				const [value, nextIndex] = readFlagValue(argv, index, arg)
				options.cwd = value
				index = nextIndex
				break
			}
			case '--help':
			case '-h':
				process.stdout.write(`${usage}\n`)
				process.exit(0)
				break
			case '--json':
				options.json = true
				break
			case '--name': {
				const [value, nextIndex] = readFlagValue(argv, index, arg)
				options.name = value
				index = nextIndex
				break
			}
			case '--output-dir':
			case '--path': {
				const [value, nextIndex] = readFlagValue(argv, index, arg)
				options.outputDir = value
				index = nextIndex
				break
			}
			case '--overwrite':
				options.overwrite = true
				break
			default:
				throw new Error(`Unknown skill option "${arg}"\n\n${usage}`)
		}
	}

	if (!isValidSkillName(options.name)) {
		throw new Error(
			'--name must use lowercase letters, numbers, and hyphens, be 1-64 characters long, and not start/end with or contain consecutive hyphens',
		)
	}

	return options
}

const pathExists = async (filePath: string) => {
	try {
		await fs.access(filePath)
		return true
	} catch (error) {
		const code = typeof error === 'object' && error && 'code' in error ? error.code : undefined
		if (code === 'ENOENT') {
			return false
		}
		throw error
	}
}

const ensureTrailingNewline = (value: string) => (value.endsWith('\n') ? value : `${value}\n`)

const createSkillMarkdown = (skillName: string) =>
	ensureTrailingNewline(`---
name: ${skillName}
description: Use when creating, updating, rendering, inspecting, visually testing, or reviewing component-shot scenarios for UI components during component design iteration; capture screenshots through the component-shot CLI or MCP server; run the live scenario gallery; debug visual regressions; or produce reusable scenario files under component-shot/scenarios.
---

# Component Shot

Use component-shot to iterate component designs with live-rendered scenarios, browser screenshots, and reusable visual states.

## Workflow

1. Locate the project root and existing component-shot assets.
   - Scenarios usually live in \`component-shot/scenarios\`.
   - App providers usually live in \`component-shot/setup.tsx\`, \`setup.ts\`, \`setup.jsx\`, or \`setup.js\`.
   - Screenshot history usually lives in \`component-shot/screenshots\`.
2. Prefer creating or updating deterministic scenario files for important design states over one-off screenshots when the state may be reused.
3. Use the local project binary when possible. Prefer \`component-shot ...\` when available; otherwise use the repo package manager, for example \`pnpm exec component-shot ...\`, \`npm exec component-shot -- ...\`, or \`yarn component-shot ...\`.
4. Run the live gallery during UI iteration:

\`\`\`bash
component-shot gallery
\`\`\`

Use \`--scenario-dir <path>\` when scenarios are outside \`component-shot/scenarios\`.

5. Capture an existing scenario when a static screenshot is needed:

\`\`\`bash
component-shot --scenario component-shot/scenarios/example.tsx --save --json
\`\`\`

6. If a component-shot MCP server is available, use it for direct visual inspection:
   - \`capture_component_shot\` for an existing scenario file.
   - \`capture_component_source\` to write a scenario source file, capture it, and receive the image.

## Scenario Pattern

Create one file per important UI state. Export either a React node/function or a scenario object.

\`\`\`tsx
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
\`\`\`

Use \`providerOptions\` when \`component-shot/setup.*\` defines a Provider that accepts options. Use \`beforeScreenshot\` for deterministic async setup, such as waiting for animations or data mocks.

## Review Guidance

- Treat the gallery live render as the source of truth while iterating.
- Treat screenshot history as audit output. Do not delete screenshot history unless explicitly asked.
- Keep scenarios deterministic: fixed props, stable dates, mocked randomness, and no live network dependency.
- When a component is clipped, set an explicit \`rootStyle.width\` or update the scenario layout before capturing.
- When adding multiple states, prefer descriptive filenames such as \`empty-state.tsx\`, \`loading.tsx\`, and \`error-banner.tsx\`.

## Validation

After changing scenarios or setup:

1. Run the relevant app typecheck/build if available.
2. Run \`component-shot gallery\` for live inspection, or capture with \`component-shot --scenario ... --save --json\`.
3. Inspect the image or live render before reporting completion.
`)

export const installComponentShotSkill = async (
	optionsInput: ComponentShotSkillInstallOptions = {},
): Promise<ComponentShotSkillInstallResult> => {
	const options = {
		...defaultSkillOptions,
		...optionsInput,
	}
	if (!isValidSkillName(options.name)) {
		throw new Error(
			'--name must use lowercase letters, numbers, and hyphens, be 1-64 characters long, and not start/end with or contain consecutive hyphens',
		)
	}

	const cwd = path.resolve(process.cwd(), options.cwd ?? '.')
	const outputDir = path.resolve(cwd, options.outputDir)
	const skillDir = path.join(outputDir, options.name)
	const files = [
		{
			content: createSkillMarkdown(options.name),
			path: path.join(skillDir, 'SKILL.md'),
		},
	]

	if (!options.overwrite) {
		const existingFiles = (
			await Promise.all(files.map(async (file) => ((await pathExists(file.path)) ? file.path : undefined)))
		).filter((file): file is string => Boolean(file))

		if (existingFiles.length > 0) {
			throw new Error(
				`Component Shot skill already exists:\n${existingFiles.join('\n')}\nUse --overwrite to replace it.`,
			)
		}
	}

	for (const file of files) {
		await fs.mkdir(path.dirname(file.path), { recursive: true })
		await fs.writeFile(file.path, file.content, 'utf8')
	}

	return {
		files: files.map((file) => file.path),
		skillDir,
	}
}

export const runComponentShotSkillCli = async ({
	argv = process.argv.slice(2),
	usageCommand = 'component-shot skill [options]',
}: {
	argv?: string[]
	usageCommand?: string
} = {}) => {
	const options = parseSkillCliArgs({ argv, usageCommand })
	const result = await installComponentShotSkill(options)

	if (options.json) {
		process.stdout.write(`${JSON.stringify(result)}\n`)
		return
	}

	process.stdout.write(`Installed Component Shot skill: ${result.skillDir}\n`)
	for (const file of result.files) {
		process.stdout.write(`- ${file}\n`)
	}
}
