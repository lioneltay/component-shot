import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { createRspackBuild, type ComponentShotRspackOptions } from './rspack.js'
export type {
	ComponentShotAppProvider,
	ComponentShotAppSetup,
	ComponentShotMaybePromise,
	ComponentShotScenario,
	ComponentShotScenarioObject,
	ComponentShotWrapper,
} from './runtime/types.js'
export { createRspackBuild, type ComponentShotRspackOptions } from './rspack.js'

export type ComponentShotViewport = {
	height: number
	width: number
}

export type ComponentShotBuildContext = {
	cwd: string
	debug: boolean
	publicDir: string
	scenarioPath: string
}

export type ComponentShotBuildCommand = {
	args?: string[]
	command: string
	cwd?: string
	env?: Record<string, string | undefined>
	shell?: boolean
}

export type ComponentShotBuild =
	| ComponentShotBuildCommand
	| ((
			context: ComponentShotBuildContext,
	  ) => ComponentShotBuildCommand | void | Promise<ComponentShotBuildCommand | void>)

export type ComponentShotOptions = {
	browserChannel?: string
	build?: ComponentShotBuild
	cwd?: string
	debug?: boolean
	errorGlobal?: string
	fullPage?: boolean
	keepTemp?: boolean
	output?: string
	outputDirName?: string
	readyGlobal?: string
	rspack?: ComponentShotRspackOptions | false
	save?: boolean
	saveName?: string
	scenario: string
	screenshotsDir?: string
	selector?: string
	setup?: string
	tempDirPrefix?: string
	timeoutMs?: number
	viewport?: ComponentShotViewport
	waitFor?: string
}

export type ComponentShotSourceOptions = Omit<ComponentShotOptions, 'scenario'> & {
	name?: string
	overwrite?: boolean
	scenario?: string
	scenarioDir?: string
	source: string
}

export type ComponentShotResult = {
	historyPath?: string
	latestPath?: string
	outputPath: string
	tempDir?: string
	url: string
}

export type ComponentShotSourceResult = ComponentShotResult & {
	scenarioPath: string
}

