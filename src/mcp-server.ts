import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { watch, type FSWatcher } from 'node:fs'
import fs from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { z } from 'zod'
import type { ComponentShotBuild, ComponentShotRenderProtocol } from './build-types.js'
import type { ComponentShotRspackOptions } from './rspack.js'
import { isPathWithin } from './scenarios.js'
import {
	ComponentShotError,
	componentShotViewportLimits,
	type ComponentShotCaptureResult,
	type ComponentShotSessionOptions,
} from './session.js'
import { createComponentShotWorkspace } from './workspace.js'

const require = createRequire(import.meta.url)
const packageJson = require('../package.json') as { version?: string }

export type ComponentShotMcpServerOptions = {
	browserChannel?: string
	build?: ComponentShotBuild
	defaults?: ComponentShotSessionOptions['defaults']
	projectRoot?: string
	protocol?: Partial<ComponentShotRenderProtocol>
	rspack?: ComponentShotRspackOptions | false
	scenarioDir?: string
	screenshotsDir?: string
	setup?: string
}

const viewportSchema = z
	.object({
		height: z
			.number()
			.int()
			.min(componentShotViewportLimits.height.min)
			.max(componentShotViewportLimits.height.max)
			.describe('Browser viewport height in CSS pixels.'),
		width: z
			.number()
			.int()
			.min(componentShotViewportLimits.width.min)
			.max(componentShotViewportLimits.width.max)
			.describe('Browser viewport width in CSS pixels.'),
	})
	.strict()
	.describe('Override the scenario or server viewport for this capture.')

const environmentSchema = z
	.object({
		colorScheme: z.enum(['light', 'dark']).optional().describe('Emulated browser color scheme.'),
		deviceScaleFactor: z
			.number()
			.positive()
			.max(4)
			.optional()
			.describe('Device pixel ratio used for the screenshot.'),
		locale: z.string().min(2).optional().describe('Browser locale, for example en-US.'),
		network: z
			.enum(['allow', 'block-external'])
			.optional()
			.describe('Whether the capture may request external network resources.'),
		reducedMotion: z
			.enum(['no-preference', 'reduce'])
			.optional()
			.describe('Emulated reduced-motion preference.'),
		timezoneId: z.string().min(1).optional().describe('IANA browser timezone, for example UTC.'),
	})
	.strict()
	.describe('Deterministic browser-environment overrides for this capture.')

const targetSchema = z.discriminatedUnion('type', [
	z
		.object({
			path: z
				.string()
				.min(1)
				.describe('Scenario file path relative to the configured project root.'),
			type: z.literal('scenario'),
		})
		.strict()
		.describe('Render a scenario file that already exists in the workspace.'),
	z
		.object({
			code: z
				.string()
				.min(1)
				.describe('Complete TSX scenario module source, including its default export.'),
			persistAs: z
				.string()
				.min(1)
				.optional()
				.describe(
					'Optional scenario path under the configured scenario root. Omit it for a temporary source preview. Existing files are never overwritten.',
				),
			type: z.literal('source'),
		})
		.strict()
		.describe('Render complete TSX source immediately, optionally retaining it as a scenario.'),
])

const areaSchema = z
	.discriminatedUnion('type', [
		z
			.object({ type: z.literal('viewport') })
			.strict()
			.describe('Capture the visible browser viewport.'),
		z.object({ type: z.literal('page') }).strict().describe('Capture the full scrollable page.'),
		z
			.object({
				selector: z
					.string()
					.min(1)
					.describe('CSS selector for the element to wait for and crop to.'),
				type: z.literal('element'),
			})
			.strict()
			.describe('Capture the first visible element matching a CSS selector.'),
	])
	.describe('Region to capture. Defaults to the visible viewport.')

