import { randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright'
import { publishCapture } from './artifacts.js'
import { resolveComponentShotBrowserLaunchOptions } from './browser.js'
import {
	componentShotDefaultProtocol,
	type ComponentShotBuild,
	type ComponentShotRenderProtocol,
} from './build-types.js'
import { runBuild } from './process.js'
import { createRspackBuild, type ComponentShotRspackOptions } from './rspack.js'
import type {
	ComponentShotCaptureSettings,
	ComponentShotEnvironment,
	ComponentShotViewport,
} from './runtime/types.js'
import {
	assertPathWithin,
	getScenarioInfo,
	isPathWithin,
	isScenarioFile,
	pathExists,
	resolveSetupPath,
	resolveSourceScenarioPath,
	resolveWorkspacePaths,
	type ComponentShotScenarioInfo,
	type ComponentShotWorkspacePaths,
} from './scenarios.js'

export type ComponentShotDiagnosticStage =
	| 'artifact'
	| 'build'
	| 'capture'
	| 'discover'
	| 'render'
	| 'serve'

export type ComponentShotDiagnostic = {
	details?: string
	message: string
	severity: 'error' | 'info' | 'warning'
	stage: ComponentShotDiagnosticStage
}

export type ComponentShotScenarioMetadata = {
	capture?: ComponentShotCaptureSettings
	description?: string
	environment?: ComponentShotEnvironment
	tags?: string[]
	title?: string
	viewport?: ComponentShotViewport
}

export type ComponentShotSessionOptions = {
	allowExternalOutput?: boolean
	browserChannel?: string
	build?: ComponentShotBuild
	cwd?: string
	debug?: boolean
	defaults?: {
		animations?: 'allow' | 'disabled'
		environment?: ComponentShotEnvironment
		fullPage?: boolean
		selector?: string
		timeoutMs?: number
		viewport?: ComponentShotViewport
	}
	keepTemp?: boolean
	protocol?: Partial<ComponentShotRenderProtocol>
	rspack?: ComponentShotRspackOptions | false
	scenarioDir?: string
	screenshotsDir?: string
	setup?: string
	tempDirPrefix?: string
}

export type ComponentShotCaptureArea =
	| { selector: string; type: 'element' }
	| { type: 'page' }
	| { type: 'viewport' }

export type ComponentShotCaptureRequest = {
	area?: ComponentShotCaptureArea
	animations?: 'allow' | 'disabled'
	debug?: boolean
	environment?: ComponentShotEnvironment
	fullPage?: boolean
	output?: string
	save?: boolean
	saveName?: string
	scenario: string
	selector?: string
	timeoutMs?: number
	viewport?: ComponentShotViewport
	waitFor?: string
}

export type ComponentShotSourceRequest = Omit<ComponentShotCaptureRequest, 'scenario'> & {
	name?: string
	overwrite?: boolean
	scenario?: string
	source: string
}

export type ComponentShotCaptureResult = {
	diagnostics: ComponentShotDiagnostic[]
	durationMs: number
	historyPath?: string
	latestPath?: string
	metadata: ComponentShotScenarioMetadata
	outputPath: string
	scenarioId: string
	scenarioPath: string
	tempDir?: string
	viewport: ComponentShotViewport
}

export type ComponentShotSourceResult = ComponentShotCaptureResult & {
	scenarioPath: string
}

export type ComponentShotPreview = {
	scenario: ComponentShotScenarioInfo
	url: string
}

export type ComponentShotSession = {
	capture: (request: ComponentShotCaptureRequest) => Promise<ComponentShotCaptureResult>
	captureSource: (request: ComponentShotSourceRequest) => Promise<ComponentShotSourceResult>
	close: () => Promise<void>
	getPreview: (scenario: string, timeoutMs?: number) => Promise<ComponentShotPreview>
	invalidate: (paths?: string[]) => Promise<void>
	previewSource: (request: ComponentShotSourceRequest) => Promise<ComponentShotSourceResult>
	readonly paths: ComponentShotWorkspacePaths
	readonly tempDir: string
}

type PreparedScenario = {
	publicDir: string
	scenario: ComponentShotScenarioInfo
	urlPath: string
}

type ResolvedProfile = {
	area?: ComponentShotCaptureArea
	animations: 'allow' | 'disabled'
	environment: Required<ComponentShotEnvironment>
	fullPage: boolean
	selector: string
	timeoutMs: number
	viewport: ComponentShotViewport
}

type RenderedPage = {
	addDiagnostic: (diagnostic: ComponentShotDiagnostic) => void
	blockedOrigins: Set<string>
	context: BrowserContext
	diagnostics: ComponentShotDiagnostic[]
	metadata: ComponentShotScenarioMetadata
	page: Page
	pageErrors: string[]
}

export class ComponentShotError extends Error {
	readonly stage: ComponentShotDiagnosticStage

	constructor(stage: ComponentShotDiagnosticStage, message: string, options?: ErrorOptions) {
		super(message, options)
		this.name = 'ComponentShotError'
		this.stage = stage
	}
}

export const componentShotViewportLimits = {
	height: { max: 2160, min: 240 },
	width: { max: 3840, min: 240 },
} as const

export const componentShotDefaultProfile = {
	animations: 'disabled',
	environment: {
		colorScheme: 'light',
		deviceScaleFactor: 1,
		locale: 'en-US',
		network: 'block-external',
		reducedMotion: 'reduce',
		timezoneId: 'UTC',
	},
	fullPage: false,
	selector: '[data-component-shot-root]',
	timeoutMs: 15_000,
	viewport: { height: 900, width: 1440 },
} as const

const defaultProfile: ResolvedProfile = componentShotDefaultProfile

const contentTypes: Record<string, string> = {
	'.css': 'text/css; charset=utf-8',
	'.gif': 'image/gif',
	'.html': 'text/html; charset=utf-8',
	'.jpeg': 'image/jpeg',
	'.jpg': 'image/jpeg',
	'.js': 'text/javascript; charset=utf-8',
	'.json': 'application/json; charset=utf-8',
	'.map': 'application/json; charset=utf-8',
	'.mjs': 'text/javascript; charset=utf-8',
	'.otf': 'font/otf',
	'.png': 'image/png',
	'.svg': 'image/svg+xml',
	'.ttf': 'font/ttf',
	'.webp': 'image/webp',
	'.woff': 'font/woff',
	'.woff2': 'font/woff2',
}

class Deadline {
	readonly endsAt: number

	constructor(timeoutMs: number) {
		if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
			throw new ComponentShotError('discover', 'timeoutMs must be a positive number')
		}
		this.endsAt = Date.now() + timeoutMs
	}

	remaining(stage: ComponentShotDiagnosticStage) {
		const remaining = this.endsAt - Date.now()
		if (remaining <= 0) {
			throw new ComponentShotError(stage, 'Component Shot operation timed out')
		}
		return remaining
	}
}

