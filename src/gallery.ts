import { spawn } from 'node:child_process'
import { watch, type FSWatcher } from 'node:fs'
import fs from 'node:fs/promises'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { createRspackBuild } from './rspack.js'

export type ComponentShotGalleryOptions = {
	cwd?: string
	host?: string
	open?: boolean
	port?: number
	scenarioDir?: string
	screenshotsDir?: string
}

export type ComponentShotGalleryScenario = {
	detailUrl: string
	historyCount: number
	id: string
	name: string
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
	index: ComponentShotGalleryIndex
	server: http.Server
	url: string
}

type ParsedGalleryOptions = Required<
	Pick<ComponentShotGalleryOptions, 'host' | 'open' | 'port' | 'scenarioDir'>
> &
	ComponentShotGalleryOptions & {
		json?: boolean
	}

type GalleryBuildCommand = {
	args?: string[]
	command: string
	cwd?: string
	env?: Record<string, string | undefined>
	shell?: boolean
}

type GalleryBuildContext = {
	cwd: string
	debug: boolean
	publicDir: string
	scenarioPath: string
}

type GalleryBuild =
	| GalleryBuildCommand
	| ((context: GalleryBuildContext) => GalleryBuildCommand | void | Promise<GalleryBuildCommand | void>)

type ResolvedGalleryOptions = Required<Pick<ComponentShotGalleryOptions, 'host' | 'open' | 'port'>> & {
	cwd: string
	scenarioDir: string
	screenshotsDir: string
}

type RenderBuild = {
	publicDir: string
	scenario: ComponentShotGalleryScenario
}

type HistoryShot = {
	filename: string
	updatedAt: string
	url: string
}

type GalleryState = {
	getIndex: () => ComponentShotGalleryIndex
	getVersion: () => number
}

const defaultGalleryOptions = {
	host: '127.0.0.1',
	open: true,
	port: 0,
	scenarioDir: 'component-shot/scenarios',
} satisfies Required<Pick<ComponentShotGalleryOptions, 'host' | 'open' | 'port' | 'scenarioDir'>>

const scenarioExtensions = new Set(['.js', '.jsx', '.ts', '.tsx'])
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

const createGalleryUsage = (usageCommand: string) => `Usage:
  ${usageCommand}

Options:
  --scenario-dir <path>     Scenario directory. Defaults to component-shot/scenarios.
  --screenshots-dir <path>  Screenshot history directory. Defaults to sibling component-shot/screenshots.
  --cwd <path>              Working directory. Defaults to the current directory.
  --host <host>             Host to bind. Defaults to 127.0.0.1.
  --port <port>             Port to bind. Defaults to an ephemeral port.
  --no-open                 Print the gallery URL without opening a browser.
  --json                    Print machine-readable startup JSON.
  --help                    Show this help message.`

const parseGalleryCliArgs = ({
	argv,
	usageCommand,
}: {
	argv: string[]
	usageCommand: string
}): ParsedGalleryOptions => {
	const options: ParsedGalleryOptions = { ...defaultGalleryOptions }
	const usage = createGalleryUsage(usageCommand)

	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index]
		const flag = arg.includes('=') ? arg.slice(0, arg.indexOf('=')) : arg

		switch (flag) {
			case '--':
				break
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
			case '--host': {
				const [value, nextIndex] = readFlagValue(argv, index, arg)
				options.host = value
				index = nextIndex
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
				const [value, nextIndex] = readFlagValue(argv, index, arg)
				options.port = Number(value)
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
			default:
				throw new Error(`Unknown gallery option "${arg}"\n\n${usage}`)
		}
	}

	if (!Number.isInteger(options.port) || options.port < 0 || options.port > 65_535) {
		throw new Error('--port must be an integer from 0 to 65535')
	}

	return options
}

const encodeId = (value: string) => Buffer.from(value).toString('base64url')

const escapeHtml = (value: string) =>
	value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const escapeAttribute = (value: string) => escapeHtml(value).replace(/'/g, '&#39;')

const toInlineJson = (value: unknown) => JSON.stringify(value).replace(/</g, '\\u003c')

const toPosixPath = (value: string) => value.split(path.sep).join('/')

const sanitizeFilename = (value: string) =>
	value
		.replace(/[^a-z0-9_.-]+/gi, '-')
		.replace(/^-+|-+$/g, '')
		.toLowerCase() || 'component-shot'

const getScenarioName = (scenarioPath: string) => {
	const basename = path.basename(scenarioPath, path.extname(scenarioPath))
	return basename === 'index' ? path.basename(path.dirname(scenarioPath)) : basename
}

const isScenarioFile = (filePath: string) =>
	scenarioExtensions.has(path.extname(filePath).toLowerCase()) && !filePath.endsWith('.d.ts')

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

const readDirOrEmpty = async (dir: string) => {
	try {
		return await fs.readdir(dir, { withFileTypes: true })
	} catch (error) {
		const code = typeof error === 'object' && error && 'code' in error ? error.code : undefined
		if (code === 'ENOENT') {
			return []
		}
		throw error
	}
}

const walkScenarioFiles = async (dir: string): Promise<string[]> => {
	const entries = await readDirOrEmpty(dir)
	const files = await Promise.all(
		entries.map(async (entry) => {
			const entryPath = path.join(dir, entry.name)
			if (entry.isDirectory()) {
				return walkScenarioFiles(entryPath)
			}
			if (entry.isFile() && isScenarioFile(entryPath)) {
				return [entryPath]
			}
			return []
		}),
	)

	return files.flat()
}

const findComponentShotDir = (dir: string) => {
	let current = path.resolve(dir)

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
	scenarioDir,
}: {
	cwd: string
	scenarioDir: string
}) => {
	const componentShotDir = findComponentShotDir(scenarioDir)
	if (componentShotDir) {
		const setupPath = await findSetupPath(componentShotDir)
		if (setupPath) {
			return setupPath
		}
	}

	for (const candidate of setupFilenames.map((filename) => path.join('component-shot', filename))) {
		if (await pathExists(path.resolve(cwd, candidate))) {
			return candidate
		}
	}

	return undefined
}

const resolveGalleryOptions = (options: ComponentShotGalleryOptions): ResolvedGalleryOptions => {
	const cwd = path.resolve(process.cwd(), options.cwd ?? '.')
	const scenarioDir = path.resolve(cwd, options.scenarioDir ?? defaultGalleryOptions.scenarioDir)
	const componentShotDir = findComponentShotDir(scenarioDir)
	return {
		cwd,
		host: options.host ?? defaultGalleryOptions.host,
		open: options.open ?? defaultGalleryOptions.open,
		port: options.port ?? defaultGalleryOptions.port,
		scenarioDir,
		screenshotsDir: options.screenshotsDir
			? path.resolve(cwd, options.screenshotsDir)
			: componentShotDir
				? path.join(componentShotDir, 'screenshots')
				: path.resolve(cwd, 'component-shot/screenshots'),
	}
}

