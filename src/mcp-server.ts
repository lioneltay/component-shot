import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import fs from 'node:fs/promises'
import { createRequire } from 'node:module'
import { z } from 'zod'
import {
	createComponentShotMcpProjectRegistry,
	type ComponentShotMcpProjectOptions,
	type ComponentShotMcpProjectRuntime,
} from './mcp-projects.js'
import {
	ComponentShotError,
	componentShotViewportLimits,
	type ComponentShotCaptureResult,
} from './session.js'

const require = createRequire(import.meta.url)
const packageJson = require('../package.json') as { version?: string }

export type ComponentShotMcpServerOptions = ComponentShotMcpProjectOptions

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

const projectSchema = z
	.string()
	.min(1)
	.describe(
		'React project directory relative to the MCP process working directory, or an absolute path. Component Shot uses this directory for dependencies, tsconfig.json, setup discovery, scenarios, and screenshots. Temporary source is staged in <project>/component-shot/scenarios for relative imports.',
	)

const targetSchema = z.union([
	z
		.object({
			path: z
				.string()
				.min(1)
				.describe(
					'Existing scenario file path relative to the MCP process working directory, or an absolute path.',
				),
			project: projectSchema
				.optional()
				.describe(
					'Optional project consistency check. The scenario path normally derives its project automatically.',
				),
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
			project: projectSchema,
			type: z.literal('source'),
		})
		.strict()
		.describe(
			'Render temporary source without retaining it. A project is required because the source has no filesystem anchor.',
		),
	z
		.object({
			code: z
				.string()
				.min(1)
				.describe('Complete TSX scenario module source, including its default export.'),
			persistAs: z
				.string()
				.min(1)
				.describe(
					'Repository-relative or absolute destination inside <project>/component-shot/scenarios. The path derives the project when project is omitted. Existing files are never overwritten.',
				),
			project: projectSchema
				.optional()
				.describe(
					'Optional project consistency check. The persistAs path normally derives its project automatically.',
				),
			type: z.literal('source'),
		})
		.strict()
		.describe('Create a reusable scenario from complete TSX source and render it immediately.'),
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
					.describe('Stable PNG path relative to the resolved project root.'),
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
			!('persistAs' in input.target)
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
	projectRoot: z.string(),
	scenarioId: z.string(),
	scenarioPath: z.string().optional(),
	setup: z.discriminatedUnion('mode', [
		z.object({ mode: z.literal('configured'), path: z.string() }),
		z.object({ mode: z.literal('custom-build') }),
		z.object({ mode: z.literal('default') }),
		z.object({ mode: z.literal('project'), path: z.string() }),
	]),
	viewport: z.object({ height: z.number(), width: z.number() }),
})

const serverInstructions = `Component Shot gives agents immediate visual access to React UI without navigating the real application. Use the filesystem to read or edit components and reusable scenarios, then use capture_component_shot to build, render, screenshot, and inspect the pixels in one call.

The tool accepts either an existing scenario path or complete TSX scenario source. Existing scenario and persistAs paths derive their React project automatically. Temporary source requires target.project because it has no filesystem location. Component Shot loads <project>/component-shot/setup.* when present and otherwise uses a no-op provider. Every successful call returns the PNG; saveScreenshot only controls additional gallery history or stable file output. Prefer real application components mounted with deterministic props and mocks. Use element capture for a focused region of a larger composition.`

const toStructuredResult = async (
	result: ComponentShotCaptureResult,
	persistentScenario: boolean,
	project: ComponentShotMcpProjectRuntime,
) => {
	const setup = await project.getSetup()
	return {
		diagnostics: result.diagnostics,
		durationMs: result.durationMs,
		historyPath: result.historyPath,
		latestPath: result.latestPath,
		metadata: result.metadata as Record<string, unknown>,
		outputPath: result.outputPath,
		persistentScenario,
		projectRoot: project.projectRoot,
		scenarioId: result.scenarioId,
		...(persistentScenario ? { scenarioPath: result.scenarioPath } : {}),
		setup,
		viewport: result.viewport,
	}
}

const readImage = async (outputPath: string) => ({
	data: await fs.readFile(outputPath, 'base64'),
	mimeType: 'image/png',
	type: 'image' as const,
})

const captureResult = async (
	result: ComponentShotCaptureResult,
	persistentScenario: boolean,
	project: ComponentShotMcpProjectRuntime,
) => {
	const structuredContent = await toStructuredResult(result, persistentScenario, project)
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

const errorResult = async (error: unknown, project?: ComponentShotMcpProjectRuntime) => {
	const message = error instanceof Error ? error.message : String(error)
	const stage = error instanceof ComponentShotError ? error.stage : 'unknown'
	const setup = project ? await project.getSetup().catch(() => undefined) : undefined
	const hint =
		project && setup?.mode === 'default'
			? `No Component Shot setup was found for ${project.projectRoot}. The default no-op provider was used. If this component requires application context, create component-shot/setup.tsx or run component-shot init in that project.`
			: undefined
	return {
		content: [
			{
				text: JSON.stringify({ error: { hint, message, stage }, ok: false }, null, 2),
				type: 'text' as const,
			},
		],
		isError: true,
	}
}

export const createComponentShotMcpServer = async (options: ComponentShotMcpServerOptions = {}) => {
	const projects = await createComponentShotMcpProjectRegistry(options)
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
				"Render React UI from either an existing Component Shot scenario or complete TSX scenario source and return the PNG in the same call. Use immediately after creating or changing UI, for hard-to-reach states, responsive review, focused element captures, or PR and documentation images. Existing scenario and persistAs paths derive their React project automatically; temporary source requires target.project. The screenshot is ephemeral unless saveScreenshot requests gallery history or a project PNG. Component Shot uses the project's setup module when present and a no-op provider otherwise.",
			inputSchema: captureInputSchema,
			outputSchema: captureOutputSchema,
		},
		async (args) => {
			const target = args.target
			let project: ComponentShotMcpProjectRuntime | undefined
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
			try {
				if (target.type === 'scenario') {
					const resolved = await projects.resolveScenario(target)
					const runtime = resolved.project
					project = runtime
					const result = await runtime.runCapture([resolved.scenario], () =>
						runtime.session.capture({ ...request, scenario: resolved.scenario }),
					)
					return captureResult(
						result,
						true,
						project,
					)
				}
				if ('persistAs' in target) {
					const resolved = await projects.resolvePersistedSource(target)
					const runtime = resolved.project
					project = runtime
					const result = await runtime.runCapture([resolved.scenario], () =>
						runtime.session.captureSource({
							...request,
							scenario: resolved.scenario,
							source: target.code,
						}),
					)
					return captureResult(
						result,
						true,
						project,
					)
				}
				const runtime = await projects.resolveTemporarySource(target.project)
				project = runtime
				const result = await runtime.runCapture([], () =>
					runtime.session.previewSource({ ...request, source: target.code }),
				)
				return captureResult(
					result,
					false,
					project,
				)
			} catch (error) {
				return errorResult(error, project)
			}
		},
	)

	return {
		close: async () => {
			await Promise.allSettled([projects.close(), server.close()])
		},
		server,
	}
}