const saveScreenshotSchema = z
	.discriminatedUnion('type', [
		z
			.object({ type: z.literal('history') })
			.strict()
			.describe(
				'Publish latest.png and a timestamped gallery-history image. Requires an existing scenario or source with persistAs.',
			),
		z
			.object({
				path: z
					.string()
					.min(1)
					.refine((value) => value.toLowerCase().endsWith('.png'), 'path must end in .png')
					.describe('Stable PNG path inside the configured project root.'),
				type: z.literal('file'),
			})
			.strict()
			.describe('Write the screenshot to an explicit project-relative PNG path.'),
	])
	.describe('Optional screenshot persistence. Omit it to return an ephemeral image only.')

const captureFields = {
	animations: z
		.enum(['allow', 'disabled'])
		.optional()
		.describe('Allow or disable CSS and Web Animations during the screenshot.'),
	area: areaSchema.optional(),
	environment: environmentSchema.optional(),
	saveScreenshot: saveScreenshotSchema.optional(),
	target: targetSchema,
	timeoutMs: z
		.number()
		.int()
		.positive()
		.max(120_000)
		.optional()
		.describe('Maximum build, render, wait, and capture time in milliseconds.'),
	viewport: viewportSchema.optional(),
	waitFor: z
		.string()
		.min(1)
		.optional()
		.describe('Additional CSS selector that must become visible before capture.'),
}

const captureInputSchema = z
	.object(captureFields)
	.strict()
	.superRefine((input, context) => {
		if (
			input.saveScreenshot?.type === 'history' &&
			input.target.type === 'source' &&
			!input.target.persistAs
		) {
			context.addIssue({
				code: 'custom',
				message: 'Gallery history requires an existing scenario or source with persistAs.',
				path: ['saveScreenshot'],
			})
		}
	})

const diagnosticSchema = z.object({
	details: z.string().optional(),
	message: z.string(),
	severity: z.enum(['error', 'info', 'warning']),
	stage: z.enum(['artifact', 'build', 'capture', 'discover', 'render', 'serve']),
})

const captureOutputSchema = z.object({
	diagnostics: z.array(diagnosticSchema),
	durationMs: z.number(),
	historyPath: z.string().optional(),
	latestPath: z.string().optional(),
	metadata: z.record(z.string(), z.unknown()),
	outputPath: z.string(),
	persistentScenario: z.boolean(),
	scenarioId: z.string(),
	scenarioPath: z.string().optional(),
	viewport: z.object({ height: z.number(), width: z.number() }),
})

const serverInstructions = `Component Shot gives agents immediate visual access to React UI without navigating the real application. Use the workspace filesystem to read or edit components and reusable scenarios, then use capture_component_shot to build, render, screenshot, and inspect the pixels in one call.

The tool accepts either an existing scenario path or complete TSX scenario source. Source is temporary unless persistAs is provided. Every successful call returns the PNG; saveScreenshot only controls additional gallery history or stable file output. Prefer real application components mounted with the project's Component Shot provider and deterministic mocks. Use element capture for a focused region of a larger composition.`

const toStructuredResult = (
	result: ComponentShotCaptureResult,
	persistentScenario: boolean,
) => ({
	diagnostics: result.diagnostics,
	durationMs: result.durationMs,
	historyPath: result.historyPath,
	latestPath: result.latestPath,
	metadata: result.metadata as Record<string, unknown>,
	outputPath: result.outputPath,
	persistentScenario,
	scenarioId: result.scenarioId,
	...(persistentScenario ? { scenarioPath: result.scenarioPath } : {}),
	viewport: result.viewport,
})

const readImage = async (outputPath: string) => ({
	data: await fs.readFile(outputPath, 'base64'),
	mimeType: 'image/png',
	type: 'image' as const,
})

const captureResult = async (result: ComponentShotCaptureResult, persistentScenario: boolean) => {
	const structuredContent = toStructuredResult(result, persistentScenario)
	return {
		content: [
			{
				text: JSON.stringify(structuredContent, null, 2),
				type: 'text' as const,
			},
			await readImage(result.outputPath),
		],
		structuredContent,
	}
}

const errorResult = (error: unknown) => {
	const message = error instanceof Error ? error.message : String(error)
	const stage = error instanceof ComponentShotError ? error.stage : 'unknown'
	return {
		content: [
			{
				text: JSON.stringify({ error: { message, stage }, ok: false }, null, 2),
				type: 'text' as const,
			},
		],
		isError: true,
	}
}