const getScenarioHistoryDir = (screenshotsDir: string, scenario: Pick<ComponentShotGalleryScenario, 'name'>) =>
	path.join(screenshotsDir, sanitizeFilename(scenario.name), 'history')

const getHistoryCount = async (historyDir: string) => {
	const entries = await readDirOrEmpty(historyDir)
	return entries.filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.png')).length
}

const listHistoryShots = async (
	index: ComponentShotGalleryIndex,
	scenario: ComponentShotGalleryScenario,
): Promise<HistoryShot[]> => {
	const historyDir = getScenarioHistoryDir(index.screenshotsDir, scenario)
	const entries = await readDirOrEmpty(historyDir)
	const shots = await Promise.all(
		entries
			.filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.png'))
			.map(async (entry) => {
				const filePath = path.join(historyDir, entry.name)
				const stats = await fs.stat(filePath)
				return {
					filename: entry.name,
					updatedAt: stats.mtime.toISOString(),
					url: `/history/${scenario.id}/${encodeURIComponent(entry.name)}`,
				}
			}),
	)

	shots.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
	return shots
}

export const createComponentShotGalleryIndex = async (
	options: ComponentShotGalleryOptions = {},
): Promise<ComponentShotGalleryIndex> => {
	const resolved = resolveGalleryOptions(options)
	const scenarioPaths = await walkScenarioFiles(resolved.scenarioDir)
	const scenarios = await Promise.all(
		scenarioPaths.map(async (scenarioPath): Promise<ComponentShotGalleryScenario> => {
			const relativeScenarioPath = toPosixPath(path.relative(resolved.cwd, scenarioPath))
			const id = encodeId(relativeScenarioPath)
			const name = getScenarioName(scenarioPath)

			return {
				detailUrl: `/scenario/${id}/`,
				historyCount: await getHistoryCount(getScenarioHistoryDir(resolved.screenshotsDir, { name })),
				id,
				name,
				previewUrl: `/render/${id}/?embed=preview`,
				relativeScenarioPath,
				renderUrl: `/render/${id}/`,
				scenarioPath,
			}
		}),
	)

	scenarios.sort((left, right) => left.relativeScenarioPath.localeCompare(right.relativeScenarioPath))

	return {
		cwd: resolved.cwd,
		scenarioDir: resolved.scenarioDir,
		scenarios,
		screenshotsDir: resolved.screenshotsDir,
	}
}

const createScenarioCard = (scenario: ComponentShotGalleryScenario) => `<article class="scenario-card" data-scenario-card data-scenario-id="${escapeAttribute(scenario.id)}">
	<div class="render-frame" data-render-frame>
		<iframe
			title="${escapeAttribute(scenario.name)}"
			src="${escapeAttribute(scenario.previewUrl)}"
			scrolling="no"
		></iframe>
		<div class="render-loading">Rendering...</div>
	</div>
	<div class="scenario-card__body">
		<div>
			<h2>${escapeHtml(scenario.name)}</h2>
			<p class="path">${escapeHtml(scenario.relativeScenarioPath)}</p>
		</div>
		<div class="scenario-card__actions">
			<button class="pin-button" type="button" data-pin-button aria-pressed="false" title="Pin scenario">Pin</button>
			<button
				class="delete-scenario"
				type="button"
				data-delete-scenario
				data-scenario-name="${escapeAttribute(scenario.name)}"
				data-scenario-path="${escapeAttribute(scenario.relativeScenarioPath)}"
				title="Delete scenario"
			>Delete</button>
			<a class="open-render" href="${escapeAttribute(scenario.detailUrl)}">Open</a>
		</div>
	</div>
</article>`

