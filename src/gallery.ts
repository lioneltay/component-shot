import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import http from 'node:http'
import path from 'node:path'
import { findLatestArtifact, listHistory } from './artifacts.js'
import type { ComponentShotBuild, ComponentShotRenderProtocol } from './build-types.js'
import { resolveComponentShotCliWorkspace } from './cli-workspace.js'
import {
	runComponentShotGalleryExportCli,
	type ComponentShotGalleryExportOptions,
} from './gallery-export.js'
import { createGalleryHtml } from './gallery-ui.js'
import type { ComponentShotGalleryScenarioView } from './gallery-types.js'
import type { ComponentShotRspackOptions } from './rspack.js'
import type { ComponentShotViewport } from './runtime/types.js'
import { assertPathWithin, isPathWithin, pathExists } from './scenarios.js'
import {
	ComponentShotError,
	componentShotViewportLimits,
	type ComponentShotSession,
	type ComponentShotSessionOptions,
} from './session.js'
import {
	createComponentShotWorkspace,
	type ComponentShotWorkspace,
} from './workspace.js'
import { startWorkspaceWatcher } from './workspace-watcher.js'

export type ComponentShotGalleryOptions = {
	browserChannel?: string
	build?: ComponentShotBuild
	cwd?: string
	defaults?: ComponentShotSessionOptions['defaults']
	editable?: boolean
	host?: string
	open?: boolean
	port?: number
	protocol?: Partial<ComponentShotRenderProtocol>
	rspack?: ComponentShotRspackOptions | false
	scenarioDir?: string
	screenshotsDir?: string
	setup?: string
}

export type ComponentShotGalleryScenario = ComponentShotGalleryScenarioView & {
	detailUrl: string
	previewUrl: string
	relativeScenarioPath: string
	renderUrl: string
	scenarioPath: string
}

export type ComponentShotGalleryIndex = {
	cwd: string
	scenarioDir: string
	scenarios: ComponentShotGalleryScenario[]
	screenshotsDir: string
}

export type ComponentShotGalleryServer = {
	close: () => Promise<void>
	readonly index: ComponentShotGalleryIndex
	server: http.Server
	url: string
}

type ResolvedGalleryOptions = ComponentShotGalleryOptions & {
	cwd: string
	editable: boolean
	host: string
	open: boolean
	port: number
}

type ParsedGalleryOptions = ComponentShotGalleryOptions & {
	help: boolean
	json: boolean
}

type JsonObject = Record<string, unknown>

const defaultGalleryOptions = {
	host: '127.0.0.1',
	open: true,
	port: 0,
} as const

const galleryClientUrl = new URL('./gallery-client.js', import.meta.url)

const isLoopbackHost = (host: string) =>
	host === '127.0.0.1' || host === 'localhost' || host === '::1' || host === '[::1]'

const resolveGalleryOptions = (options: ComponentShotGalleryOptions): ResolvedGalleryOptions => {
	const host = options.host ?? defaultGalleryOptions.host
	const editable = options.editable ?? isLoopbackHost(host)
	if (editable && !isLoopbackHost(host)) {
		throw new Error('Editable gallery mode can only bind to a loopback host')
	}
	const port = options.port ?? defaultGalleryOptions.port
	if (!Number.isInteger(port) || port < 0 || port > 65_535) {
		throw new Error('Gallery port must be an integer from 0 to 65535')
	}

	return {
		...options,
		cwd: path.resolve(process.cwd(), options.cwd ?? '.'),
		editable,
		host,
		open: options.open ?? defaultGalleryOptions.open,
		port,
	}
}

const artifactUrl = ({ artifactPath, screenshotsDir }: { artifactPath: string; screenshotsDir: string }) => {
	if (!isPathWithin({ candidate: artifactPath, root: screenshotsDir })) {
		throw new Error('Artifact path is outside the screenshot directory')
	}
	const relativePath = path.relative(screenshotsDir, artifactPath)
	return `/api/artifacts/${Buffer.from(relativePath).toString('base64url')}`
}