export type ComponentShotCliConfig = {
	argv?: string[]
	build?: ComponentShotBuild
	defaults?: Partial<
		Pick<
			ComponentShotOptions,
			| 'errorGlobal'
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

type ParsedCliOptions = Omit<ComponentShotOptions, 'build' | 'scenario'> & {
	buildCommand?: string
	json?: boolean
	name?: string
	overwrite?: boolean
	publicDirEnv: string
	scenario?: string
	scenarioDir: string
	scenarioEnv: string
	source?: string
}

const defaultOptions = {
	debug: false,
	errorGlobal: '__COMPONENT_SHOT_ERROR__',
	fullPage: false,
	keepTemp: false,
	outputDirName: 'component-shots',
	readyGlobal: '__COMPONENT_SHOT_READY__',
	save: false,
	screenshotsDir: 'component-shot/screenshots',
	selector: '[data-component-shot-root]',
	tempDirPrefix: 'component-shot-',
	timeoutMs: 15_000,
	viewport: {
		height: 900,
		width: 1440,
	},
} satisfies Required<
	Pick<
		ComponentShotOptions,
		| 'debug'
		| 'errorGlobal'
		| 'fullPage'
		| 'keepTemp'
		| 'outputDirName'
		| 'readyGlobal'
		| 'save'
		| 'screenshotsDir'
		| 'selector'
		| 'tempDirPrefix'
		| 'timeoutMs'
		| 'viewport'
	>
>

const defaultCliEnv = {
	publicDirEnv: 'COMPONENT_SHOT_PUBLIC_DIR',
	scenarioDir: 'component-shot/scenarios',
	scenarioEnv: 'COMPONENT_SHOT_SCENARIO',
}

const defaultSetupPaths = [
	'component-shot/setup.tsx',
	'component-shot/setup.ts',
	'component-shot/setup.jsx',
	'component-shot/setup.js',
]

const setupFilenames = ['setup.tsx', 'setup.ts', 'setup.jsx', 'setup.js']

const contentTypes: Record<string, string> = {
	'.css': 'text/css; charset=utf-8',
	'.gif': 'image/gif',
	'.html': 'text/html; charset=utf-8',
	'.jpeg': 'image/jpeg',
	'.jpg': 'image/jpeg',
	'.js': 'text/javascript; charset=utf-8',
	'.json': 'application/json; charset=utf-8',
	'.map': 'application/json; charset=utf-8',
	'.png': 'image/png',
	'.svg': 'image/svg+xml',
	'.webp': 'image/webp',
}

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

const parseViewport = (value: string): ComponentShotViewport => {
	const match = value.match(/^(\d+)x(\d+)$/i)
	if (!match) {
		throw new Error(`Invalid viewport "${value}". Use WIDTHxHEIGHT, for example 1440x900.`)
	}

	return {
		height: Number(match[2]),
		width: Number(match[1]),
	}
}

const createUsage = (usageCommand: string) => `Usage:
  ${usageCommand}

Options:
  --scenario <path>         Scenario module to render. With --source, writes source to this path.
  --source <tsx>            Write a scenario module source string before capture.
  --name <name>             Scenario filename stem for --source when --scenario is omitted.
  --scenario-dir <path>     Directory for --source scenarios. Defaults to component-shot/scenarios.
  --overwrite               Allow --source to replace an existing scenario file.
  --setup <path>            App setup module exporting providers. Defaults to component-shot/setup.* when present.
  --build-command <command> Shell build command escape hatch. Defaults to built-in Rspack.
  --output <path>           PNG output path. Defaults to a temp PNG path.
  --save                    Write latest.png and history/<timestamp>.png for the scenario.
  --save-name <name>        Name to use under the screenshots directory. Defaults to scenario filename.
  --screenshots-dir <path>  Directory used by --save. Defaults to component-shot/screenshots.
  --selector <selector>     Element selector to screenshot. Defaults to [data-component-shot-root].
  --viewport <WxH>          Browser viewport. Defaults to 1440x900.
  --wait-for <selector>     Extra selector to wait for before capture.
  --timeout <ms>            Navigation/render timeout. Defaults to 15000.
  --browser-channel <id>    Optional system browser channel, for example chrome.
  --ready-global <name>     Window global that becomes true when rendering is ready.
  --error-global <name>     Window global containing a render error message.
  --scenario-env <name>     Env var used for the scenario path in --build-command.
  --public-dir-env <name>   Env var used for the temp public dir in --build-command.
  --cwd <path>              Working directory. Defaults to the current directory.
  --full-page               Capture the whole page instead of the selector.
  --json                    Print machine-readable JSON.
  --debug                   Print build/browser diagnostics.
  --keep-temp               Keep the temporary bundle directory.`

const parseCliArgs = ({
	argv,
	defaults,
	usageCommand,
}: {
	argv: string[]
	defaults?: ComponentShotCliConfig['defaults']
	usageCommand: string
}): ParsedCliOptions => {
	const options: ParsedCliOptions = {
		...defaultOptions,
		...defaultCliEnv,
		...defaults,
		viewport: {
			...defaultOptions.viewport,
			...defaults?.viewport,
		},
	}
	const usage = createUsage(usageCommand)

	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index]
		const flag = arg.includes('=') ? arg.slice(0, arg.indexOf('=')) : arg

		switch (flag) {
			case '--':
				break
			case '--browser-channel': {
				const [value, nextIndex] = readFlagValue(argv, index, arg)
				options.browserChannel = value
				index = nextIndex
				break
			}
			case '--build-command': {
				const [value, nextIndex] = readFlagValue(argv, index, arg)
				options.buildCommand = value
				index = nextIndex
				break
			}
			case '--cwd': {
				const [value, nextIndex] = readFlagValue(argv, index, arg)
				options.cwd = value
				index = nextIndex
				break
			}
			case '--debug':
				options.debug = true
				break
			case '--error-global': {
				const [value, nextIndex] = readFlagValue(argv, index, arg)
				options.errorGlobal = value
				index = nextIndex
				break
			}
			case '--full-page':
				options.fullPage = true
				break
			case '--help':
			case '-h':
				process.stdout.write(`${usage}\n`)
				process.exit(0)
				break
			case '--json':
				options.json = true
				break
			case '--keep-temp':
				options.keepTemp = true
				break
			case '--name': {
				const [value, nextIndex] = readFlagValue(argv, index, arg)
				options.name = value
				index = nextIndex
				break
			}
			case '--output': {
				const [value, nextIndex] = readFlagValue(argv, index, arg)
				options.output = value
				index = nextIndex
				break
			}
			case '--overwrite':
				options.overwrite = true
				break
			case '--public-dir-env': {
				const [value, nextIndex] = readFlagValue(argv, index, arg)
				options.publicDirEnv = value
				index = nextIndex
				break
			}
			case '--ready-global': {
				const [value, nextIndex] = readFlagValue(argv, index, arg)
				options.readyGlobal = value
				index = nextIndex
				break
			}
			case '--save':
				options.save = true
				break
			case '--save-name': {
				const [value, nextIndex] = readFlagValue(argv, index, arg)
				options.saveName = value
				index = nextIndex
				break
			}
			case '--scenario': {
				const [value, nextIndex] = readFlagValue(argv, index, arg)
				options.scenario = value
				index = nextIndex
				break
			}
			case '--scenario-dir': {
				const [value, nextIndex] = readFlagValue(argv, index, arg)
				options.scenarioDir = value
				index = nextIndex
				break
			}
			case '--screenshots-dir': {
				const [value, nextIndex] = readFlagValue(argv, index, arg)
				options.screenshotsDir = value
				index = nextIndex
				break
			}
			case '--scenario-env': {
				const [value, nextIndex] = readFlagValue(argv, index, arg)
				options.scenarioEnv = value
				index = nextIndex
				break
			}
			case '--setup': {
				const [value, nextIndex] = readFlagValue(argv, index, arg)
				options.setup = value
				index = nextIndex
				break
			}
			case '--source': {
				const [value, nextIndex] = readFlagValue(argv, index, arg)
				options.source = value
				index = nextIndex
				break
			}
			case '--selector': {
				const [value, nextIndex] = readFlagValue(argv, index, arg)
				options.selector = value
				index = nextIndex
				break
			}
			case '--timeout': {
				const [value, nextIndex] = readFlagValue(argv, index, arg)
				options.timeoutMs = Number(value)
				index = nextIndex
				break
			}
			case '--viewport': {
				const [value, nextIndex] = readFlagValue(argv, index, arg)
				options.viewport = parseViewport(value)
				index = nextIndex
				break
			}
			case '--wait-for': {
				const [value, nextIndex] = readFlagValue(argv, index, arg)
				options.waitFor = value
				index = nextIndex
				break
			}
			default:
				throw new Error(`Unknown option "${arg}"\n\n${usage}`)
		}
	}

	if (!options.scenario && !options.source) {
		throw new Error(`Missing required --scenario or --source option\n\n${usage}`)
	}

	const timeoutMs = options.timeoutMs ?? defaultOptions.timeoutMs
	if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
		throw new Error('--timeout must be a positive number of milliseconds')
	}
	options.timeoutMs = timeoutMs

	return options
}