const createGalleryHtml = (index: ComponentShotGalleryIndex) => {
	const clearDisabledAttribute = index.scenarios.length === 0 ? ' disabled' : ''
	const cards =
		index.scenarios.length > 0
			? index.scenarios.map(createScenarioCard).join('\n')
			: `<section class="empty-state">
					<h2>No scenarios found</h2>
					<p>${escapeHtml(toPosixPath(path.relative(index.cwd, index.scenarioDir) || index.scenarioDir))}</p>
				</section>`

	return `<!doctype html>
<html lang="en">
	<head>
		<meta charset="utf-8" />
		<meta name="viewport" content="width=device-width, initial-scale=1" />
		<title>Component Shot Gallery</title>
		<script>
			try {
				const savedColumns = localStorage.getItem('component-shot-gallery:columns') || 'auto'
				if (['auto', '2', '3', '4'].includes(savedColumns)) {
					document.documentElement.dataset.galleryColumns = savedColumns
				}
			} catch {}
		</script>
		<style>
			:root {
				color: #172033;
				background: #eef2f6;
				font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
				font-synthesis: none;
				text-rendering: optimizeLegibility;
			}

			* {
				box-sizing: border-box;
			}

			body {
				min-width: 320px;
				min-height: 100vh;
				margin: 0;
			}

			.app-shell {
				width: calc(100% - 32px);
				margin: 0 auto;
				padding: 16px 0;
			}

			header {
				display: flex;
				align-items: end;
				justify-content: space-between;
				gap: 24px;
				margin-bottom: 14px;
			}

			.eyebrow {
				margin: 0 0 8px;
				color: #0f766e;
				font-size: 0.78rem;
				font-weight: 800;
				letter-spacing: 0;
				text-transform: uppercase;
			}

			h1,
			h2,
			p {
				margin-top: 0;
			}

			h1 {
				margin-bottom: 0;
				color: #111827;
				font-size: 2rem;
				line-height: 1;
				letter-spacing: 0;
			}

			.summary {
				display: flex;
				align-items: center;
				gap: 12px;
				color: #506070;
				font-weight: 700;
			}

			.layout-control {
				display: inline-flex;
				align-items: center;
				gap: 8px;
				color: #506070;
				font-size: 0.85rem;
				font-weight: 800;
			}

			.layout-control select {
				min-height: 38px;
				padding: 0 34px 0 10px;
				border: 1px solid #ccd6e3;
				border-radius: 7px;
				background: #ffffff;
				color: #172033;
				font: inherit;
			}

			.summary-count {
				white-space: nowrap;
			}

			.summary a,
			.summary button {
				min-height: 38px;
				display: inline-flex;
				align-items: center;
				justify-content: center;
				padding: 0 14px;
				border: 1px solid #ccd6e3;
				border-radius: 7px;
				background: #ffffff;
				color: #172033;
				font: inherit;
				font-weight: 800;
				text-decoration: none;
			}

			.summary button {
				cursor: pointer;
			}

			.summary button:disabled {
				cursor: not-allowed;
				opacity: 0.5;
			}

			.summary .danger-button {
				border-color: #e9bec5;
				color: #9f1239;
			}

			.workspace {
				display: grid;
				gap: 6px;
				margin-bottom: 16px;
				padding: 10px 12px;
				border: 1px solid #d7dee8;
				border-radius: 8px;
				background: #ffffff;
				color: #506070;
				font-size: 0.9rem;
			}

			.workspace code {
				color: #172033;
				font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
			}

			.scenario-grid {
				display: grid;
				grid-template-columns: repeat(auto-fit, minmax(min(560px, 100%), 1fr));
				gap: 12px;
			}

			html[data-gallery-columns="2"] .scenario-grid {
				grid-template-columns: repeat(2, minmax(0, 1fr));
			}

			html[data-gallery-columns="3"] .scenario-grid {
				grid-template-columns: repeat(3, minmax(0, 1fr));
			}

			html[data-gallery-columns="4"] .scenario-grid {
				grid-template-columns: repeat(4, minmax(0, 1fr));
			}

			.scenario-card {
				display: grid;
				overflow: hidden;
				border: 1px solid #d7dee8;
				border-radius: 8px;
				background: #ffffff;
				box-shadow: 0 10px 28px rgb(15 23 42 / 7%);
			}

			.scenario-card[data-pinned="true"] {
				border-color: #89b8ad;
				box-shadow: 0 10px 28px rgb(15 23 42 / 9%);
			}

			.render-frame {
				--preview-min-height: 240px;
				--preview-max-height: 620px;
				position: relative;
				height: clamp(320px, 28vw, var(--preview-max-height));
				overflow: hidden;
				border-bottom: 1px solid #d7dee8;
				background: #ffffff;
			}

			html[data-gallery-columns="2"] .render-frame {
				--preview-max-height: 720px;
				height: clamp(360px, 34vw, var(--preview-max-height));
			}

			html[data-gallery-columns="3"] .render-frame {
				--preview-max-height: 620px;
				height: clamp(320px, 28vw, var(--preview-max-height));
			}

			html[data-gallery-columns="4"] .render-frame {
				--preview-max-height: 460px;
				height: clamp(280px, 22vw, var(--preview-max-height));
			}

			.render-frame iframe {
				width: 100%;
				height: 100%;
				border: 0;
				background: #ffffff;
				opacity: 0;
				transition: opacity 160ms ease;
			}

			.render-frame.is-ready iframe {
				opacity: 1;
			}

			.render-loading {
				position: absolute;
				inset: 0;
				display: grid;
				place-items: center;
				background: #ffffff;
				color: #64748b;
				font-weight: 800;
			}

			.render-frame.is-ready .render-loading {
				display: none;
			}

			.scenario-card__body {
				display: flex;
				align-items: center;
				justify-content: space-between;
				gap: 16px;
				padding: 16px;
			}

			.scenario-card__body > div:first-child {
				min-width: 0;
			}

			.scenario-card__actions {
				display: inline-flex;
				flex: 0 0 auto;
				align-items: center;
				gap: 8px;
			}

			.scenario-card h2 {
				margin-bottom: 8px;
				color: #111827;
				font-size: 1.15rem;
				line-height: 1.2;
				letter-spacing: 0;
			}

			.path {
				margin-bottom: 0;
				color: #506070;
				font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
				font-size: 0.8rem;
				line-height: 1.45;
				overflow-wrap: anywhere;
			}

			.pin-button {
				flex: 0 0 auto;
				min-height: 36px;
				display: inline-flex;
				align-items: center;
				justify-content: center;
				min-width: 72px;
				padding: 0 12px;
				border: 1px solid #ccd6e3;
				border-radius: 7px;
				background: #ffffff;
				color: #172033;
				font: inherit;
				font-weight: 800;
				cursor: pointer;
			}

			.pin-button[aria-pressed="true"] {
				border-color: #6eaa9d;
				background: #e7f5f1;
				color: #0f5f56;
			}

			.delete-scenario {
				flex: 0 0 auto;
				min-height: 36px;
				display: inline-flex;
				align-items: center;
				justify-content: center;
				min-width: 72px;
				padding: 0 12px;
				border: 1px solid #e9bec5;
				border-radius: 7px;
				background: #ffffff;
				color: #9f1239;
				font: inherit;
				font-weight: 800;
				cursor: pointer;
			}

			.open-render {
				flex: 0 0 auto;
				min-height: 36px;
				display: inline-flex;
				align-items: center;
				justify-content: center;
				padding: 0 12px;
				border-radius: 7px;
				background: #102033;
				color: #ffffff;
				font-weight: 800;
				text-decoration: none;
			}

			.empty-state {
				padding: 28px;
				border: 1px solid #d7dee8;
				border-radius: 8px;
				background: #ffffff;
			}

			.empty-state h2 {
				margin-bottom: 8px;
				color: #111827;
			}

			.empty-state p {
				margin-bottom: 0;
				color: #506070;
			}

			@media (max-width: 720px) {
				.app-shell {
					width: calc(100% - 24px);
					padding: 12px 0;
				}

				header {
					align-items: stretch;
					flex-direction: column;
				}

				h1 {
					font-size: 2rem;
				}

				.summary {
					justify-content: space-between;
					flex-wrap: wrap;
				}

				.scenario-grid,
				html[data-gallery-columns="2"] .scenario-grid,
				html[data-gallery-columns="3"] .scenario-grid,
				html[data-gallery-columns="4"] .scenario-grid {
					grid-template-columns: 1fr;
				}

				.render-frame,
				html[data-gallery-columns="2"] .render-frame,
				html[data-gallery-columns="3"] .render-frame,
				html[data-gallery-columns="4"] .render-frame {
					--preview-min-height: 220px;
					--preview-max-height: 480px;
					height: 320px;
				}

				.scenario-card__body {
					align-items: flex-start;
					flex-direction: column;
				}

				.scenario-card__actions {
					width: 100%;
					justify-content: flex-end;
				}
			}
		</style>
	</head>
	<body>
		<main class="app-shell">
			<header>
				<div>
					<p class="eyebrow">Component Shot</p>
					<h1>Scenario Gallery</h1>
				</div>
				<div class="summary">
					<label class="layout-control">
						<span>Columns</span>
						<select data-layout-select aria-label="Gallery columns">
							<option value="auto">Smart</option>
							<option value="2">2</option>
							<option value="3">3</option>
							<option value="4">4</option>
						</select>
					</label>
					<span class="summary-count">${index.scenarios.length} ${index.scenarios.length === 1 ? 'scenario' : 'scenarios'}</span>
					<button class="danger-button" type="button" data-clear-scenarios${clearDisabledAttribute}>Clear</button>
					<a href="/api/scenarios">JSON</a>
				</div>
			</header>
			<section class="workspace" aria-label="Gallery paths">
				<div>Scenarios: <code>${escapeHtml(toPosixPath(path.relative(index.cwd, index.scenarioDir) || index.scenarioDir))}</code></div>
			</section>
			<section class="scenario-grid" data-scenario-grid aria-label="Scenarios">
				${cards}
			</section>
		</main>
		<script>
			const columnsKey = 'component-shot-gallery:columns'
			const pinnedKey = 'component-shot-gallery:pinned'
			const validColumns = new Set(['auto', '2', '3', '4'])

			const readColumns = () => {
				try {
					const value = localStorage.getItem(columnsKey)
					return validColumns.has(value) ? value : 'auto'
				} catch {
					return 'auto'
				}
			}

			const applyColumns = (value) => {
				const nextValue = validColumns.has(value) ? value : 'auto'
				document.documentElement.dataset.galleryColumns = nextValue
				const select = document.querySelector('[data-layout-select]')
				if (select) {
					select.value = nextValue
				}
				try {
					localStorage.setItem(columnsKey, nextValue)
				} catch {}
			}

			const readPinned = () => {
				try {
					const value = JSON.parse(localStorage.getItem(pinnedKey) || '[]')
					return new Set(Array.isArray(value) ? value.filter((entry) => typeof entry === 'string') : [])
				} catch {
					return new Set()
				}
			}

			const writePinned = (pinned) => {
				try {
					localStorage.setItem(pinnedKey, JSON.stringify([...pinned]))
				} catch {}
			}

			const scenarioGrid = document.querySelector('[data-scenario-grid]')
			const cards = Array.from(document.querySelectorAll('[data-scenario-card]'))
			const applyPinned = () => {
				const pinned = readPinned()
				const cardStates = cards.map((card, index) => {
					const id = card.dataset.scenarioId
					const isPinned = typeof id === 'string' && pinned.has(id)
					card.dataset.pinned = String(isPinned)

					const button = card.querySelector('[data-pin-button]')
					if (button) {
						button.setAttribute('aria-pressed', String(isPinned))
						button.textContent = isPinned ? 'Pinned' : 'Pin'
						button.title = isPinned ? 'Unpin scenario' : 'Pin scenario'
					}

					return { card, index, isPinned }
				})

				if (scenarioGrid) {
					cardStates
						.sort((left, right) => {
							if (left.isPinned !== right.isPinned) {
								return left.isPinned ? -1 : 1
							}
							return left.index - right.index
						})
						.forEach(({ card }) => scenarioGrid.appendChild(card))
				}
			}

			const layoutSelect = document.querySelector('[data-layout-select]')
			if (layoutSelect) {
				applyColumns(readColumns())
				layoutSelect.addEventListener('change', () => {
					applyColumns(layoutSelect.value)
					window.requestAnimationFrame(fitReadyFrames)
				})
			}

			for (const button of document.querySelectorAll('[data-pin-button]')) {
				button.addEventListener('click', () => {
					const card = button.closest('[data-scenario-card]')
					const id = card?.dataset.scenarioId
					if (!id) {
						return
					}

					const pinned = readPinned()
					if (pinned.has(id)) {
						pinned.delete(id)
					} else {
						pinned.add(id)
					}
					writePinned(pinned)
					applyPinned()
					window.requestAnimationFrame(fitReadyFrames)
				})
			}
			applyPinned()

			const requestDelete = async (url) => {
				const response = await fetch(url, { method: 'DELETE' })
				if (response.ok) {
					return
				}

				let message = 'Delete failed'
				try {
					const data = await response.json()
					message = data.error || message
				} catch {
					message = await response.text()
				}
				throw new Error(message || 'Delete failed')
			}

			for (const button of document.querySelectorAll('[data-delete-scenario]')) {
				button.addEventListener('click', async () => {
					const card = button.closest('[data-scenario-card]')
					const id = card?.dataset.scenarioId
					if (!id) {
						return
					}

					const scenarioName = button.dataset.scenarioName || id
					const scenarioPath = button.dataset.scenarioPath || ''
					if (!window.confirm('Delete scenario "' + scenarioName + '"?\\n' + scenarioPath)) {
						return
					}

					try {
						await requestDelete('/api/scenarios/' + encodeURIComponent(id))
						const pinned = readPinned()
						pinned.delete(id)
						writePinned(pinned)
						window.location.reload()
					} catch (error) {
						window.alert(error instanceof Error ? error.message : String(error))
					}
				})
			}

			const clearButton = document.querySelector('[data-clear-scenarios]')
			clearButton?.addEventListener('click', async () => {
				if (cards.length === 0) {
					return
				}

				if (!window.confirm('Delete all ' + cards.length + ' scenario files?\\nScreenshot history is not deleted.')) {
					return
				}

				try {
					await requestDelete('/api/scenarios')
					writePinned(new Set())
					window.location.reload()
				} catch (error) {
					window.alert(error instanceof Error ? error.message : String(error))
				}
			})

			const readPixelValue = (value, fallback) => {
				const parsed = Number.parseFloat(value)
				return Number.isFinite(parsed) ? parsed : fallback
			}

			const fitRenderFrame = (frame) => {
				const iframe = frame.querySelector('iframe')
				const doc = iframe?.contentDocument
				const root = doc?.querySelector('[data-component-shot-root]')
				if (!iframe || !doc || !root) {
					return
				}

				root.style.marginLeft = '0px'
				root.style.marginTop = '0px'
				root.style.transform = ''
				root.style.transformOrigin = 'top left'

				const rect = root.getBoundingClientRect()
				const bodyStyle = doc.defaultView?.getComputedStyle(doc.body)
				const paddingX =
					Number.parseFloat(bodyStyle?.paddingLeft || '0') +
					Number.parseFloat(bodyStyle?.paddingRight || '0')
				const paddingY =
					Number.parseFloat(bodyStyle?.paddingTop || '0') +
					Number.parseFloat(bodyStyle?.paddingBottom || '0')
				const frameStyle = window.getComputedStyle(frame)
				const minFrameHeight = readPixelValue(frameStyle.getPropertyValue('--preview-min-height'), 240)
				const maxFrameHeight = readPixelValue(frameStyle.getPropertyValue('--preview-max-height'), 620)
				const availableWidth = Math.max(1, iframe.clientWidth - paddingX)
				const contentWidth = Math.max(1, root.scrollWidth, Math.ceil(rect.width))
				const contentHeight = Math.max(1, root.scrollHeight, Math.ceil(rect.height))
				const widthScale = Math.min(1, availableWidth / contentWidth)
				const desiredHeight = Math.min(
					maxFrameHeight,
					Math.max(minFrameHeight, Math.ceil(contentHeight * widthScale + paddingY)),
				)
				if (Math.abs(frame.getBoundingClientRect().height - desiredHeight) > 1) {
					frame.style.height = desiredHeight + 'px'
				}
				const availableHeight = Math.max(1, desiredHeight - paddingY)
				const scale = Math.max(
					0.15,
					Math.min(1, availableWidth / contentWidth, availableHeight / contentHeight),
				)

				if (scale < 0.995) {
					root.style.transform = 'scale(' + scale + ')'
				}
				root.style.marginLeft = Math.max(0, (availableWidth - contentWidth * scale) / 2) + 'px'
				root.style.marginTop = Math.max(0, (availableHeight - contentHeight * scale) / 2) + 'px'
				frame.dataset.previewScale = scale.toFixed(3)
			}

			const fitFrameSoon = (frame) => {
				fitRenderFrame(frame)
				window.setTimeout(() => fitRenderFrame(frame), 80)
				window.setTimeout(() => fitRenderFrame(frame), 280)
			}

			const fitReadyFrames = () => {
				for (const frame of document.querySelectorAll('[data-render-frame].is-ready')) {
					fitRenderFrame(frame)
				}
			}

			window.addEventListener('resize', fitReadyFrames)

			if ('ResizeObserver' in window) {
				const previewResizeObserver = new ResizeObserver((entries) => {
					for (const entry of entries) {
						fitRenderFrame(entry.target)
					}
				})
				for (const frame of document.querySelectorAll('[data-render-frame]')) {
					previewResizeObserver.observe(frame)
				}
			}

			const markFrameReady = (frame) => {
				const iframe = frame.querySelector('iframe')
				let checkToken = 0
				const finish = () => {
					frame.classList.add('is-ready')
					fitFrameSoon(frame)
				}
				const startChecking = () => {
					const token = ++checkToken
					frame.classList.remove('is-ready')
					const check = () => {
						if (token !== checkToken) {
							return
						}
						try {
							const win = iframe?.contentWindow
							if (!win) {
								window.setTimeout(check, 100)
								return
							}
							if (win.__COMPONENT_SHOT_READY__ || win.__COMPONENT_SHOT_ERROR__) {
								finish()
								return
							}
						} catch {
							finish()
							return
						}
						window.setTimeout(check, 100)
					}
					check()
				}

				iframe?.addEventListener('load', startChecking)
				startChecking()
			}

			for (const frame of document.querySelectorAll('[data-render-frame]')) {
				markFrameReady(frame)
			}

			let currentVersion
			const checkVersion = async () => {
				try {
					const response = await fetch('/api/version')
					const data = await response.json()
					if (currentVersion === undefined) {
						currentVersion = data.version
						return
					}
					if (data.version !== currentVersion) {
						window.location.reload()
					}
				} catch {}
			}
			window.setInterval(checkVersion, 1200)
			void checkVersion()
		</script>
	</body>
</html>`
}

