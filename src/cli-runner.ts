import type { ComponentShotBuild, ComponentShotBuildContext } from './build-types.js'
import { resolveComponentShotCliWorkspace } from './cli-workspace.js'
import {
	captureComponentShot,
	captureComponentSource,
	type ComponentShotOptions,
} from './capture-api.js'
import { runComponentShotGalleryCli } from './gallery.js'
import {
	initializeComponentShot,
	installComponentShotBrowser,
	installComponentShotMcpConfig,
	runComponentShotDoctor,
} from './onboarding.js'
import type { ComponentShotRspackOptions } from './rspack.js'
import type { ComponentShotEnvironment, ComponentShotViewport } from './runtime/types.js'
import { runComponentShotSkillCli } from './skill.js'
import { createComponentShotWorkspace } from './workspace.js'

export type ComponentShotCliConfig = {
	argv?: string[]
	build?: ComponentShotBuild
	defaults?: Partial<
		Pick<
			ComponentShotOptions,
			| 'animations'
			| 'environment'
			| 'errorGlobal'
			| 'metadataGlobal'
			| 'outputDirName'
			| 'readyGlobal'
			| 'selector'
			| 'screenshotsDir'
			| 'tempDirPrefix'
			| 'timeoutMs'
			| 'viewport'
		>
	>
	rspack?: ComponentShotRspackOptions | false
	setup?: string
	usageCommand?: string
}

type ParsedCaptureOptions = {
	buildCommand?: string
	help: boolean
	json: boolean
	name?: string
	options: Partial<ComponentShotOptions>
	overwrite: boolean
	publicDirEnv: string
	scenarioEnv: string
	source?: string
}

const defaultCaptureUsage = 'component-shot capture --scenario <file.tsx> [options]'

const createUsage = (captureUsage = defaultCaptureUsage) => `Usage:
  ${captureUsage}
${captureUsage === defaultCaptureUsage ? '  component-shot --scenario <file.tsx> [options]\n' : ''}  component-shot gallery [options]
  component-shot list [options]
  component-shot init [options]
  component-shot doctor [options]
  component-shot browser install [chromium]
  component-shot mcp install [--client codex]
  component-shot skill [options]

Capture options:
  --scenario <path>         Scenario module to render.
  --source <tsx>            Write and capture complete scenario source in one command.
  --name <name>             Scenario filename stem used with --source.
  --scenario-dir <path>     Scenario root. Defaults to component-shot/scenarios.
  --overwrite               Allow --source to replace an existing scenario.
  --setup <path>            Setup/provider module. Defaults to nearest component-shot/setup.*.
  --output <path>           Explicit PNG output path.
  --save                    Publish latest.png and timestamped local history.
  --save-name <name>        Legacy artifact folder override.
  --screenshots-dir <path>  Screenshot root. Defaults beside the scenario directory.
  --selector <selector>     Element to capture. Defaults to [data-component-shot-root].
  --full-page               Capture the whole page.
  --viewport <WxH>          Browser viewport. Defaults to 1440x900.
  --wait-for <selector>     Wait for an additional visible element.
  --timeout <ms>            End-to-end deadline. Defaults to 15000.
  --browser-channel <id>    System browser channel, for example chrome.
  --locale <locale>         Browser locale. Defaults to en-US.
  --timezone <zone>         Browser timezone. Defaults to UTC.
  --color-scheme <mode>     light or dark.
  --allow-network           Allow requests outside the local render origin.
  --animations <mode>       disabled or allow. Defaults to disabled.
  --build-command <command> Trusted CLI build-command escape hatch.
  --cwd <path>              Project root. Defaults to current directory.
  --json                    Print machine-readable output.
  --debug                   Print renderer and browser diagnostics.
  --keep-temp               Keep session build files for debugging.
  --help                    Show this help message.`

const commandUsage = {
	browser: `Usage:
  component-shot browser install [chromium] [--json]

Installs the package-owned Playwright browser without relying on a project Playwright CLI.`,
	doctor: `Usage:
  component-shot doctor [--cwd <path>] [--scenario-dir <path>] [--screenshots-dir <path>] [--setup <path>] [--json]

Checks React dependencies, provider setup, scenarios, and a usable browser.`,
	init: `Usage:
  component-shot init [--cwd <path>] [--scenario-dir <path>] [--overwrite] [--json]

Creates a typed provider setup and example React scenario.`,
	list: `Usage:
  component-shot list [--cwd <path>] [--scenario-dir <path>] [--screenshots-dir <path>] [--json]

Lists stable scenario IDs, paths, artifact keys, and history counts.`,
	mcp: `Usage:
  component-shot mcp install [--client codex] [--cwd <path>] [--json]

Adds a project-local Component Shot MCP server configuration.`,
} as const