const sanitizeFilename = (value: string) =>
	value
		.replace(/[^a-z0-9_.-]+/gi, '-')
		.replace(/^-+|-+$/g, '')
		.toLowerCase() || 'component-shot'

const createTimestamp = () => new Date().toISOString().replace(/[:.]/g, '-')

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

const findComponentShotDir = (scenarioPath: string) => {
	let current = path.dirname(scenarioPath)

	while (true) {
		if (path.basename(current) === 'component-shot') {
			return current
		}

		const parent = path.dirname(current)
		if (parent === current) {
			return undefined
		}
		current = parent
	}
}

const findSetupPath = async (componentShotDir: string) => {
	for (const filename of setupFilenames) {
		const candidate = path.join(componentShotDir, filename)
		if (await pathExists(candidate)) {
			return candidate
		}
	}

	return undefined
}

const resolveSetupPath = async ({
	cwd,
	scenarioPath,
	setup,
}: {
	cwd: string
	scenarioPath: string
	setup?: string
}) => {
	if (setup) {
		return setup
	}

	const scenarioComponentShotDir = findComponentShotDir(scenarioPath)
	if (scenarioComponentShotDir) {
		const scenarioSetupPath = await findSetupPath(scenarioComponentShotDir)
		if (scenarioSetupPath) {
			return scenarioSetupPath
		}
	}

	for (const candidate of defaultSetupPaths) {
		if (await pathExists(path.resolve(cwd, candidate))) {
			return candidate
		}
	}

	return undefined
}