const createHistoryGrid = (history: HistoryShot[]) => {
	if (history.length === 0) {
		return `<div class="empty-history">No screenshot history</div>`
	}

	return history
		.map(
			(shot) => `<a class="history-shot" href="${escapeAttribute(shot.url)}" target="_blank" rel="noreferrer">
				<img src="${escapeAttribute(shot.url)}" alt="${escapeAttribute(shot.filename)}" />
				<span>${escapeHtml(new Date(shot.updatedAt).toLocaleString())}</span>
			</a>`,
		)
		.join('\n')
}

const createScenarioDetailHtml = ({
	history,
	scenario,
}: {
	history: HistoryShot[]
	scenario: ComponentShotGalleryScenario
}) => `<!doctype html>
<html lang="en">
	<head>
		<meta charset="utf-8" />
		<meta name="viewport" content="width=device-width, initial-scale=1" />
		<title>${escapeHtml(scenario.name)} - Component Shot</title>
		<style>
			:root {
				color: #172033;
				background: #eef2f6;
				font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
				font-synthesis: none;
				text-rendering: optimizeLegibility;
			}

			* {
				box-sizing: border-box;
			}

			body {
				min-width: 320px;
				min-height: 100vh;
				margin: 0;
			}

			.app-shell {
				width: calc(100% - 32px);
				margin: 0 auto;
				padding: 16px 0;
			}

			header {
				display: flex;
				align-items: center;
				justify-content: space-between;
				gap: 16px;
				margin-bottom: 12px;
			}

			h1,
			h2,
			p {
				margin-top: 0;
			}

			h1 {
				margin-bottom: 6px;
				color: #111827;
				font-size: 1.8rem;
				line-height: 1.1;
				letter-spacing: 0;
			}

			.path {
				margin-bottom: 0;
				color: #506070;
				font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
				font-size: 0.86rem;
				overflow-wrap: anywhere;
			}

			.back-link {
				min-height: 36px;
				display: inline-flex;
				align-items: center;
				justify-content: center;
				padding: 0 12px;
				border: 1px solid #ccd6e3;
				border-radius: 7px;
				background: #ffffff;
				color: #172033;
				font-weight: 800;
				text-decoration: none;
			}

			.detail-actions {
				display: inline-flex;
				align-items: center;
				gap: 8px;
			}

			.delete-scenario {
				min-height: 36px;
				display: inline-flex;
				align-items: center;
				justify-content: center;
				padding: 0 12px;
				border: 1px solid #e9bec5;
				border-radius: 7px;
				background: #ffffff;
				color: #9f1239;
				font: inherit;
				font-weight: 800;
				cursor: pointer;
			}

			.detail-render {
				position: relative;
				height: 620px;
				overflow: hidden;
				border: 1px solid #d7dee8;
				border-radius: 8px;
				background: #ffffff;
				box-shadow: 0 10px 28px rgb(15 23 42 / 7%);
			}

			.detail-render iframe {
				width: 100%;
				height: 100%;
				border: 0;
				background: #ffffff;
				opacity: 0;
				transition: opacity 160ms ease;
			}

			.detail-render.is-ready iframe {
				opacity: 1;
			}

			.render-loading {
				position: absolute;
				inset: 0;
				display: grid;
				place-items: center;
				background: #ffffff;
				color: #64748b;
				font-weight: 800;
			}

			.detail-render.is-ready .render-loading {
				display: none;
			}

			.history-section {
				margin-top: 16px;
			}

			.history-section h2 {
				margin-bottom: 12px;
				color: #111827;
				font-size: 1.1rem;
				letter-spacing: 0;
			}

			.history-grid {
				display: grid;
				grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
				gap: 12px;
			}

			.history-shot {
				display: grid;
				overflow: hidden;
				border: 1px solid #d7dee8;
				border-radius: 8px;
				background: #ffffff;
				color: #506070;
				text-decoration: none;
			}

			.history-shot img {
				width: 100%;
				aspect-ratio: 16 / 10;
				object-fit: contain;
				background: #f8fbff;
				border-bottom: 1px solid #d7dee8;
			}

			.history-shot span,
			.empty-history {
				padding: 10px 12px;
				color: #506070;
				font-size: 0.84rem;
				font-weight: 700;
			}

			.empty-history {
				border: 1px solid #d7dee8;
				border-radius: 8px;
				background: #ffffff;
			}

			@media (max-width: 720px) {
				.app-shell {
					width: calc(100% - 24px);
					padding: 12px 0;
				}

				header {
					align-items: stretch;
					flex-direction: column;
				}

				.detail-actions {
					justify-content: flex-end;
				}

				.detail-render {
					height: 520px;
				}
			}
		</style>
	</head>
	<body>
		<main class="app-shell">
			<header>
				<div>
					<h1>${escapeHtml(scenario.name)}</h1>
					<p class="path">${escapeHtml(scenario.relativeScenarioPath)}</p>
				</div>
				<div class="detail-actions">
					<button class="delete-scenario" type="button" data-delete-scenario>Delete</button>
					<a class="back-link" href="/">Gallery</a>
				</div>
			</header>
			<section class="detail-render" data-render-frame aria-label="${escapeAttribute(scenario.name)} live render">
				<iframe title="${escapeAttribute(scenario.name)}" src="${escapeAttribute(scenario.renderUrl)}"></iframe>
				<div class="render-loading">Rendering...</div>
			</section>
			<section class="history-section" aria-label="Screenshot history">
				<h2>History</h2>
				<div class="history-grid">
					${createHistoryGrid(history)}
				</div>
			</section>
		</main>
		<script>
			const scenarioId = ${toInlineJson(scenario.id)}
			const scenarioName = ${toInlineJson(scenario.name)}
			const scenarioPath = ${toInlineJson(scenario.relativeScenarioPath)}
			const deleteButton = document.querySelector('[data-delete-scenario]')
			deleteButton?.addEventListener('click', async () => {
				if (!window.confirm('Delete scenario "' + scenarioName + '"?\\n' + scenarioPath)) {
					return
				}

				try {
					const response = await fetch('/api/scenarios/' + encodeURIComponent(scenarioId), {
						method: 'DELETE',
					})
					if (!response.ok) {
						let message = 'Delete failed'
						try {
							const data = await response.json()
							message = data.error || message
						} catch {
							message = await response.text()
						}
						throw new Error(message || 'Delete failed')
					}
					try {
						const pinnedKey = 'component-shot-gallery:pinned'
						const pinned = JSON.parse(localStorage.getItem(pinnedKey) || '[]')
						if (Array.isArray(pinned)) {
							localStorage.setItem(
								pinnedKey,
								JSON.stringify(pinned.filter((entry) => entry !== scenarioId)),
							)
						}
					} catch {}
					window.location.href = '/'
				} catch (error) {
					window.alert(error instanceof Error ? error.message : String(error))
				}
			})

			const frame = document.querySelector('[data-render-frame]')
			const finish = () => frame?.classList.add('is-ready')
			const check = () => {
				try {
					const win = frame?.querySelector('iframe')?.contentWindow
					if (!win) {
						window.setTimeout(check, 100)
						return
					}
					if (win.__COMPONENT_SHOT_READY__ || win.__COMPONENT_SHOT_ERROR__) {
						finish()
						return
					}
				} catch {
					finish()
					return
				}
				window.setTimeout(check, 100)
			}
			check()

			let currentVersion
			const checkVersion = async () => {
				try {
					const response = await fetch('/api/version')
					const data = await response.json()
					if (currentVersion === undefined) {
						currentVersion = data.version
						return
					}
					if (data.version !== currentVersion) {
						window.location.reload()
					}
				} catch {}
			}
			window.setInterval(checkVersion, 1200)
			void checkVersion()
		</script>
	</body>
</html>`