const buildGalleryIndex = async (
	workspace: ComponentShotWorkspace,
): Promise<ComponentShotGalleryIndex> => {
	const scenarios = await workspace.listScenarios()
	const views = await Promise.all(
		scenarios.map(async (scenario): Promise<ComponentShotGalleryScenario> => {
			const latestPath = await findLatestArtifact({
				scenario,
				screenshotsDir: workspace.screenshotsDir,
			})
			const detailUrl = `/?scenario=${encodeURIComponent(scenario.routeId)}`
			const previewEndpoint = `/api/scenarios/${encodeURIComponent(scenario.routeId)}/preview`
			return {
				...scenario,
				detailUrl,
				latestUrl: latestPath
					? artifactUrl({ artifactPath: latestPath, screenshotsDir: workspace.screenshotsDir })
					: undefined,
				previewEndpoint,
				previewUrl: previewEndpoint,
				relativeScenarioPath: scenario.relativePath,
				renderUrl: previewEndpoint,
			}
		}),
	)

	return {
		cwd: workspace.cwd,
		scenarioDir: workspace.scenarioDir,
		scenarios: views,
		screenshotsDir: workspace.screenshotsDir,
	}
}

export const createComponentShotGalleryIndex = async (
	options: ComponentShotGalleryOptions = {},
): Promise<ComponentShotGalleryIndex> => {
	const workspace = await createComponentShotWorkspace(options)
	return buildGalleryIndex(workspace)
}

const sendJson = (response: http.ServerResponse, value: unknown, statusCode = 200) => {
	response.statusCode = statusCode
	response.setHeader('Cache-Control', 'no-store')
	response.setHeader('Content-Type', 'application/json; charset=utf-8')
	response.end(`${JSON.stringify(value)}\n`)
}

const sendHtml = (response: http.ServerResponse, html: string, statusCode = 200) => {
	response.statusCode = statusCode
	response.setHeader('Cache-Control', 'no-store')
	response.setHeader('Content-Type', 'text/html; charset=utf-8')
	response.end(html)
}

const readJsonBody = async (request: http.IncomingMessage): Promise<JsonObject> => {
	const chunks: Buffer[] = []
	let totalBytes = 0
	for await (const chunk of request) {
		const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
		totalBytes += buffer.length
		if (totalBytes > 64 * 1024) {
			throw new ComponentShotError('capture', 'Request body exceeds 64 KB')
		}
		chunks.push(buffer)
	}
	if (chunks.length === 0) {
		return {}
	}
	const value: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'))
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		throw new ComponentShotError('capture', 'Request body must be a JSON object')
	}
	return value as JsonObject
}

const mutationRequestError = (request: http.IncomingMessage, requireJson: boolean) => {
	if (request.headers['sec-fetch-site'] === 'cross-site') {
		return 'Cross-site gallery mutations are not allowed'
	}
	const origin = request.headers.origin
	if (origin) {
		try {
			if (new URL(origin).host !== request.headers.host) return 'Gallery mutation origin does not match'
		} catch {
			return 'Gallery mutation origin is invalid'
		}
	}
	if (requireJson && !request.headers['content-type']?.toLowerCase().startsWith('application/json')) {
		return 'Gallery mutations require application/json'
	}
	return undefined
}

const readViewport = (body: JsonObject): ComponentShotViewport | undefined => {
	if (body.viewport === undefined) {
		return undefined
	}
	if (!body.viewport || typeof body.viewport !== 'object' || Array.isArray(body.viewport)) {
		throw new ComponentShotError('capture', 'viewport must be an object')
	}
	const viewport = body.viewport as Record<string, unknown>
	const width = Number(viewport.width)
	const height = Number(viewport.height)
	if (
		!Number.isInteger(width) ||
		!Number.isInteger(height) ||
		width < componentShotViewportLimits.width.min ||
		width > componentShotViewportLimits.width.max ||
		height < componentShotViewportLimits.height.min ||
		height > componentShotViewportLimits.height.max
	) {
		throw new ComponentShotError(
			'capture',
			`viewport width must be ${componentShotViewportLimits.width.min}-${componentShotViewportLimits.width.max} and height must be ${componentShotViewportLimits.height.min}-${componentShotViewportLimits.height.max}`,
		)
	}
	return { height, width }
}