const getScenarioName = (scenarioPath: string) => {
	const basename = path.basename(scenarioPath, path.extname(scenarioPath))
	return basename === 'index' ? path.basename(path.dirname(scenarioPath)) : basename
}

const sanitizeScenarioName = (value: string) => sanitizeFilename(value.replace(/\.[jt]sx?$/i, ''))

const createScenarioPathForSource = ({
	cwd,
	options,
}: {
	cwd: string
	options: Pick<ComponentShotSourceOptions, 'name' | 'scenario' | 'scenarioDir'>
}) => {
	if (options.scenario) {
		return path.resolve(cwd, options.scenario)
	}

	const name =
		options.name ?? `source-${new Date().toISOString().replace(/[:.]/g, '-').toLowerCase()}`
	return path.resolve(cwd, options.scenarioDir ?? defaultCliEnv.scenarioDir, `${sanitizeScenarioName(name)}.tsx`)
}

const writeScenarioSource = async ({
	overwrite = false,
	scenarioPath,
	source,
}: {
	overwrite?: boolean
	scenarioPath: string
	source: string
}) => {
	if (!overwrite && (await pathExists(scenarioPath))) {
		throw new Error(`${scenarioPath} already exists. Pass --overwrite to replace it.`)
	}

	await fs.mkdir(path.dirname(scenarioPath), { recursive: true })
	await fs.writeFile(scenarioPath, source.endsWith('\n') ? source : `${source}\n`, 'utf8')
}

const resolveScreenshotsDir = ({
	cwd,
	options,
	scenarioPath,
}: {
	cwd: string
	options: RequiredCaptureOptions
	scenarioPath: string
}) => {
	if (options.screenshotsDir !== defaultOptions.screenshotsDir) {
		return path.resolve(cwd, options.screenshotsDir)
	}

	const scenarioComponentShotDir = findComponentShotDir(scenarioPath)
	if (scenarioComponentShotDir) {
		return path.join(scenarioComponentShotDir, 'screenshots')
	}

	return path.resolve(cwd, defaultOptions.screenshotsDir)
}

const createSavedShotPaths = ({
	cwd,
	options,
	scenarioPath,
}: {
	cwd: string
	options: RequiredCaptureOptions
	scenarioPath: string
}) => {
	const scenarioName = sanitizeFilename(options.saveName ?? getScenarioName(scenarioPath))
	const scenarioDir = path.join(resolveScreenshotsDir({ cwd, options, scenarioPath }), scenarioName)

	return {
		historyPath: path.join(scenarioDir, 'history', `${createTimestamp()}.png`),
		latestPath: path.join(scenarioDir, 'latest.png'),
	}
}