export const createComponentShotMcpServer = async (options: ComponentShotMcpServerOptions = {}) => {
	const projectRoot = path.resolve(options.projectRoot ?? process.cwd())
	const workspace = await createComponentShotWorkspace({
		allowExternalOutput: false,
		browserChannel: options.browserChannel,
		build: options.build,
		cwd: projectRoot,
		defaults: options.defaults,
		protocol: options.protocol,
		rspack: options.rspack,
		scenarioDir: options.scenarioDir,
		screenshotsDir: options.screenshotsDir,
		setup: options.setup,
	})
	const session = await workspace.createSession()
	let watcher: FSWatcher | undefined
	const changedPaths = new Set<string>()
	const onSourceChange = (_event: string, filename: string | Buffer | null) => {
		if (!filename) return
		const changedPath = path.resolve(projectRoot, filename.toString())
		const relativePath = path.relative(projectRoot, changedPath)
		if (
			isPathWithin({ candidate: changedPath, root: workspace.screenshotsDir }) ||
			relativePath
				.split(path.sep)
				.some((segment) => ['.git', 'dist', 'node_modules'].includes(segment))
		) {
			return
		}
		changedPaths.add(changedPath)
	}
	try {
		watcher = watch(projectRoot, { recursive: true }, onSourceChange)
	} catch {
		watcher = watch(projectRoot, onSourceChange)
	}
	const flushSourceChanges = async () => {
		await new Promise((resolve) => setTimeout(resolve, 30))
		if (changedPaths.size === 0) return
		const paths = [...changedPaths]
		changedPaths.clear()
		await session.invalidate(paths)
	}
	const handleCapture = async ({
		operation,
		persistentScenario,
	}: {
		operation: () => Promise<ComponentShotCaptureResult>
		persistentScenario: boolean
	}) => {
		try {
			await flushSourceChanges()
			return await captureResult(await operation(), persistentScenario)
		} catch (error) {
			return errorResult(error)
		}
	}
	const server = new McpServer(
		{ name: 'component-shot', version: packageJson.version ?? '0.0.0' },
		{ instructions: serverInstructions },
	)

	server.registerTool(
		'capture_component_shot',
		{
			annotations: {
				destructiveHint: false,
				idempotentHint: false,
				openWorldHint: false,
				readOnlyHint: false,
			},
			description:
				"Render React UI from either an existing Component Shot scenario or complete TSX scenario source and return the PNG in the same call. Use immediately after creating or changing UI, for hard-to-reach states, responsive review, focused element captures, or PR and documentation images. Source is temporary unless target.persistAs is provided. The screenshot is ephemeral unless saveScreenshot requests gallery history or a project PNG. Prefer real application components mounted with deterministic props, mocks, and the project's Component Shot provider.",
			inputSchema: captureInputSchema,
			outputSchema: captureOutputSchema,
		},
		async (args) => {
			const target = args.target
			const request = {
				animations: args.animations,
				area: args.area ?? ({ type: 'viewport' } as const),
				environment: args.environment,
				output: args.saveScreenshot?.type === 'file' ? args.saveScreenshot.path : undefined,
				save: args.saveScreenshot?.type === 'history',
				timeoutMs: args.timeoutMs,
				viewport: args.viewport,
				waitFor: args.waitFor,
			}
			if (target.type === 'scenario') {
				return handleCapture({
					operation: () => session.capture({ ...request, scenario: target.path }),
					persistentScenario: true,
				})
			}
			if (target.persistAs) {
				return handleCapture({
					operation: () =>
						session.captureSource({
							...request,
							scenario: target.persistAs,
							source: target.code,
						}),
					persistentScenario: true,
				})
			}
			return handleCapture({
				operation: () => session.previewSource({ ...request, source: target.code }),
				persistentScenario: false,
			})
		},
	)

	return {
		close: async () => {
			watcher?.close()
			await Promise.allSettled([session.close(), server.close()])
		},
		server,
		workspace,
	}
}