const normalizeViewport = (viewport: ComponentShotViewport) => {
	if (
		!Number.isFinite(viewport.width) ||
		!Number.isFinite(viewport.height) ||
		viewport.width < componentShotViewportLimits.width.min ||
		viewport.height < componentShotViewportLimits.height.min ||
		viewport.width > componentShotViewportLimits.width.max ||
		viewport.height > componentShotViewportLimits.height.max
	) {
		throw new ComponentShotError(
			'discover',
			`viewport width must be ${componentShotViewportLimits.width.min}-${componentShotViewportLimits.width.max} and height must be ${componentShotViewportLimits.height.min}-${componentShotViewportLimits.height.max}`,
		)
	}
	return { height: Math.round(viewport.height), width: Math.round(viewport.width) }
}

const resolveProfile = ({
	defaults,
	request,
}: {
	defaults?: ComponentShotSessionOptions['defaults']
	request: ComponentShotCaptureRequest
}): ResolvedProfile => ({
	area: request.area,
	animations: request.animations ?? defaults?.animations ?? defaultProfile.animations,
	environment: {
		...defaultProfile.environment,
		...defaults?.environment,
		...request.environment,
	},
	fullPage: request.fullPage ?? defaults?.fullPage ?? defaultProfile.fullPage,
	selector: request.selector ?? defaults?.selector ?? defaultProfile.selector,
	timeoutMs: request.timeoutMs ?? defaults?.timeoutMs ?? defaultProfile.timeoutMs,
	viewport: normalizeViewport(request.viewport ?? defaults?.viewport ?? defaultProfile.viewport),
})

