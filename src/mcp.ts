#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
	CallToolRequestSchema,
	ListToolsRequestSchema,
	type CallToolResult,
	type Tool,
} from '@modelcontextprotocol/sdk/types.js'
import fs from 'node:fs/promises'
import path from 'node:path'
import {
	captureComponentShot,
	captureComponentSource,
	type ComponentShotOptions,
	type ComponentShotViewport,
} from './index.js'

type ToolArgs = Record<string, unknown>

const projectRootEnv = 'COMPONENT_SHOT_PROJECT_ROOT'
const scenarioDirEnv = 'COMPONENT_SHOT_SCENARIO_DIR'

const isObject = (value: unknown): value is ToolArgs =>
	Boolean(value) && typeof value === 'object' && !Array.isArray(value)

const getString = (args: ToolArgs, name: string) => {
	const value = args[name]
	return typeof value === 'string' && value.length > 0 ? value : undefined
}

const getBoolean = (args: ToolArgs, name: string) => {
	const value = args[name]
	return typeof value === 'boolean' ? value : undefined
}

const getNumber = (args: ToolArgs, name: string) => {
	const value = args[name]
	return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

const getViewport = (args: ToolArgs): ComponentShotViewport | undefined => {
	const value = args.viewport
	if (!isObject(value)) {
		return undefined
	}

	const width = getNumber(value, 'width')
	const height = getNumber(value, 'height')
	if (!width || !height || width <= 0 || height <= 0) {
		throw new Error('viewport must include positive width and height numbers')
	}

	return { height, width }
}

const requireString = (args: ToolArgs, name: string) => {
	const value = getString(args, name)
	if (!value) {
		throw new Error(`${name} is required`)
	}
	return value
}

const resolveCwd = (args: ToolArgs) =>
	path.resolve(getString(args, 'cwd') ?? process.env[projectRootEnv] ?? process.cwd())

const toCaptureOptions = ({
	args,
	cwd,
	scenario,
}: {
	args: ToolArgs
	cwd: string
	scenario: string
}): ComponentShotOptions => ({
	browserChannel: getString(args, 'browserChannel'),
	cwd,
	debug: getBoolean(args, 'debug'),
	fullPage: getBoolean(args, 'fullPage'),
	output: getString(args, 'output'),
	save: getBoolean(args, 'save') ?? true,
	saveName: getString(args, 'saveName'),
	scenario,
	screenshotsDir: getString(args, 'screenshotsDir'),
	selector: getString(args, 'selector'),
	setup: getString(args, 'setup'),
	timeoutMs: getNumber(args, 'timeoutMs'),
	viewport: getViewport(args),
	waitFor: getString(args, 'waitFor'),
})

const readPngContent = async (outputPath: string) => ({
	data: await fs.readFile(outputPath, 'base64'),
	mimeType: 'image/png',
	type: 'image' as const,
})

const createResult = async ({
	result,
	scenarioPath,
}: {
	result: Awaited<ReturnType<typeof captureComponentShot>>
	scenarioPath: string
}): Promise<CallToolResult> => ({
	content: [
		{
			text: JSON.stringify(
				{
					historyPath: result.historyPath,
					latestPath: result.latestPath,
					outputPath: result.outputPath,
					scenarioPath,
					url: result.url,
				},
				null,
				2,
			),
			type: 'text',
		},
		await readPngContent(result.outputPath),
	],
})

const toErrorResult = (error: unknown): CallToolResult => ({
	content: [
		{
			text: error instanceof Error ? error.stack ?? error.message : String(error),
			type: 'text',
		},
	],
	isError: true,
})

const captureScenario = async (args: ToolArgs): Promise<CallToolResult> => {
	const cwd = resolveCwd(args)
	const scenario = requireString(args, 'scenario')
	const scenarioPath = path.resolve(cwd, scenario)
	const result = await captureComponentShot(toCaptureOptions({ args, cwd, scenario }))
	return createResult({ result, scenarioPath })
}

const captureSource = async (args: ToolArgs): Promise<CallToolResult> => {
	const cwd = resolveCwd(args)
	const source = requireString(args, 'source')
	const result = await captureComponentSource({
		...toCaptureOptions({
			args,
			cwd,
			scenario: getString(args, 'scenario') ?? '',
		}),
		name: getString(args, 'name'),
		overwrite: getBoolean(args, 'overwrite'),
		scenario: getString(args, 'scenario'),
		scenarioDir: getString(args, 'scenarioDir') ?? process.env[scenarioDirEnv],
		source,
	})

	return createResult({ result, scenarioPath: result.scenarioPath })
}

const commonCaptureProperties = {
	browserChannel: {
		description: 'Optional Playwright browser channel, for example chrome.',
		type: 'string',
	},
	cwd: {
		description: `Project root. Defaults to ${projectRootEnv} or the MCP process cwd.`,
		type: 'string',
	},
	debug: {
		description: 'Print bundler and browser diagnostics.',
		type: 'boolean',
	},
	fullPage: {
		description: 'Capture the full page instead of the component root selector.',
		type: 'boolean',
	},
	output: {
		description: 'Optional PNG output path.',
		type: 'string',
	},
	save: {
		description: 'Save latest.png and a timestamped history PNG. Defaults to true for MCP.',
		type: 'boolean',
	},
	saveName: {
		description: 'Name to use under the screenshots directory.',
		type: 'string',
	},
	screenshotsDir: {
		description: 'Screenshot audit directory. Defaults to the nearest component-shot/screenshots.',
		type: 'string',
	},
	selector: {
		description: 'CSS selector to capture.',
		type: 'string',
	},
	setup: {
		description: 'Optional setup module. Defaults to setup.* beside the scenario component-shot folder.',
		type: 'string',
	},
	timeoutMs: {
		description: 'Capture timeout in milliseconds.',
		type: 'number',
	},
	viewport: {
		additionalProperties: false,
		description: 'Browser viewport.',
		properties: {
			height: { type: 'number' },
			width: { type: 'number' },
		},
		required: ['width', 'height'],
		type: 'object',
	},
	waitFor: {
		description: 'Optional selector to wait for before capture.',
		type: 'string',
	},
} satisfies Record<string, object>

const tools: Tool[] = [
	{
		description: 'Capture a PNG screenshot for an existing component-shot scenario file.',
		inputSchema: {
			additionalProperties: false,
			properties: {
				scenario: {
					description: 'Scenario path, usually packages/client/component-shot/scenarios/name.tsx.',
					type: 'string',
				},
				...commonCaptureProperties,
			},
			required: ['scenario'],
			type: 'object',
		},
		name: 'capture_component_shot',
	},
	{
		description: 'Write scenario source to the repo, capture it, and return the PNG image.',
		inputSchema: {
			additionalProperties: false,
			properties: {
				name: {
					description: 'Scenario filename stem when scenario is omitted.',
					type: 'string',
				},
				overwrite: {
					description: 'Allow replacing an existing scenario file.',
					type: 'boolean',
				},
				scenario: {
					description: 'Optional scenario path to write.',
					type: 'string',
				},
				scenarioDir: {
					description: `Directory for generated scenario files. Defaults to ${scenarioDirEnv} or component-shot/scenarios.`,
					type: 'string',
				},
				source: {
					description: 'Complete TSX scenario module source.',
					type: 'string',
				},
				...commonCaptureProperties,
			},
			required: ['source'],
			type: 'object',
		},
		name: 'capture_component_source',
	},
]

const server = new Server(
	{
		name: 'component-shot',
		version: '0.1.0',
	},
	{
		capabilities: {
			tools: {},
		},
	},
)

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }))
server.setRequestHandler(CallToolRequestSchema, async (request) => {
	try {
		const args = isObject(request.params.arguments) ? request.params.arguments : {}

		switch (request.params.name) {
			case 'capture_component_shot':
				return await captureScenario(args)
			case 'capture_component_source':
				return await captureSource(args)
			default:
				throw new Error(`Unknown tool "${request.params.name}"`)
		}
	} catch (error) {
		return toErrorResult(error)
	}
})

await server.connect(new StdioServerTransport())