const serializeError = (error: unknown) => {
	const stage = error instanceof ComponentShotError ? error.stage : 'serve'
	return {
		error: {
			message: error instanceof Error ? error.message : String(error),
			stage,
		},
	}
}

const findScenario = (index: ComponentShotGalleryIndex, routeId: string) =>
	index.scenarios.find((scenario) => scenario.routeId === routeId)

const toScenarioView = (scenario: ComponentShotGalleryScenario): ComponentShotGalleryScenarioView => ({
	artifactKey: scenario.artifactKey,
	historyCount: scenario.historyCount,
	id: scenario.id,
	latestUrl: scenario.latestUrl,
	name: scenario.name,
	previewEndpoint: scenario.previewEndpoint,
	relativePath: scenario.relativePath,
	routeId: scenario.routeId,
})

const closeHttpServer = async (server: http.Server) => {
	if (!server.listening) {
		return
	}
	server.closeAllConnections()
	await new Promise<void>((resolve, reject) => {
		server.close((error) => (error ? reject(error) : resolve()))
	})
}

const startWorkspaceWatchers = async ({
	onHistory,
	onSource,
	workspace,
}: {
	onHistory: () => void
	onSource: (changedPath: string) => void
	workspace: ComponentShotWorkspace
}) => {
	const stopSourceWatcher = await startWorkspaceWatcher({
		ignoredRoots: [workspace.screenshotsDir],
		onChange: onSource,
		root: workspace.cwd,
	})
	let stopHistoryWatcher = () => {}
	if (await pathExists(workspace.screenshotsDir)) {
		stopHistoryWatcher = await startWorkspaceWatcher({
			ignoredDirectoryNames: new Set(),
			onChange: onHistory,
			root: workspace.screenshotsDir,
		})
	}

	return () => {
		stopSourceWatcher()
		stopHistoryWatcher()
	}
}