const createOutputPath = async ({
	cwd,
	options,
	scenarioPath,
}: {
	cwd: string
	options: RequiredCaptureOptions
	scenarioPath: string
}): Promise<{
	historyPath?: string
	latestPath?: string
	outputPath: string
}> => {
	const savedShotPaths = options.save ? createSavedShotPaths({ cwd, options, scenarioPath }) : undefined
	const outputPath =
		options.output ??
		savedShotPaths?.latestPath ??
		path.join(
			os.tmpdir(),
			options.outputDirName,
			`${sanitizeFilename(getScenarioName(scenarioPath))}-${Date.now()}.png`,
		)

	const resolvedOutputPath = path.resolve(cwd, outputPath)
	await fs.mkdir(path.dirname(resolvedOutputPath), { recursive: true })
	return {
		...savedShotPaths,
		outputPath: resolvedOutputPath,
	}
}

type RequiredCaptureOptions = Required<
	Pick<
		ComponentShotOptions,
		| 'debug'
		| 'errorGlobal'
		| 'fullPage'
		| 'keepTemp'
		| 'outputDirName'
		| 'readyGlobal'
		| 'save'
		| 'screenshotsDir'
		| 'selector'
		| 'tempDirPrefix'
		| 'timeoutMs'
		| 'viewport'
	>
> &
	ComponentShotOptions

const removeUndefinedValues = <T extends Record<string, unknown>>(value: T) =>
	Object.fromEntries(Object.entries(value).filter(([, entryValue]) => entryValue !== undefined))

const resolveOptions = (options: ComponentShotOptions): RequiredCaptureOptions => {
	const definedOptions = removeUndefinedValues(options) as ComponentShotOptions

	return {
		...defaultOptions,
		...definedOptions,
		viewport: {
			...defaultOptions.viewport,
			...options.viewport,
		},
	}
}

const resolveBuildCommand = async (
	build: ComponentShotBuild,
	context: ComponentShotBuildContext,
): Promise<ComponentShotBuildCommand | void> =>
	typeof build === 'function' ? await build(context) : build

const buildBundle = async ({
	build,
	context,
}: {
	build: ComponentShotBuild
	context: ComponentShotBuildContext
}) => {
	const command = await resolveBuildCommand(build, context)
	if (!command) {
		return
	}

	await new Promise<void>((resolve, reject) => {
		const child = spawn(command.command, command.args ?? [], {
			cwd: command.cwd ?? context.cwd,
			env: {
				...process.env,
				...command.env,
			},
			shell: command.shell,
			stdio: context.debug ? 'inherit' : ['ignore', 'pipe', 'pipe'],
		})

		const output: string[] = []
		child.stdout?.on('data', (chunk) => output.push(String(chunk)))
		child.stderr?.on('data', (chunk) => output.push(String(chunk)))
		child.on('error', reject)
		child.on('exit', (code) => {
			if (code === 0) {
				resolve()
				return
			}

			reject(new Error(output.join('').trim() || `${command.command} exited with code ${code}`))
		})
	})
}

const saveShot = async ({
	historyPath,
	latestPath,
	outputPath,
}: {
	historyPath: string
	latestPath: string
	outputPath: string
}) => {
	await fs.mkdir(path.dirname(latestPath), { recursive: true })
	await fs.mkdir(path.dirname(historyPath), { recursive: true })

	if (path.resolve(outputPath) !== path.resolve(latestPath)) {
		await fs.copyFile(outputPath, latestPath)
	}

	await fs.copyFile(outputPath, historyPath)
}

const sendNotFound = (response: http.ServerResponse) => {
	response.statusCode = 404
	response.end('Not found')
}