const readValue = (args: string[], index: number, flag: string): [string, number] => {
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

const parseViewport = (value: string): ComponentShotViewport => {
	const match = value.match(/^(\d+)x(\d+)$/i)
	if (!match) {
		throw new Error(`Invalid viewport "${value}". Use WIDTHxHEIGHT, for example 1440x900.`)
	}
	return { height: Number(match[2]), width: Number(match[1]) }
}

const parseCaptureArgs = (
	argv: string[],
	defaults: ComponentShotCliConfig['defaults'],
	usage: string,
): ParsedCaptureOptions => {
	const options: Partial<ComponentShotOptions> = {
		...defaults,
		environment: { ...defaults?.environment },
		viewport: defaults?.viewport ? { ...defaults.viewport } : undefined,
	}
	const parsed: ParsedCaptureOptions = {
		help: false,
		json: false,
		options,
		overwrite: false,
		publicDirEnv: 'COMPONENT_SHOT_PUBLIC_DIR',
		scenarioEnv: 'COMPONENT_SHOT_SCENARIO',
	}
	const setEnvironment = (value: Partial<ComponentShotEnvironment>) => {
		options.environment = { ...options.environment, ...value }
	}

	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index] ?? ''
		const flag = arg.includes('=') ? arg.slice(0, arg.indexOf('=')) : arg
		switch (flag) {
			case '--':
				break
			case '--allow-network':
				setEnvironment({ network: 'allow' })
				break
			case '--animations': {
				const [value, next] = readValue(argv, index, arg)
				if (value !== 'allow' && value !== 'disabled') {
					throw new Error('--animations must be disabled or allow')
				}
				options.animations = value
				index = next
				break
			}
			case '--browser-channel': {
				const [value, next] = readValue(argv, index, arg)
				options.browserChannel = value
				index = next
				break
			}
			case '--build-command': {
				const [value, next] = readValue(argv, index, arg)
				parsed.buildCommand = value
				index = next
				break
			}
			case '--color-scheme': {
				const [value, next] = readValue(argv, index, arg)
				if (value !== 'light' && value !== 'dark') {
					throw new Error('--color-scheme must be light or dark')
				}
				setEnvironment({ colorScheme: value })
				index = next
				break
			}
			case '--cwd': {
				const [value, next] = readValue(argv, index, arg)
				options.cwd = value
				index = next
				break
			}
			case '--debug':
				options.debug = true
				break
			case '--error-global': {
				const [value, next] = readValue(argv, index, arg)
				options.errorGlobal = value
				index = next
				break
			}
			case '--full-page':
				options.fullPage = true
				break
			case '--help':
			case '-h':
				parsed.help = true
				break
			case '--json':
				parsed.json = true
				break
			case '--keep-temp':
				options.keepTemp = true
				break
			case '--locale': {
				const [value, next] = readValue(argv, index, arg)
				setEnvironment({ locale: value })
				index = next
				break
			}
			case '--metadata-global': {
				const [value, next] = readValue(argv, index, arg)
				options.metadataGlobal = value
				index = next
				break
			}
			case '--name': {
				const [value, next] = readValue(argv, index, arg)
				parsed.name = value
				index = next
				break
			}
			case '--output': {
				const [value, next] = readValue(argv, index, arg)
				options.output = value
				index = next
				break
			}
			case '--overwrite':
				parsed.overwrite = true
				break
			case '--public-dir-env': {
				const [value, next] = readValue(argv, index, arg)
				parsed.publicDirEnv = value
				index = next
				break
			}
			case '--ready-global': {
				const [value, next] = readValue(argv, index, arg)
				options.readyGlobal = value
				index = next
				break
			}
			case '--save':
				options.save = true
				break
			case '--save-name': {
				const [value, next] = readValue(argv, index, arg)
				options.saveName = value
				index = next
				break
			}
			case '--scenario': {
				const [value, next] = readValue(argv, index, arg)
				options.scenario = value
				index = next
				break
			}
			case '--scenario-dir': {
				const [value, next] = readValue(argv, index, arg)
				options.scenarioDir = value
				index = next
				break
			}
			case '--scenario-env': {
				const [value, next] = readValue(argv, index, arg)
				parsed.scenarioEnv = value
				index = next
				break
			}
			case '--screenshots-dir': {
				const [value, next] = readValue(argv, index, arg)
				options.screenshotsDir = value
				index = next
				break
			}
			case '--selector': {
				const [value, next] = readValue(argv, index, arg)
				options.selector = value
				index = next
				break
			}
			case '--setup': {
				const [value, next] = readValue(argv, index, arg)
				options.setup = value
				index = next
				break
			}
			case '--source': {
				const [value, next] = readValue(argv, index, arg)
				parsed.source = value
				index = next
				break
			}
			case '--timeout': {
				const [value, next] = readValue(argv, index, arg)
				options.timeoutMs = Number(value)
				index = next
				break
			}
			case '--timezone': {
				const [value, next] = readValue(argv, index, arg)
				setEnvironment({ timezoneId: value })
				index = next
				break
			}
			case '--viewport': {
				const [value, next] = readValue(argv, index, arg)
				options.viewport = parseViewport(value)
				index = next
				break
			}
			case '--wait-for': {
				const [value, next] = readValue(argv, index, arg)
				options.waitFor = value
				index = next
				break
			}
			default:
				throw new Error(`Unknown option "${arg}"\n\n${usage}`)
		}
	}
	return parsed
}