const metadataFromValue = (value: unknown): ComponentShotScenarioMetadata => {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return {}
	}
	const candidate = value as Record<string, unknown>
	const viewport = candidate.viewport
	const parsedViewport =
		viewport && typeof viewport === 'object' && !Array.isArray(viewport)
			? {
				height: Number((viewport as Record<string, unknown>).height),
				width: Number((viewport as Record<string, unknown>).width),
			}
			: undefined
	return {
		capture:
			candidate.capture && typeof candidate.capture === 'object' && !Array.isArray(candidate.capture)
				? (candidate.capture as ComponentShotCaptureSettings)
				: undefined,
		description: typeof candidate.description === 'string' ? candidate.description : undefined,
		environment:
			candidate.environment && typeof candidate.environment === 'object' && !Array.isArray(candidate.environment)
				? (candidate.environment as ComponentShotEnvironment)
				: undefined,
		tags: Array.isArray(candidate.tags)
			? candidate.tags.filter((entry): entry is string => typeof entry === 'string')
			: undefined,
		title: typeof candidate.title === 'string' ? candidate.title : undefined,
		viewport:
			parsedViewport &&
			Number.isFinite(parsedViewport.width) &&
			Number.isFinite(parsedViewport.height) &&
			parsedViewport.width > 0 &&
			parsedViewport.height > 0
				? normalizeViewport(parsedViewport)
				: undefined,
	}
}

const profilesMatch = (left: ResolvedProfile, right: ResolvedProfile) =>
	JSON.stringify({ environment: left.environment, viewport: left.viewport }) ===
	JSON.stringify({ environment: right.environment, viewport: right.viewport })

const applyMetadataToProfile = ({
	metadata,
	profile,
	request,
}: {
	metadata: ComponentShotScenarioMetadata
	profile: ResolvedProfile
	request: ComponentShotCaptureRequest
}): ResolvedProfile => ({
	...profile,
	area: request.area ?? profile.area,
	animations: request.animations ?? metadata.capture?.animations ?? profile.animations,
	environment: { ...profile.environment, ...metadata.environment, ...request.environment },
	fullPage: request.fullPage ?? metadata.capture?.fullPage ?? profile.fullPage,
	selector: request.selector ?? metadata.capture?.selector ?? profile.selector,
	viewport: request.viewport ? profile.viewport : (metadata.viewport ?? profile.viewport),
})