const sendStaticFile = async ({
	filePath,
	response,
}: {
	filePath: string
	response: http.ServerResponse
}) => {
	try {
		const content = await fs.readFile(filePath)
		response.statusCode = 200
		response.setHeader(
			'Content-Type',
			contentTypes[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream',
		)
		response.end(content)
	} catch (error) {
		const code = typeof error === 'object' && error && 'code' in error ? error.code : undefined
		if (code === 'ENOENT' || code === 'EISDIR') {
			sendNotFound(response)
			return
		}
		throw error
	}
}

const startServer = async (publicDir: string) => {
	const resolvedPublicDir = path.resolve(publicDir)
	const server = http.createServer((request, response) => {
		void (async () => {
			const url = new URL(request.url ?? '/', 'http://127.0.0.1')
			const decodedPathname = decodeURIComponent(url.pathname)
			const relativePath = decodedPathname === '/' ? 'index.html' : decodedPathname.slice(1)
			const filePath = path.resolve(resolvedPublicDir, relativePath)

			if (filePath !== resolvedPublicDir && !filePath.startsWith(`${resolvedPublicDir}${path.sep}`)) {
				response.statusCode = 403
				response.end('Forbidden')
				return
			}

			await sendStaticFile({ filePath, response })
		})().catch((error: unknown) => {
			response.statusCode = 500
			response.end(error instanceof Error ? error.message : String(error))
		})
	})

	await new Promise<void>((resolve) => {
		server.listen(0, '127.0.0.1', resolve)
	})

	const address = server.address()
	if (!address || typeof address === 'string') {
		throw new Error('Unable to read component-shot server address')
	}

	return {
		server,
		url: `http://127.0.0.1:${address.port}`,
	}
}

const closeServer = (server?: http.Server) =>
	new Promise<void>((resolve, reject) => {
		if (!server) {
			resolve()
			return
		}

		server.close((error) => {
			if (error) {
				reject(error)
				return
			}

			resolve()
		})
	})

const captureShot = async ({
	options,
	outputPath,
	url,
}: {
	options: RequiredCaptureOptions
	outputPath: string
	url: string
}) => {
	const browser = await chromium.launch({
		channel: options.browserChannel,
		headless: true,
	})

	try {
		const page = await browser.newPage({ viewport: options.viewport })
		const pageErrors: string[] = []

		page.on('pageerror', (error) => {
			pageErrors.push(error.stack ?? error.message)
		})

		if (options.debug) {
			page.on('console', (message) => {
				process.stderr.write(`[browser:${message.type()}] ${message.text()}\n`)
			})
		}

		await page.goto(url, {
			timeout: options.timeoutMs,
			waitUntil: 'domcontentloaded',
		})
		await page.waitForFunction(
			({ errorGlobal, readyGlobal }) =>
				(globalThis as Record<string, unknown>)[readyGlobal] === true ||
				Boolean((globalThis as Record<string, unknown>)[errorGlobal]),
			{
				errorGlobal: options.errorGlobal,
				readyGlobal: options.readyGlobal,
			},
			{ timeout: options.timeoutMs },
		)

		const renderError = await page.evaluate(
			(errorGlobal) => (globalThis as Record<string, unknown>)[errorGlobal],
			options.errorGlobal,
		)
		if (renderError) {
			throw new Error(String(renderError))
		}

		if (options.waitFor) {
			await page.locator(options.waitFor).waitFor({
				state: 'visible',
				timeout: options.timeoutMs,
			})
		}

		await page.evaluate(async () => {
			await document.fonts?.ready
		})

		if (pageErrors.length > 0) {
			throw new Error(pageErrors.join('\n\n'))
		}

		if (options.fullPage) {
			await page.screenshot({ fullPage: true, path: outputPath })
		} else {
			const target = page.locator(options.selector).first()
			await target.waitFor({
				state: 'visible',
				timeout: options.timeoutMs,
			})
			await target.screenshot({ path: outputPath, timeout: options.timeoutMs })
		}
	} finally {
		await browser.close()
	}
}

export const captureComponentShot = async (
	optionsInput: ComponentShotOptions,
): Promise<ComponentShotResult> => {
	const options = resolveOptions(optionsInput)
	if (!options.build && options.rspack === false) {
		throw new Error('A custom build is required when rspack is false')
	}
	const rspackOptions = typeof options.rspack === 'object' ? options.rspack : {}
	const cwd = path.resolve(process.cwd(), options.cwd ?? '.')
	const scenarioPath = path.resolve(cwd, options.scenario)
	await fs.access(scenarioPath)
	const setup = await resolveSetupPath({ cwd, scenarioPath, setup: options.setup })
	const build = options.build ?? createRspackBuild({ ...rspackOptions, setup })

	const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), options.tempDirPrefix))
	const publicDir = path.join(tempDir, 'public')
	await fs.mkdir(publicDir, { recursive: true })

	let server: http.Server | undefined
	let url = ''

	try {
		const { historyPath, latestPath, outputPath } = await createOutputPath({
			cwd,
			options,
			scenarioPath,
		})
		await buildBundle({
			build,
			context: {
				cwd,
				debug: options.debug,
				publicDir,
				scenarioPath,
			},
		})

		const serverDetails = await startServer(publicDir)
		server = serverDetails.server
		url = serverDetails.url

		await captureShot({ options, outputPath, url })
		if (historyPath && latestPath) {
			await saveShot({ historyPath, latestPath, outputPath })
		}

		return {
			historyPath,
			latestPath,
			outputPath,
			tempDir: options.keepTemp ? tempDir : undefined,
			url,
		}
	} finally {
		await closeServer(server)

		if (!options.keepTemp) {
			await fs.rm(tempDir, { force: true, recursive: true })
		}
	}
}