const sendContent = ({
	content,
	contentType,
	response,
}: {
	content: string
	contentType: string
	response: http.ServerResponse
}) => {
	response.statusCode = 200
	response.setHeader('Content-Type', contentType)
	response.end(content)
}

const sendJson = ({
	body,
	response,
	statusCode = 200,
}: {
	body: unknown
	response: http.ServerResponse
	statusCode?: number
}) => {
	response.statusCode = statusCode
	response.setHeader('Content-Type', 'application/json; charset=utf-8')
	response.end(`${JSON.stringify(body, null, 2)}\n`)
}

const sendNotFound = (response: http.ServerResponse) => {
	response.statusCode = 404
	response.end('Not found')
}

const sendMethodNotAllowed = (response: http.ServerResponse, methods: string[]) => {
	response.statusCode = 405
	response.setHeader('Allow', methods.join(', '))
	response.end('Method not allowed')
}

const sendFile = async ({
	filePath,
	response,
}: {
	filePath: string
	response: http.ServerResponse
}) => {
	try {
		const content = await fs.readFile(filePath)
		response.statusCode = 200
		response.setHeader('Content-Type', contentTypes[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream')
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

const sendRenderFile = async ({
	embed,
	filePath,
	response,
}: {
	embed?: string | null
	filePath: string
	response: http.ServerResponse
}) => {
	if (embed === 'preview' && path.basename(filePath) === 'index.html') {
		const html = await fs.readFile(filePath, 'utf8')
		sendContent({
			content: html.replace(
				'</head>',
				'<style data-component-shot-gallery-embed>html,body{width:100%;height:100%;overflow:hidden;}body{box-sizing:border-box;margin:0!important;padding:16px!important;}[data-component-shot-root]{transform-origin:top left;}</style></head>',
			),
			contentType: 'text/html; charset=utf-8',
			response,
		})
		return
	}

	await sendFile({ filePath, response })
}

const assertPathWithin = ({ candidate, root }: { candidate: string; root: string }) => {
	const resolvedCandidate = path.resolve(candidate)
	const resolvedRoot = path.resolve(root)
	return resolvedCandidate === resolvedRoot || resolvedCandidate.startsWith(`${resolvedRoot}${path.sep}`)
}

const removeEmptyParentDirs = async ({
	rootDir,
	startDir,
}: {
	rootDir: string
	startDir: string
}) => {
	const root = path.resolve(rootDir)
	let current = path.resolve(startDir)

	while (current !== root && assertPathWithin({ candidate: current, root })) {
		try {
			await fs.rmdir(current)
		} catch (error) {
			const code = typeof error === 'object' && error && 'code' in error ? error.code : undefined
			if (code === 'ENOENT') {
				current = path.dirname(current)
				continue
			}
			if (code === 'ENOTEMPTY' || code === 'EEXIST') {
				return
			}
			throw error
		}
		current = path.dirname(current)
	}
}

const canDeleteScenarioFile = (index: ComponentShotGalleryIndex, scenario: ComponentShotGalleryScenario) =>
	assertPathWithin({ candidate: scenario.scenarioPath, root: index.scenarioDir }) &&
	isScenarioFile(scenario.scenarioPath)

const deleteScenarioFiles = async (
	index: ComponentShotGalleryIndex,
	scenarios: ComponentShotGalleryScenario[],
) => {
	const scenarioPaths = uniquePaths(scenarios.map((scenario) => scenario.scenarioPath))
	const deleted: string[] = []

	for (const scenarioPath of scenarioPaths) {
		const scenario = scenarios.find((entry) => path.resolve(entry.scenarioPath) === path.resolve(scenarioPath))
		if (!scenario || !canDeleteScenarioFile(index, scenario)) {
			throw new Error(`Refusing to delete path outside scenario directory: ${scenarioPath}`)
		}

		await fs.rm(scenarioPath, { force: true })
		await removeEmptyParentDirs({
			rootDir: index.scenarioDir,
			startDir: path.dirname(scenarioPath),
		})
		deleted.push(toPosixPath(path.relative(index.cwd, scenarioPath)))
	}

	return deleted
}

const resolveBuildCommand = (build: GalleryBuild, context: GalleryBuildContext) =>
	typeof build === 'function' ? build(context) : build

const buildBundle = async ({ build, context }: { build: GalleryBuild; context: GalleryBuildContext }) => {
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
			stdio: ['ignore', 'pipe', 'pipe'],
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

const createRequestHandler = ({
	buildCache,
	getIndex,
	getVersion,
	options,
	refreshIndex,
	tempRoot,
}: {
	buildCache: Map<string, Promise<RenderBuild>>
	getIndex: GalleryState['getIndex']
	getVersion: GalleryState['getVersion']
	options: ResolvedGalleryOptions
	refreshIndex: () => Promise<ComponentShotGalleryIndex>
	tempRoot: string
}) => {
	const buildScenario = async (scenario: ComponentShotGalleryScenario): Promise<RenderBuild> => {
		const cached = buildCache.get(scenario.id)
		if (cached) {
			return cached
		}

		const buildPromise = (async () => {
			const publicDir = path.join(tempRoot, scenario.id, 'public')
			await fs.mkdir(publicDir, { recursive: true })
			const setup = await resolveSetupPath({
				cwd: options.cwd,
				scenarioDir: options.scenarioDir,
			})
			const build = createRspackBuild({
				publicPath: `/render/${scenario.id}/`,
				setup,
			})

			await buildBundle({
				build,
				context: {
					cwd: options.cwd,
					debug: false,
					publicDir,
					scenarioPath: scenario.scenarioPath,
				},
			})

			return {
				publicDir,
				scenario,
			}
		})().catch((error: unknown) => {
			buildCache.delete(scenario.id)
			throw error
		})

		buildCache.set(scenario.id, buildPromise)
		return buildPromise
	}

	return async (request: http.IncomingMessage, response: http.ServerResponse) => {
		const url = new URL(request.url ?? '/', 'http://127.0.0.1')
		const index = getIndex()

		if (url.pathname === '/favicon.ico') {
			response.statusCode = 204
			response.end()
			return
		}

		if (url.pathname === '/') {
			sendContent({
				content: createGalleryHtml(index),
				contentType: 'text/html; charset=utf-8',
				response,
			})
			return
		}

		if (url.pathname === '/api/version') {
			sendJson({ body: { version: getVersion() }, response })
			return
		}

		if (url.pathname === '/api/scenarios') {
			if (request.method === 'DELETE') {
				const deleted = await deleteScenarioFiles(index, index.scenarios)
				const nextIndex = await refreshIndex()
				sendJson({
					body: {
						deleted,
						scenarioCount: nextIndex.scenarios.length,
					},
					response,
				})
				return
			}

			if (request.method !== 'GET' && request.method !== 'HEAD') {
				sendMethodNotAllowed(response, ['GET', 'HEAD', 'DELETE'])
				return
			}

			sendJson({ body: index, response })
			return
		}

		const scenarioApiMatch = url.pathname.match(/^\/api\/scenarios\/([^/]+)\/?$/)
		if (scenarioApiMatch) {
			if (request.method !== 'DELETE') {
				sendMethodNotAllowed(response, ['DELETE'])
				return
			}

			const scenario = index.scenarios.find((entry) => entry.id === scenarioApiMatch[1])
			if (!scenario) {
				sendJson({ body: { error: 'Scenario not found' }, response, statusCode: 404 })
				return
			}

			if (!canDeleteScenarioFile(index, scenario)) {
				sendJson({ body: { error: 'Refusing to delete scenario outside scenario directory' }, response, statusCode: 403 })
				return
			}

			const deleted = await deleteScenarioFiles(index, [scenario])
			const nextIndex = await refreshIndex()
			sendJson({
				body: {
					deleted,
					scenarioCount: nextIndex.scenarios.length,
				},
				response,
			})
			return
		}

		const detailMatch = url.pathname.match(/^\/scenario\/([^/]+)\/?$/)
		if (detailMatch) {
			const scenario = index.scenarios.find((entry) => entry.id === detailMatch[1])
			if (!scenario) {
				sendNotFound(response)
				return
			}

			sendContent({
				content: createScenarioDetailHtml({
					history: await listHistoryShots(index, scenario),
					scenario,
				}),
				contentType: 'text/html; charset=utf-8',
				response,
			})
			return
		}

		const historyMatch = url.pathname.match(/^\/history\/([^/]+)\/(.+)$/)
		if (historyMatch) {
			const scenario = index.scenarios.find((entry) => entry.id === historyMatch[1])
			if (!scenario) {
				sendNotFound(response)
				return
			}

			const filename = decodeURIComponent(historyMatch[2])
			if (filename !== path.basename(filename)) {
				response.statusCode = 403
				response.end('Forbidden')
				return
			}

			const historyDir = getScenarioHistoryDir(index.screenshotsDir, scenario)
			const filePath = path.resolve(historyDir, filename)
			if (!assertPathWithin({ candidate: filePath, root: historyDir })) {
				response.statusCode = 403
				response.end('Forbidden')
				return
			}

			await sendFile({ filePath, response })
			return
		}

		const renderMatch = url.pathname.match(/^\/render\/([^/]+)\/?(.*)$/)
		if (renderMatch) {
			const scenario = index.scenarios.find((entry) => entry.id === renderMatch[1])
			if (!scenario) {
				sendNotFound(response)
				return
			}

			const renderBuild = await buildScenario(scenario)
			const relativePath = decodeURIComponent(renderMatch[2] || 'index.html')
			const filePath = path.resolve(renderBuild.publicDir, relativePath)
			if (!assertPathWithin({ candidate: filePath, root: renderBuild.publicDir })) {
				response.statusCode = 403
				response.end('Forbidden')
				return
			}

			await sendRenderFile({
				embed: url.searchParams.get('embed'),
				filePath,
				response,
			})
			return
		}

		sendNotFound(response)
	}
}

const closeHttpServer = (server: http.Server) =>
	new Promise<void>((resolve, reject) => {
		server.close((error) => {
			if (error) {
				reject(error)
				return
			}

			resolve()
		})
	})

const uniquePaths = (paths: string[]) => [...new Set(paths.map((entry) => path.resolve(entry)))]

const startGalleryWatchers = async ({
	onChange,
	options,
}: {
	onChange: () => void
	options: ResolvedGalleryOptions
}) => {
	const componentShotDir = findComponentShotDir(options.scenarioDir)
	const watchRoots = uniquePaths([componentShotDir ?? options.scenarioDir, options.screenshotsDir])
	const watchers: FSWatcher[] = []

	for (const root of watchRoots) {
		if (!(await pathExists(root))) {
			continue
		}

		try {
			watchers.push(
				watch(
					root,
					{
						recursive: true,
					},
					onChange,
				),
			)
		} catch {
			watchers.push(watch(root, onChange))
		}
	}

	return () => {
		for (const watcher of watchers) {
			watcher.close()
		}
	}
}

export const startComponentShotGallery = async (
	optionsInput: ComponentShotGalleryOptions = {},
): Promise<ComponentShotGalleryServer> => {
	const options = resolveGalleryOptions(optionsInput)
	let index = await createComponentShotGalleryIndex(options)
	let version = 0
	const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'component-shot-gallery-'))
	const buildCache = new Map<string, Promise<RenderBuild>>()
	const refreshIndex = async () => {
		index = await createComponentShotGalleryIndex(options)
		buildCache.clear()
		version += 1
		return index
	}
	let refreshTimer: NodeJS.Timeout | undefined
	const refresh = () => {
		if (refreshTimer) {
			clearTimeout(refreshTimer)
		}
		refreshTimer = setTimeout(() => {
			void (async () => {
				await refreshIndex()
			})().catch((error: unknown) => {
				process.stderr.write(
					`component-shot gallery refresh failed: ${error instanceof Error ? error.message : String(error)}\n`,
				)
			})
		}, 120)
	}
	const stopWatching = await startGalleryWatchers({ onChange: refresh, options })
	const handleRequest = createRequestHandler({
		buildCache,
		getIndex: () => index,
		getVersion: () => version,
		options,
		refreshIndex,
		tempRoot,
	})
	const server = http.createServer((request, response) => {
		void handleRequest(request, response).catch((error: unknown) => {
			response.statusCode = 500
			response.setHeader('Content-Type', 'text/plain; charset=utf-8')
			response.end(error instanceof Error ? error.stack ?? error.message : String(error))
		})
	})

	await new Promise<void>((resolve, reject) => {
		const handleError = (error: Error) => {
			server.off('listening', handleListening)
			reject(error)
		}
		const handleListening = () => {
			server.off('error', handleError)
			resolve()
		}

		server.once('error', handleError)
		server.once('listening', handleListening)
		server.listen(options.port, options.host)
	})

	const address = server.address()
	if (!address || typeof address === 'string') {
		throw new Error('Unable to read component-shot gallery server address')
	}

	return {
		close: async () => {
			stopWatching()
			if (refreshTimer) {
				clearTimeout(refreshTimer)
			}
			await closeHttpServer(server)
			await fs.rm(tempRoot, { force: true, recursive: true })
		},
		index,
		server,
		url: `http://${options.host}:${address.port}`,
	}
}

const openUrl = (url: string) => {
	const command =
		process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open'
	const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url]
	const child = spawn(command, args, {
		detached: true,
		stdio: 'ignore',
	})
	child.on('error', () => {})
	child.unref()
}

const waitForShutdownSignal = () =>
	new Promise<void>((resolve) => {
		const cleanup = () => {
			process.off('SIGINT', cleanup)
			process.off('SIGTERM', cleanup)
			resolve()
		}

		process.once('SIGINT', cleanup)
		process.once('SIGTERM', cleanup)
	})

export const runComponentShotGalleryCli = async ({
	argv = process.argv.slice(2),
	usageCommand = 'component-shot gallery [options]',
}: {
	argv?: string[]
	usageCommand?: string
} = {}) => {
	const options = parseGalleryCliArgs({ argv, usageCommand })
	const { json: _json, ...galleryOptions } = options
	const gallery = await startComponentShotGallery(galleryOptions)

	const startupDetails = {
		scenarioCount: gallery.index.scenarios.length,
		scenarioDir: gallery.index.scenarioDir,
		url: gallery.url,
	}

	if (options.json) {
		process.stdout.write(`${JSON.stringify(startupDetails)}\n`)
	} else {
		process.stdout.write(`Component Shot gallery: ${gallery.url}\n`)
		process.stdout.write('Press Ctrl+C to stop.\n')
	}

	if (options.open) {
		openUrl(gallery.url)
	}

	await waitForShutdownSignal()
	await gallery.close()
}