const sendFile = async (filePath: string, response: http.ServerResponse) => {
	try {
		const content = await fs.readFile(filePath)
		response.statusCode = 200
		response.setHeader('Cache-Control', 'no-store')
		response.setHeader(
			'Content-Type',
			contentTypes[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream',
		)
		response.end(content)
	} catch (error) {
		const code = typeof error === 'object' && error && 'code' in error ? error.code : undefined
		if (code === 'ENOENT' || code === 'EISDIR') {
			response.statusCode = 404
			response.end('Not found')
			return
		}
		throw error
	}
}

const startAssetServer = async (getPrepared: (routeId: string) => PreparedScenario | undefined) => {
	const server = http.createServer((request, response) => {
		void (async () => {
			const url = new URL(request.url ?? '/', 'http://127.0.0.1')
			const match = url.pathname.match(/^\/render\/([^/]+)\/?(.*)$/)
			if (!match) {
				response.statusCode = 404
				response.end('Not found')
				return
			}

			const prepared = getPrepared(match[1] ?? '')
			if (!prepared) {
				response.statusCode = 404
				response.end('Scenario is not prepared')
				return
			}
			const relativePath = decodeURIComponent(match[2] || 'index.html')
			const filePath = path.resolve(prepared.publicDir, relativePath)
			const publicRoot = path.resolve(prepared.publicDir)
			if (!isPathWithin({ candidate: filePath, root: publicRoot })) {
				response.statusCode = 403
				response.end('Forbidden')
				return
			}
			await sendFile(filePath, response)
		})().catch((error: unknown) => {
			response.statusCode = 500
			response.end(error instanceof Error ? error.message : String(error))
		})
	})

	await new Promise<void>((resolve, reject) => {
		const onError = (error: Error) => {
			server.off('listening', onListening)
			reject(error)
		}
		const onListening = () => {
			server.off('error', onError)
			resolve()
		}
		server.once('error', onError)
		server.once('listening', onListening)
		server.listen(0, '127.0.0.1')
	})

	const address = server.address()
	if (!address || typeof address === 'string') {
		server.close()
		throw new ComponentShotError('serve', 'Unable to read Component Shot server address')
	}
	return { server, url: `http://127.0.0.1:${address.port}` }
}

const closeServer = (server: http.Server) =>
	new Promise<void>((resolve, reject) => {
		server.close((error) => (error ? reject(error) : resolve()))
		server.closeAllConnections?.()
	})

const withTimeout = async <T>({
	deadline,
	onTimeout,
	promise,
	stage,
}: {
	deadline: Deadline
	onTimeout?: () => void
	promise: Promise<T>
	stage: ComponentShotDiagnosticStage
}) => {
	const timeoutMs = deadline.remaining(stage)
	let timer: NodeJS.Timeout | undefined
	try {
		return await Promise.race([
			promise,
			new Promise<never>((_, reject) => {
				timer = setTimeout(() => {
					onTimeout?.()
					reject(new ComponentShotError(stage, `${stage} timed out after ${timeoutMs}ms`))
				}, timeoutMs)
			}),
		])
	} finally {
		if (timer) {
			clearTimeout(timer)
		}
	}
}

export const createComponentShotSession = async (
	options: ComponentShotSessionOptions = {},
): Promise<ComponentShotSession> => {
	const paths = resolveWorkspacePaths(options)
	const protocol: ComponentShotRenderProtocol = {
		continueGlobal: options.protocol?.continueGlobal ?? componentShotDefaultProtocol.continueGlobal,
		errorGlobal: options.protocol?.errorGlobal ?? componentShotDefaultProtocol.errorGlobal,
		metadataGlobal: options.protocol?.metadataGlobal ?? componentShotDefaultProtocol.metadataGlobal,
		readyGlobal: options.protocol?.readyGlobal ?? componentShotDefaultProtocol.readyGlobal,
	}
	const tempDirPrefix = path.basename(options.tempDirPrefix ?? 'component-shot-session-')
	const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), tempDirPrefix))
	const preparedByRoute = new Map<string, PreparedScenario>()
	const buildCache = new Map<string, Promise<PreparedScenario>>()
	const metadataByScenario = new Map<string, ComponentShotScenarioMetadata>()
	let browser: Browser | undefined
	let browserPromise: Promise<Browser> | undefined
	let closed = false
	const assetServer = await startAssetServer((routeId) => preparedByRoute.get(routeId))

	const assertOpen = () => {
		if (closed) {
			throw new ComponentShotError('serve', 'Component Shot session is already closed')
		}
	}

	const resolveScenario = async (scenarioInput: string) => {
		const scenarioPath = await assertPathWithin({
			candidate: path.resolve(paths.cwd, scenarioInput),
			label: 'Scenario path',
			root: paths.cwd,
		})
		if (!(await pathExists(scenarioPath))) {
			throw new ComponentShotError('discover', `Scenario not found: ${scenarioPath}`)
		}
		return getScenarioInfo({ ...paths, scenarioPath })
	}

	const prepareScenario = async (scenarioInput: string, deadline: Deadline): Promise<PreparedScenario> => {
		assertOpen()
		const scenario = await resolveScenario(scenarioInput)
		const cached = buildCache.get(scenario.id)
		if (cached) {
			return cached
		}

		let promise: Promise<PreparedScenario>
		promise = (async () => {
			const publicDir = path.join(tempDir, 'renders', scenario.routeId, randomUUID(), 'public')
			await fs.mkdir(publicDir, { recursive: true })
			const setupPath = await resolveSetupPath({
				cwd: paths.cwd,
				scenarioDir: paths.scenarioDir,
				scenarioPath: scenario.scenarioPath,
				setup: options.setup,
			})
			if (setupPath) {
				await assertPathWithin({ candidate: setupPath, label: 'Setup path', root: paths.cwd })
			}
			if (!options.build && options.rspack === false) {
				throw new ComponentShotError('build', 'A renderer build is required when rspack is false')
			}
			const rspackOptions = typeof options.rspack === 'object' ? options.rspack : {}
			const build = options.build ?? createRspackBuild(rspackOptions)
			const publicPath = `/render/${scenario.routeId}/`
			try {
				await runBuild({
					build,
					context: {
						cwd: paths.cwd,
						debug: options.debug ?? false,
						protocol,
						publicDir,
						publicPath,
						scenarioPath: scenario.scenarioPath,
						setupPath,
					},
					timeoutMs: deadline.remaining('build'),
				})
			} catch (error) {
				throw new ComponentShotError(
					'build',
					error instanceof Error ? error.message : String(error),
					{ cause: error },
				)
			}

			return { publicDir, scenario, urlPath: publicPath }
		})().then((prepared) => {
			if (buildCache.get(scenario.id) === promise) {
				preparedByRoute.set(scenario.routeId, prepared)
			}
			return prepared
		}).catch((error: unknown) => {
			if (buildCache.get(scenario.id) === promise) buildCache.delete(scenario.id)
			throw error
		})
		buildCache.set(scenario.id, promise)
		return promise
	}

	const ensureBrowser = async (deadline: Deadline) => {
		assertOpen()
		if (browser) {
			return browser
		}
		if (!browserPromise) {
			browserPromise = (async () => {
				const launchOptions = await resolveComponentShotBrowserLaunchOptions(options.browserChannel)
				const launched = await chromium.launch({ ...launchOptions, headless: true })
				if (closed) {
					await launched.close()
					throw new ComponentShotError('capture', 'Component Shot session closed during browser launch')
				}
				browser = launched
				return launched
			})().finally(() => {
				browserPromise = undefined
			})
		}
		return withTimeout({
			deadline,
			promise: browserPromise,
			stage: 'capture',
		})
	}

	const completeRenderedPage = async ({
		deadline,
		rendered,
		waitFor,
	}: {
		deadline: Deadline
		rendered: RenderedPage
		waitFor?: string
	}) => {
		try {
			await rendered.page.evaluate(
				(continueGlobal) => {
					;(globalThis as Record<string, unknown>)[continueGlobal] = true
				},
				protocol.continueGlobal,
			)
			await rendered.page.waitForFunction(
				({ errorGlobal, readyGlobal }) =>
					(globalThis as Record<string, unknown>)[readyGlobal] === true ||
					Boolean((globalThis as Record<string, unknown>)[errorGlobal]),
				protocol,
				{ timeout: deadline.remaining('render') },
			)
			const renderError = await rendered.page.evaluate(
				(errorGlobal) => (globalThis as Record<string, unknown>)[errorGlobal],
				protocol.errorGlobal,
			)
			if (renderError) throw new ComponentShotError('render', String(renderError))
			if (waitFor) {
				await rendered.page
					.locator(waitFor)
					.waitFor({ state: 'visible', timeout: deadline.remaining('render') })
			}
			await rendered.page.waitForFunction(
				() => !document.fonts || document.fonts.status === 'loaded',
				undefined,
				{ timeout: deadline.remaining('render') },
			)
			if (rendered.pageErrors.length > 0) {
				throw new ComponentShotError('render', rendered.pageErrors.join('\n\n'))
			}
			for (const origin of [...rendered.blockedOrigins].slice(0, 50)) {
				rendered.addDiagnostic({
					message: `Blocked external request to ${origin}`,
					severity: 'warning',
					stage: 'render',
				})
			}
			return rendered
		} catch (error) {
			await rendered.context.close().catch(() => {})
			if (error instanceof ComponentShotError) throw error
			throw new ComponentShotError('render', error instanceof Error ? error.message : String(error), {
				cause: error,
			})
		}
	}

	const renderPage = async ({
		deadline,
		deferRender = false,
		preview,
		profile,
		waitFor,
	}: {
		deadline: Deadline
		deferRender?: boolean
		preview: ComponentShotPreview
		profile: ResolvedProfile
		waitFor?: string
	}): Promise<RenderedPage> => {
		const activeBrowser = await ensureBrowser(deadline)
		const diagnostics: ComponentShotDiagnostic[] = []
		const blockedOrigins = new Set<string>()
		const addDiagnostic = (diagnostic: ComponentShotDiagnostic) => {
			if (diagnostics.length < 100) diagnostics.push(diagnostic)
		}
		const contextPromise = activeBrowser.newContext({
			colorScheme: profile.environment.colorScheme,
			deviceScaleFactor: profile.environment.deviceScaleFactor,
			locale: profile.environment.locale,
			reducedMotion: profile.environment.reducedMotion,
			serviceWorkers: 'block',
			timezoneId: profile.environment.timezoneId,
			viewport: profile.viewport,
		})
		const context = await withTimeout({
			deadline,
			onTimeout: () => void contextPromise.then((lateContext) => lateContext.close()).catch(() => {}),
			promise: contextPromise,
			stage: 'render',
		})
		try {
			const allowedOrigin = new URL(preview.url).origin
			if (profile.environment.network === 'block-external') {
				await context.route('**/*', async (route) => {
					const parsed = new URL(route.request().url())
					if (
						parsed.origin === allowedOrigin ||
						parsed.protocol === 'data:' ||
						parsed.protocol === 'blob:' ||
						parsed.protocol === 'about:'
					) {
						await route.continue()
						return
					}
					if (blockedOrigins.size < 50) blockedOrigins.add(parsed.origin)
					await route.abort('blockedbyclient')
				})
			}

			const page = await context.newPage()
			page.setDefaultTimeout(deadline.remaining('render'))
			page.setDefaultNavigationTimeout(deadline.remaining('render'))
			const pageErrors: string[] = []
			page.on('pageerror', (error) => {
				if (pageErrors.length < 20) pageErrors.push(error.stack ?? error.message)
			})
			page.on('console', (message) => {
				if (message.type() === 'warning' || message.type() === 'error') {
					addDiagnostic({
						message: message.text(),
						severity: message.type() === 'error' ? 'error' : 'warning',
						stage: 'render',
					})
				}
				if (options.debug) {
					process.stderr.write(`[component-shot:${message.type()}] ${message.text()}\n`)
				}
			})

			const captureUrl = new URL(preview.url)
			captureUrl.searchParams.set('component-shot-capture', '1')
			await page.goto(captureUrl.href, {
				timeout: deadline.remaining('render'),
				waitUntil: 'domcontentloaded',
			})
			await page.waitForFunction(
				({ errorGlobal, metadataGlobal }) =>
					Object.prototype.hasOwnProperty.call(globalThis, metadataGlobal) ||
					Boolean((globalThis as Record<string, unknown>)[errorGlobal]),
				protocol,
				{ timeout: deadline.remaining('render') },
			)
			const renderError = await page.evaluate(
				(errorGlobal) => (globalThis as Record<string, unknown>)[errorGlobal],
				protocol.errorGlobal,
			)
			if (renderError) throw new ComponentShotError('render', String(renderError))
			const metadata = metadataFromValue(
				await page.evaluate(
					(metadataGlobal) => (globalThis as Record<string, unknown>)[metadataGlobal],
					protocol.metadataGlobal,
				),
			)
			const rendered = {
				addDiagnostic,
				blockedOrigins,
				context,
				diagnostics,
				metadata,
				page,
				pageErrors,
			}
			return deferRender
				? rendered
				: completeRenderedPage({ deadline, rendered, waitFor })
		} catch (error) {
			await context.close().catch(() => {})
			if (error instanceof ComponentShotError) throw error
			throw new ComponentShotError('render', error instanceof Error ? error.message : String(error), {
				cause: error,
			})
		}
	}

	const getPreview = async (scenarioInput: string, timeoutMs = defaultProfile.timeoutMs) => {
		const deadline = new Deadline(timeoutMs)
		const prepared = await prepareScenario(scenarioInput, deadline)
		return {
			scenario: prepared.scenario,
			url: `${assetServer.url}${prepared.urlPath}`,
		}
	}

	const capture = async (request: ComponentShotCaptureRequest): Promise<ComponentShotCaptureResult> => {
		const startedAt = Date.now()
		const requestProfile = resolveProfile({ defaults: options.defaults, request })
		const deadline = new Deadline(requestProfile.timeoutMs)
		const preview = await getPreview(request.scenario, deadline.remaining('build'))
		const cachedMetadata = metadataByScenario.get(preview.scenario.id)
		const initialProfile = applyMetadataToProfile({
			metadata: cachedMetadata ?? {},
			profile: requestProfile,
			request,
		})
		let rendered = await renderPage({
			deadline,
			deferRender: !cachedMetadata,
			preview,
			profile: initialProfile,
			waitFor: request.waitFor,
		})
		metadataByScenario.set(preview.scenario.id, rendered.metadata)
		let effectiveProfile = applyMetadataToProfile({
			metadata: rendered.metadata,
			profile: initialProfile,
			request,
		})
		if (!profilesMatch(initialProfile, effectiveProfile)) {
			await rendered.context.close()
			rendered = await renderPage({ deadline, preview, profile: effectiveProfile, waitFor: request.waitFor })
			metadataByScenario.set(preview.scenario.id, rendered.metadata)
			effectiveProfile = applyMetadataToProfile({
				metadata: rendered.metadata,
				profile: effectiveProfile,
				request,
			})
		} else if (!cachedMetadata) {
			rendered = await completeRenderedPage({ deadline, rendered, waitFor: request.waitFor })
		}

		const captureDir = path.join(tempDir, 'captures')
		await fs.mkdir(captureDir, { recursive: true })
		const stagingPath = path.join(captureDir, `${randomUUID()}.png`)
		try {
			if (effectiveProfile.area?.type === 'page' || (!effectiveProfile.area && effectiveProfile.fullPage)) {
				await rendered.page.screenshot({
					animations: effectiveProfile.animations,
					fullPage: true,
					path: stagingPath,
					timeout: deadline.remaining('capture'),
				})
			} else if (effectiveProfile.area?.type === 'viewport') {
				await rendered.page.screenshot({
					animations: effectiveProfile.animations,
					fullPage: false,
					path: stagingPath,
					timeout: deadline.remaining('capture'),
				})
			} else {
				const selector =
					effectiveProfile.area?.type === 'element'
						? effectiveProfile.area.selector
						: effectiveProfile.selector
				const target = rendered.page.locator(selector).first()
				await target.waitFor({ state: 'visible', timeout: deadline.remaining('capture') })
				await target.screenshot({
					animations: effectiveProfile.animations,
					path: stagingPath,
					timeout: deadline.remaining('capture'),
				})
			}

			const explicitOutput = request.output ? path.resolve(paths.cwd, request.output) : undefined
			if (explicitOutput && options.allowExternalOutput === false) {
				await assertPathWithin({ candidate: explicitOutput, label: 'Output path', root: paths.cwd })
			}
			const previewOutput = path.join(
				tempDir,
				'outputs',
				...preview.scenario.artifactKey.split('/'),
				`${Date.now()}-${randomUUID().slice(0, 8)}.png`,
			)
			const artifactPaths = await publishCapture({
				explicitOutput,
				previewOutput,
				save: request.save ?? false,
				saveName: request.saveName,
				scenario: preview.scenario,
				screenshotsDir: paths.screenshotsDir,
				stagingPath,
			})
			return {
				...artifactPaths,
				diagnostics: rendered.diagnostics,
				durationMs: Date.now() - startedAt,
				metadata: rendered.metadata,
				scenarioId: preview.scenario.id,
				scenarioPath: preview.scenario.scenarioPath,
				tempDir: options.keepTemp ? tempDir : undefined,
				viewport: effectiveProfile.viewport,
			}
		} catch (error) {
			if (error instanceof ComponentShotError) {
				throw error
			}
			throw new ComponentShotError('capture', error instanceof Error ? error.message : String(error), {
				cause: error,
			})
		} finally {
			await Promise.allSettled([rendered.context.close(), fs.rm(stagingPath, { force: true })])
		}
	}

	const writeSource = async (request: ComponentShotSourceRequest, previewOnly: boolean) => {
		const scenarioPath = previewOnly
			? await assertPathWithin({
					candidate: path.join(
						paths.scenarioDir,
						`.component-shot-preview-${request.name ?? 'source'}-${randomUUID()}.tsx`,
					),
					label: 'Preview source path',
					root: paths.scenarioDir,
				})
			: await resolveSourceScenarioPath({
					cwd: paths.cwd,
					name: request.name,
					scenario: request.scenario,
					scenarioDir: paths.scenarioDir,
				})
		await fs.mkdir(path.dirname(scenarioPath), { recursive: true })
		try {
			await fs.writeFile(scenarioPath, request.source.endsWith('\n') ? request.source : `${request.source}\n`, {
				encoding: 'utf8',
				flag: previewOnly || request.overwrite ? 'w' : 'wx',
			})
		} catch (error) {
			const code = typeof error === 'object' && error && 'code' in error ? error.code : undefined
			if (code === 'EEXIST') {
				throw new ComponentShotError(
					'artifact',
					`${scenarioPath} already exists. Edit the existing scenario or use overwrite only when replacement is intentional.`,
				)
			}
			throw error
		}

		try {
			await invalidate([scenarioPath])
			const result = await capture({
				...request,
				save: previewOnly ? false : request.save,
				scenario: path.relative(paths.cwd, scenarioPath),
			})
			return { ...result, scenarioPath }
		} finally {
			if (previewOnly) {
				await fs.rm(scenarioPath, { force: true })
			}
		}
	}

	const invalidate = async (changedPaths: string[] = []) => {
		assertOpen()
		const scenarioIds =
			changedPaths.length > 0 &&
			changedPaths.every((changedPath) => {
				const absolutePath = path.resolve(paths.cwd, changedPath)
				return isPathWithin({ candidate: absolutePath, root: paths.scenarioDir }) && isScenarioFile(absolutePath)
			})
				? changedPaths.map((changedPath) =>
						getScenarioInfo({
							...paths,
							scenarioPath: path.resolve(paths.cwd, changedPath),
						}).id,
					)
				: [...buildCache.keys()]
		const activeBuilds = scenarioIds
			.map((scenarioId) => {
				metadataByScenario.delete(scenarioId)
				const activeBuild = buildCache.get(scenarioId)
				buildCache.delete(scenarioId)
				return activeBuild
			})
			.filter((activeBuild): activeBuild is Promise<PreparedScenario> => Boolean(activeBuild))
		const prepared = await Promise.allSettled(activeBuilds)
		await Promise.all(
			prepared.map(async (result) => {
				if (result.status !== 'fulfilled') return
				if (preparedByRoute.get(result.value.scenario.routeId) === result.value) {
					preparedByRoute.delete(result.value.scenario.routeId)
				}
				await fs.rm(path.dirname(result.value.publicDir), { force: true, recursive: true })
			}),
		)
	}

	const close = async () => {
		if (closed) {
			return
		}
		closed = true
		const closeBrowser = async () => {
			await browserPromise?.catch(() => {})
			await browser?.close()
		}
		const results = await Promise.allSettled([
			closeBrowser(),
			closeServer(assetServer.server),
			options.keepTemp ? Promise.resolve() : fs.rm(tempDir, { force: true, recursive: true }),
		])
		const failures = results.filter((result): result is PromiseRejectedResult => result.status === 'rejected')
		if (failures.length > 0) {
			throw new AggregateError(
				failures.map((failure) => failure.reason),
				'Component Shot session cleanup failed',
			)
		}
	}

	return {
		capture,
		captureSource: (request) => writeSource(request, false),
		close,
		getPreview,
		invalidate,
		paths,
		previewSource: (request) => writeSource(request, true),
		tempDir,
	}
}