const createRequestHandler = ({
	clients,
	editable,
	emit,
	getIndex,
	refreshIndex,
	session,
	workspace,
}: {
	clients: Set<http.ServerResponse>
	editable: boolean
	emit: (event: 'history' | 'source') => void
	getIndex: () => ComponentShotGalleryIndex
	refreshIndex: () => Promise<ComponentShotGalleryIndex>
	session: ComponentShotSession
	workspace: ComponentShotWorkspace
}) =>
	async (request: http.IncomingMessage, response: http.ServerResponse) => {
		const url = new URL(request.url ?? '/', 'http://component-shot.local')
		const method = request.method ?? 'GET'

		if (method === 'GET' && url.pathname === '/') {
			const index = getIndex()
			const scenarioDirLabel = path.relative(index.cwd, index.scenarioDir) || index.scenarioDir
			sendHtml(
				response,
				createGalleryHtml({
					editable,
					scenarioDirLabel,
					scenarios: index.scenarios.map(toScenarioView),
					viewportLimits: componentShotViewportLimits,
				}),
			)
			return
		}

		if (method === 'GET' && url.pathname === '/favicon.ico') {
			response.statusCode = 204
			response.end()
			return
		}

		if (method === 'GET' && url.pathname === '/assets/gallery-client.js') {
			response.statusCode = 200
			response.setHeader('Cache-Control', 'no-store')
			response.setHeader('Content-Type', 'text/javascript; charset=utf-8')
			response.end(await fs.readFile(galleryClientUrl))
			return
		}

		if (method === 'GET' && url.pathname === '/api/scenarios') {
			sendJson(response, { scenarios: getIndex().scenarios.map(toScenarioView) })
			return
		}

		if (method === 'GET' && url.pathname === '/api/events') {
			response.statusCode = 200
			response.setHeader('Cache-Control', 'no-cache, no-transform')
			response.setHeader('Connection', 'keep-alive')
			response.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
			response.write('retry: 1000\n\n')
			clients.add(response)
			response.on('close', () => clients.delete(response))
			return
		}

		const renderMatch = url.pathname.match(/^\/render\/([A-Za-z0-9_-]+)\/(.*)$/)
		if (method === 'GET' && renderMatch) {
			const scenario = findScenario(getIndex(), renderMatch[1])
			if (!scenario) {
				sendJson(response, { error: { message: 'Scenario not found', stage: 'discover' } }, 404)
				return
			}
			const preview = await session.getPreview(scenario.scenarioPath)
			const target = new URL(url.pathname + url.search, new URL(preview.url).origin)
			const upstream = await fetch(target)
			response.statusCode = upstream.status
			response.setHeader('Cache-Control', 'no-store')
			response.setHeader(
				'Content-Type',
				upstream.headers.get('content-type') ?? 'application/octet-stream',
			)
			response.end(Buffer.from(await upstream.arrayBuffer()))
			return
		}

		const artifactMatch = url.pathname.match(/^\/api\/artifacts\/([A-Za-z0-9_-]+)$/)
		if (method === 'GET' && artifactMatch) {
			const relativePath = Buffer.from(artifactMatch[1], 'base64url').toString('utf8')
			const artifactPath = await assertPathWithin({
				candidate: path.resolve(workspace.screenshotsDir, relativePath),
				label: 'Artifact path',
				root: workspace.screenshotsDir,
			})
			try {
				const image = await fs.readFile(artifactPath)
				response.statusCode = 200
				response.setHeader('Cache-Control', 'no-store')
				response.setHeader('Content-Type', 'image/png')
				response.end(image)
			} catch (error) {
				const code = typeof error === 'object' && error && 'code' in error ? error.code : undefined
				if (code === 'ENOENT' || code === 'ENOTDIR') {
					sendJson(response, { error: { message: 'Artifact not found', stage: 'artifact' } }, 404)
					return
				}
				throw error
			}
			return
		}

		const scenarioMatch = url.pathname.match(
			/^\/api\/scenarios\/([A-Za-z0-9_-]+)(?:\/(preview|history|capture|export))?$/,
		)
		if (!scenarioMatch) {
			sendJson(response, { error: { message: 'Not found', stage: 'serve' } }, 404)
			return
		}

		const routeId = scenarioMatch[1]
		const action = scenarioMatch[2]
		const scenario = findScenario(getIndex(), routeId)
		if (!scenario) {
			sendJson(response, { error: { message: 'Scenario not found', stage: 'discover' } }, 404)
			return
		}

		if (method === 'GET' && action === 'preview') {
			const preview = await session.getPreview(scenario.scenarioPath)
			sendJson(response, { scenarioId: preview.scenario.id, url: `/render/${routeId}/` })
			return
		}

		if (method === 'GET' && action === 'history') {
			const history = await listHistory({
				limit: 100,
				scenario,
				screenshotsDir: workspace.screenshotsDir,
			})
			sendJson(response, {
				history: history.map((shot) => ({
					filename: shot.filename,
					updatedAt: shot.updatedAt,
					url: artifactUrl({ artifactPath: shot.path, screenshotsDir: workspace.screenshotsDir }),
				})),
			})
			return
		}

		if (method === 'POST' && (action === 'capture' || action === 'export')) {
			if (!editable) {
				sendJson(response, { error: { message: 'Gallery is read-only', stage: 'serve' } }, 403)
				return
			}
			const requestError = mutationRequestError(request, true)
			if (requestError) {
				sendJson(response, { error: { message: requestError, stage: 'serve' } }, 403)
				return
			}
			const body = await readJsonBody(request)
			const output = body.output
			if (action === 'export' && (typeof output !== 'string' || !output.trim())) {
				throw new ComponentShotError('artifact', 'Export requires a project-relative output path')
			}
			if (action === 'export' && !(output as string).trim().toLowerCase().endsWith('.png')) {
				throw new ComponentShotError('artifact', 'Export output must end in .png')
			}
			const result = await session.capture({
				output: action === 'export' ? (output as string).trim() : undefined,
				save: action === 'capture',
				scenario: scenario.scenarioPath,
				viewport: readViewport(body),
			})
			let updatedScenario: ComponentShotGalleryScenario | undefined
			if (action === 'capture') {
				updatedScenario = findScenario(await refreshIndex(), routeId)
				emit('history')
			}
			sendJson(response, {
				diagnostics: result.diagnostics,
				durationMs: result.durationMs,
				historyCount: updatedScenario?.historyCount,
				historyPath: result.historyPath,
				latestUrl: updatedScenario?.latestUrl,
				outputPath: result.outputPath,
				viewport: result.viewport,
			})
			return
		}

		if (method === 'DELETE' && action === undefined) {
			if (!editable) {
				sendJson(response, { error: { message: 'Gallery is read-only', stage: 'serve' } }, 403)
				return
			}
			const requestError = mutationRequestError(request, false)
			if (requestError) {
				sendJson(response, { error: { message: requestError, stage: 'serve' } }, 403)
				return
			}
			await assertPathWithin({
				candidate: scenario.scenarioPath,
				label: 'Scenario path',
				root: workspace.scenarioDir,
			})
			await fs.rm(scenario.scenarioPath)
			await session.invalidate([scenario.scenarioPath])
			await refreshIndex()
			emit('source')
			sendJson(response, { deleted: true })
			return
		}

		sendJson(response, { error: { message: 'Method not allowed', stage: 'serve' } }, 405)
	}