const parseSimpleOptions = (
	argv: string[],
	{
		boolean: booleanFlags = ['help', 'h', 'json'],
		values: valueFlags = [],
	}: { boolean?: string[]; values?: string[] } = {},
) => {
	const parsed: Record<string, string | boolean> = {}
	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index] ?? ''
		const flag = arg.includes('=') ? arg.slice(0, arg.indexOf('=')) : arg
		const name = flag.replace(/^-+/, '')
		if (booleanFlags.includes(name)) {
			parsed[name] = true
			continue
		}
		if (flag.startsWith('--') && valueFlags.includes(name)) {
			const [value, next] = readValue(argv, index, arg)
			parsed[name] = value
			index = next
			continue
		}
		throw new Error(`Unknown option "${arg}"`)
	}
	return parsed
}

const printResult = (result: unknown, json: boolean) => {
	if (json) {
		process.stdout.write(`${JSON.stringify(result)}\n`)
		return
	}
	if (typeof result === 'string') {
		process.stdout.write(`${result}\n`)
		return
	}
	process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
}

export const runComponentShotCli = async ({
	argv = process.argv.slice(2),
	build,
	defaults,
	rspack,
	setup,
	usageCommand,
}: ComponentShotCliConfig = {}) => {
	const usage = createUsage(usageCommand)
	const jsonRequested = argv.includes('--json')
	try {
		const command = argv[0]
		if (!command || command === '--help' || command === '-h' || command === 'help') {
			process.stdout.write(`${usage}\n`)
			return
		}
		if (command === 'gallery') {
			await runComponentShotGalleryCli({
				argv: argv.slice(1),
				options: {
					build,
					defaults: defaults
						? {
							animations: defaults.animations,
							environment: defaults.environment,
							selector: defaults.selector,
							timeoutMs: defaults.timeoutMs,
							viewport: defaults.viewport,
						}
						: undefined,
					protocol: defaults
						? {
							errorGlobal: defaults.errorGlobal,
							metadataGlobal: defaults.metadataGlobal,
							readyGlobal: defaults.readyGlobal,
						}
						: undefined,
					rspack,
					screenshotsDir: defaults?.screenshotsDir,
					setup,
				},
			})
			return
		}
		if (command === 'skill') {
			await runComponentShotSkillCli({ argv: argv.slice(1) })
			return
		}
		if (command === 'browser') {
			const subcommand = argv[1]
			if (argv.includes('--help') || argv.includes('-h')) {
				process.stdout.write(`${commandUsage.browser}\n`)
				return
			}
			if (subcommand !== 'install') {
				throw new Error(commandUsage.browser)
			}
			const browserArgs = argv.slice(2)
			const unknownBrowserOption = browserArgs.find(
				(entry) => entry.startsWith('--') && entry !== '--json',
			)
			if (unknownBrowserOption) throw new Error(`Unknown option "${unknownBrowserOption}"`)
			const browserNames = browserArgs.filter((entry) => !entry.startsWith('--'))
			if (browserNames.length > 1) throw new Error(commandUsage.browser)
			const browserName = browserNames[0] ?? 'chromium'
			printResult(
				await installComponentShotBrowser(browserName, { quiet: jsonRequested }),
				jsonRequested,
			)
			return
		}
		if (command === 'doctor') {
			const parsed = parseSimpleOptions(argv.slice(1), {
				values: ['cwd', 'scenario-dir', 'screenshots-dir', 'setup'],
			})
			if (parsed.help || parsed.h) {
				process.stdout.write(`${commandUsage.doctor}\n`)
				return
			}
			const workspace = await resolveComponentShotCliWorkspace({
				cwd: parsed.cwd as string | undefined,
				scenarioDir: parsed['scenario-dir'] as string | undefined,
			})
			const result = await runComponentShotDoctor({
				cwd: workspace.cwd,
				scenarioDir: workspace.scenarioDir,
				screenshotsDir: parsed['screenshots-dir'] as string | undefined,
				setup: parsed.setup as string | undefined,
			})
			printResult(result, Boolean(parsed.json))
			if (!result.ready) {
				process.exitCode = 1
			}
			return
		}
		if (command === 'init') {
			const parsed = parseSimpleOptions(argv.slice(1), {
				boolean: ['h', 'help', 'json', 'overwrite'],
				values: ['cwd', 'scenario-dir'],
			})
			if (parsed.help || parsed.h) {
				process.stdout.write(`${commandUsage.init}\n`)
				return
			}
			printResult(
				await initializeComponentShot({
					cwd: parsed.cwd as string | undefined,
					overwrite: Boolean(parsed.overwrite),
					scenarioDir: parsed['scenario-dir'] as string | undefined,
				}),
				Boolean(parsed.json),
			)
			return
		}
		if (command === 'list') {
			const parsed = parseSimpleOptions(argv.slice(1), {
				values: ['cwd', 'scenario-dir', 'screenshots-dir'],
			})
			if (parsed.help || parsed.h) {
				process.stdout.write(`${commandUsage.list}\n`)
				return
			}
			const resolvedWorkspace = await resolveComponentShotCliWorkspace({
				cwd: parsed.cwd as string | undefined,
				scenarioDir: parsed['scenario-dir'] as string | undefined,
			})
			const workspace = await createComponentShotWorkspace({
				cwd: resolvedWorkspace.cwd,
				scenarioDir: resolvedWorkspace.scenarioDir,
				screenshotsDir: parsed['screenshots-dir'] as string | undefined,
			})
			printResult(await workspace.listScenarios(), Boolean(parsed.json))
			return
		}
		if (command === 'mcp') {
			if (argv.includes('--help') || argv.includes('-h')) {
				process.stdout.write(`${commandUsage.mcp}\n`)
				return
			}
			if (argv[1] !== 'install') {
				throw new Error(commandUsage.mcp)
			}
			const parsed = parseSimpleOptions(argv.slice(2), { values: ['client', 'cwd'] })
			printResult(
				await installComponentShotMcpConfig({
					client: (parsed.client as 'codex' | undefined) ?? 'codex',
					cwd: parsed.cwd as string | undefined,
				}),
				Boolean(parsed.json),
			)
			return
		}

		const captureArgv = command === 'capture' ? argv.slice(1) : argv
		const parsed = parseCaptureArgs(captureArgv, defaults, usage)
		if (parsed.help) {
			process.stdout.write(`${usage}\n`)
			return
		}
		if (!parsed.options.scenario && !parsed.source) {
			throw new Error(`Missing required --scenario or --source option\n\n${usage}`)
		}
		const cliBuild =
			build ??
			(parsed.buildCommand
				? ((context: ComponentShotBuildContext) => ({
						command: parsed.buildCommand ?? '',
						env: {
							[parsed.publicDirEnv]: context.publicDir,
							[parsed.scenarioEnv]: context.scenarioPath,
						},
						shell: true,
					}))
				: undefined)
		const captureOptions = {
			...parsed.options,
			build: cliBuild,
			rspack: parsed.options.rspack ?? rspack,
			setup: parsed.options.setup ?? setup,
		}
		const result = parsed.source
			? await captureComponentSource({
					...captureOptions,
					name: parsed.name,
					overwrite: parsed.overwrite,
					scenario: parsed.options.scenario,
					source: parsed.source,
				})
			: await captureComponentShot({
					...captureOptions,
					scenario: parsed.options.scenario ?? '',
				})
		printResult(parsed.json ? result : result.outputPath, parsed.json)
		if (!parsed.json && result.tempDir) {
			process.stderr.write(`Kept session files: ${result.tempDir}\n`)
		}
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error)
		const stage =
			typeof error === 'object' && error && 'stage' in error && typeof error.stage === 'string'
				? error.stage
				: 'unknown'
		if (jsonRequested) {
			process.stdout.write(`${JSON.stringify({ error: { message, stage }, ok: false })}\n`)
		} else {
			process.stderr.write(`${message}\n`)
		}
		process.exitCode = 1
	}
}