export const captureComponentSource = async (
	optionsInput: ComponentShotSourceOptions,
): Promise<ComponentShotSourceResult> => {
	const cwd = path.resolve(process.cwd(), optionsInput.cwd ?? '.')
	const scenarioPath = createScenarioPathForSource({ cwd, options: optionsInput })
	await writeScenarioSource({
		overwrite: optionsInput.overwrite,
		scenarioPath,
		source: optionsInput.source,
	})

	const {
		name: _name,
		overwrite: _overwrite,
		scenario: _scenario,
		scenarioDir: _scenarioDir,
		source: _source,
		...captureOptions
	} = optionsInput
	const result = await captureComponentShot({
		...captureOptions,
		cwd,
		scenario: path.relative(cwd, scenarioPath),
	})

	return {
		...result,
		scenarioPath,
	}
}

export const runComponentShotCli = async ({
	argv = process.argv.slice(2),
	build,
	defaults,
	rspack,
	setup,
	usageCommand = 'component-shot --scenario <file.tsx> [--setup setup.tsx] [options]',
	}: ComponentShotCliConfig = {}) => {
		try {
			const options = parseCliArgs({ argv, defaults, usageCommand })
			const cliBuild =
				build ??
				(options.buildCommand
				? ((context) => ({
						command: options.buildCommand ?? '',
						env: {
							[options.publicDirEnv]: context.publicDir,
							[options.scenarioEnv]: context.scenarioPath,
						},
						shell: true,
					}) satisfies ComponentShotBuild)
					: undefined)

			const captureOptions = {
				...options,
				build: cliBuild,
				rspack: options.rspack ?? rspack,
				setup: options.setup ?? setup,
			}
			const result = options.source
				? await captureComponentSource({
						...captureOptions,
						source: options.source,
					})
				: await captureComponentShot({
						...captureOptions,
						scenario: options.scenario ?? '',
					})

		if (options.json) {
			process.stdout.write(`${JSON.stringify(result)}\n`)
			return
		}

		process.stdout.write(`${result.outputPath}\n`)
		if (result.tempDir) {
			process.stderr.write(`Kept temp bundle: ${result.tempDir}\n`)
		}
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error)
		process.stderr.write(`${message}\n`)
		process.exitCode = 1
	}
}