export const startComponentShotGallery = async (
	optionsInput: ComponentShotGalleryOptions = {},
): Promise<ComponentShotGalleryServer> => {
	const options = resolveGalleryOptions(optionsInput)
	const workspace = await createComponentShotWorkspace({ ...options, allowExternalOutput: false })
	const session = await workspace.createSession()
	await fs.mkdir(workspace.screenshotsDir, { recursive: true })
	let index = await buildGalleryIndex(workspace)
	let closed = false
	let sourceTimer: NodeJS.Timeout | undefined
	let historyTimer: NodeJS.Timeout | undefined
	const changedSourcePaths = new Set<string>()
	const clients = new Set<http.ServerResponse>()
	const emit = (event: 'history' | 'source') => {
		for (const client of clients) {
			client.write(`event: ${event}\ndata: {}\n\n`)
		}
	}
	const refreshIndex = async () => {
		index = await buildGalleryIndex(workspace)
		return index
	}
	const scheduleSourceRefresh = (changedPath: string) => {
		changedSourcePaths.add(changedPath)
		if (sourceTimer) clearTimeout(sourceTimer)
		sourceTimer = setTimeout(() => {
			const changedPaths = [...changedSourcePaths]
			changedSourcePaths.clear()
			void Promise.all([session.invalidate(changedPaths), refreshIndex()])
				.then(() => emit('source'))
				.catch((error: unknown) =>
					process.stderr.write(
						`component-shot gallery refresh failed: ${error instanceof Error ? error.message : String(error)}\n`,
					),
				)
		}, 120)
	}
	const scheduleHistoryRefresh = () => {
		if (historyTimer) clearTimeout(historyTimer)
		historyTimer = setTimeout(() => {
			void refreshIndex()
				.then(() => emit('history'))
				.catch((error: unknown) =>
					process.stderr.write(
						`component-shot gallery history refresh failed: ${error instanceof Error ? error.message : String(error)}\n`,
					),
				)
		}, 100)
	}
	const stopWatching = await startWorkspaceWatchers({
		onHistory: scheduleHistoryRefresh,
		onSource: scheduleSourceRefresh,
		workspace,
	})
	const handler = createRequestHandler({
		clients,
		editable: options.editable,
		emit,
		getIndex: () => index,
		refreshIndex,
		session,
		workspace,
	})
	const server = http.createServer((request, response) => {
		void handler(request, response).catch((error: unknown) => {
			const statusCode = error instanceof SyntaxError ? 400 : error instanceof ComponentShotError ? 422 : 500
			if (!response.headersSent) {
				sendJson(response, serializeError(error), statusCode)
			} else {
				response.destroy(error instanceof Error ? error : undefined)
			}
		})
	})

	try {
		await new Promise<void>((resolve, reject) => {
			const onError = (error: Error) => reject(error)
			server.once('error', onError)
			server.listen(options.port, options.host, () => {
				server.off('error', onError)
				resolve()
			})
		})
	} catch (error) {
		stopWatching()
		await session.close()
		throw error
	}

	const address = server.address()
	if (!address || typeof address === 'string') {
		stopWatching()
		await session.close()
		throw new Error('Unable to read component-shot gallery server address')
	}
	const url = `http://${options.host}:${address.port}`

	return {
		close: async () => {
			if (closed) return
			closed = true
			stopWatching()
			if (sourceTimer) clearTimeout(sourceTimer)
			if (historyTimer) clearTimeout(historyTimer)
			for (const client of clients) client.end()
			clients.clear()
			await Promise.allSettled([closeHttpServer(server), session.close()])
		},
		get index() {
			return index
		},
		server,
		url,
	}
}

const createGalleryUsage = (usageCommand: string) => `Usage:
  ${usageCommand}
  component-shot gallery export [options]

Options:
  --scenario-dir <path>     Scenario directory. Defaults to component-shot/scenarios.
  --screenshots-dir <path>  Screenshot history directory beside the scenarios.
  --cwd <path>              Project or search root. One nested project is auto-discovered.
  --setup <path>            React provider setup module.
  --browser-channel <id>    System browser channel, for example chrome.
  --host <host>             Host to bind. Defaults to 127.0.0.1.
  --port <port>             Port to bind. Defaults to an available port.
  --read-only               Disable scenario deletion.
  --no-open                 Do not open the gallery in a browser.
  --json                    Print machine-readable startup output.
  --help                    Show this help message.`

const readFlagValue = (args: string[], index: number, flag: string): [string, number] => {
	const inlineValue = flag.includes('=') ? flag.slice(flag.indexOf('=') + 1) : undefined
	if (inlineValue) return [inlineValue, index]
	const value = args[index + 1]
	if (!value || value.startsWith('--')) throw new Error(`Missing value for ${flag}`)
	return [value, index + 1]
}

const parseGalleryCliArgs = ({
	argv,
	usageCommand,
}: {
	argv: string[]
	usageCommand: string
}): ParsedGalleryOptions => {
	const options: ParsedGalleryOptions = { help: false, json: false }
	const usage = createGalleryUsage(usageCommand)
	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index] ?? ''
		const flag = arg.includes('=') ? arg.slice(0, arg.indexOf('=')) : arg
		switch (flag) {
			case '--browser-channel': {
				const [value, next] = readFlagValue(argv, index, arg)
				options.browserChannel = value
				index = next
				break
			}
			case '--cwd': {
				const [value, next] = readFlagValue(argv, index, arg)
				options.cwd = value
				index = next
				break
			}
			case '--help':
			case '-h':
				options.help = true
				break
			case '--host': {
				const [value, next] = readFlagValue(argv, index, arg)
				options.host = value
				index = next
				break
			}
			case '--json':
				options.json = true
				break
			case '--no-open':
				options.open = false
				break
			case '--open':
				options.open = true
				break
			case '--port': {
				const [value, next] = readFlagValue(argv, index, arg)
				options.port = Number(value)
				index = next
				break
			}
			case '--read-only':
				options.editable = false
				break
			case '--scenario-dir': {
				const [value, next] = readFlagValue(argv, index, arg)
				options.scenarioDir = value
				index = next
				break
			}
			case '--screenshots-dir': {
				const [value, next] = readFlagValue(argv, index, arg)
				options.screenshotsDir = value
				index = next
				break
			}
			case '--setup': {
				const [value, next] = readFlagValue(argv, index, arg)
				options.setup = value
				index = next
				break
			}
			default:
				throw new Error(`Unknown gallery option "${arg}"\n\n${usage}`)
		}
	}
	return options
}

const openUrl = (url: string) => {
	const command =
		process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open'
	const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url]
	const child = spawn(command, args, { detached: true, stdio: 'ignore' })
	child.on('error', () => {})
	child.unref()
}

const waitForShutdownSignal = () =>
	new Promise<void>((resolve) => {
		const done = () => {
			process.off('SIGINT', done)
			process.off('SIGTERM', done)
			resolve()
		}
		process.once('SIGINT', done)
		process.once('SIGTERM', done)
	})

export const runComponentShotGalleryCli = async ({
	argv = process.argv.slice(2),
	options: baseOptions = {},
	usageCommand = 'component-shot gallery [options]',
}: {
	argv?: string[]
	options?: ComponentShotGalleryOptions
	usageCommand?: string
} = {}) => {
	if (argv[0] === 'export') {
		const exportOptions: ComponentShotGalleryExportOptions = {
			browserChannel: baseOptions.browserChannel,
			build: baseOptions.build,
			cwd: baseOptions.cwd,
			defaults: baseOptions.defaults,
			protocol: baseOptions.protocol,
			rspack: baseOptions.rspack,
			scenarioDir: baseOptions.scenarioDir,
			screenshotsDir: baseOptions.screenshotsDir,
			setup: baseOptions.setup,
		}
		return runComponentShotGalleryExportCli({
			argv: argv.slice(1),
			options: exportOptions,
		})
	}
	const parsed = parseGalleryCliArgs({ argv, usageCommand })
	if (parsed.help) {
		process.stdout.write(`${createGalleryUsage(usageCommand)}\n`)
		return
	}
	const { help: _help, json, ...cliOptions } = parsed
	const requestedOptions = { ...baseOptions, ...cliOptions }
	const workspace = await resolveComponentShotCliWorkspace(requestedOptions)
	const gallery = await startComponentShotGallery({
		...requestedOptions,
		cwd: workspace.cwd,
		scenarioDir: workspace.scenarioDir,
	})
	const startupDetails = {
		autoDiscovered: workspace.autoDiscovered,
		projectRoot: gallery.index.cwd,
		scenarioCount: gallery.index.scenarios.length,
		scenarioDir: gallery.index.scenarioDir,
		url: gallery.url,
	}
	if (json) {
		process.stdout.write(`${JSON.stringify(startupDetails)}\n`)
	} else {
		process.stdout.write(`Component Shot gallery: ${gallery.url}\n`)
		if (workspace.autoDiscovered) {
			process.stdout.write(`Project: ${gallery.index.cwd}\n`)
		}
		process.stdout.write('Press Ctrl+C to stop.\n')
	}
	if (baseOptions.open ?? cliOptions.open ?? true) openUrl(gallery.url)
	await waitForShutdownSignal()
	await gallery.close()
}

export {
	exportComponentShotGallery,
	runComponentShotGalleryExportCli,
} from './gallery-export.js'
export type {
	ComponentShotGalleryExportFailure,
	ComponentShotGalleryExportOptions,
	ComponentShotGalleryExportResult,
	ComponentShotGalleryExportWarning,
} from './gallery-export.js'
