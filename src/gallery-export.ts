import { randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { listHistory } from './artifacts.js'
import { resolveComponentShotCliWorkspace } from './cli-workspace.js'
import {
	createStaticGalleryHtml,
	type ComponentShotStaticGalleryScenario,
} from './gallery-export-ui.js'
import {
	assertPathWithin,
	isPathWithin,
	listScenarioFiles,
	pathExists,
	type ComponentShotScenarioInfo,
} from './scenarios.js'
import {
	ComponentShotError,
	type ComponentShotDiagnostic,
	type ComponentShotDiagnosticStage,
	type ComponentShotSessionOptions,
} from './session.js'
import { createComponentShotWorkspace } from './workspace.js'

const defaultGalleryExportFilename = 'component-shot-gallery.html'
const defaultGalleryHistoryByteLimit = 128 * 1024 * 1024

export type ComponentShotGalleryExportOptions = Omit<
	ComponentShotSessionOptions,
	'allowExternalOutput' | 'keepTemp'
> & {
	includeHistory?: boolean
	maxHistoryBytes?: number
	output?: string
	overwrite?: boolean
	title?: string
}

export type ComponentShotGalleryExportFailure = {
	id: string
	message: string
	name: string
	stage: ComponentShotDiagnosticStage | 'unknown'
}

export type ComponentShotGalleryExportWarning = {
	filename?: string
	id: string
	kind: 'history'
	message: string
	name: string
	stage: 'artifact'
}

export type ComponentShotGalleryExportResult = {
	bytes: number
	capturedCount: number
	failedCount: number
	failures: ComponentShotGalleryExportFailure[]
	historyBytes: number
	historyCount: number
	historyWarningCount: number
	outputPath: string
	projectRoot: string
	scenarioCount: number
	warnings: ComponentShotGalleryExportWarning[]
}

type ParsedGalleryExportOptions = {
	browserChannel?: string
	cwd?: string
	help: boolean
	includeHistory?: boolean
	json: boolean
	maxHistoryBytes?: number
	output?: string
	overwrite?: boolean
	scenarioDir?: string
	screenshotsDir?: string
	setup?: string
}

const createGalleryExportUsage = (usageCommand: string) => `Usage:
  ${usageCommand}

Exports a fresh, self-contained HTML snapshot of every discovered scenario.

Options:
  --output <path>           Project-relative HTML file. Defaults to ${defaultGalleryExportFilename}.
  --include-history         Embed existing saved screenshot history.
  --max-history-bytes <n>   Maximum raw history PNG bytes. Defaults to ${defaultGalleryHistoryByteLimit}.
  --overwrite               Replace an existing output file.
  --cwd <path>              Project or search root. One nested project is auto-discovered.
  --scenario-dir <path>     Scenario directory. Defaults to component-shot/scenarios.
  --screenshots-dir <path>  Saved screenshot history directory.
  --setup <path>            React provider setup module.
  --browser-channel <id>    System browser channel, for example chrome.
  --json                    Print machine-readable output.
  --help                    Show this help message.`

const readFlagValue = (args: string[], index: number, flag: string): [string, number] => {
	const inlineValue = flag.includes('=') ? flag.slice(flag.indexOf('=') + 1) : undefined
	if (inlineValue) return [inlineValue, index]
	const value = args[index + 1]
	if (!value || value.startsWith('--')) throw new Error(`Missing value for ${flag}`)
	return [value, index + 1]
}

const parseGalleryExportCliArgs = ({
	argv,
	usageCommand,
}: {
	argv: string[]
	usageCommand: string
}): ParsedGalleryExportOptions => {
	const parsed: ParsedGalleryExportOptions = { help: false, json: false }
	const usage = createGalleryExportUsage(usageCommand)
	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index] ?? ''
		const flag = arg.includes('=') ? arg.slice(0, arg.indexOf('=')) : arg
		switch (flag) {
			case '--browser-channel': {
				const [value, next] = readFlagValue(argv, index, arg)
				parsed.browserChannel = value
				index = next
				break
			}
			case '--cwd': {
				const [value, next] = readFlagValue(argv, index, arg)
				parsed.cwd = value
				index = next
				break
			}
			case '--help':
			case '-h':
				if (arg.includes('=')) throw new Error(`${flag} does not accept a value`)
				parsed.help = true
				break
			case '--include-history':
				if (arg.includes('=')) throw new Error(`${flag} does not accept a value`)
				parsed.includeHistory = true
				break
			case '--json':
				if (arg.includes('=')) throw new Error(`${flag} does not accept a value`)
				parsed.json = true
				break
			case '--max-history-bytes': {
				const [value, next] = readFlagValue(argv, index, arg)
				if (!/^\d+$/.test(value)) {
					throw new Error('--max-history-bytes must be a non-negative integer')
				}
				const bytes = Number(value)
				if (!Number.isSafeInteger(bytes)) {
					throw new Error('--max-history-bytes must be a safe integer')
				}
				parsed.maxHistoryBytes = bytes
				index = next
				break
			}
			case '--output': {
				const [value, next] = readFlagValue(argv, index, arg)
				parsed.output = value
				index = next
				break
			}
			case '--overwrite':
				if (arg.includes('=')) throw new Error(`${flag} does not accept a value`)
				parsed.overwrite = true
				break
			case '--scenario-dir': {
				const [value, next] = readFlagValue(argv, index, arg)
				parsed.scenarioDir = value
				index = next
				break
			}
			case '--screenshots-dir': {
				const [value, next] = readFlagValue(argv, index, arg)
				parsed.screenshotsDir = value
				index = next
				break
			}
			case '--setup': {
				const [value, next] = readFlagValue(argv, index, arg)
				parsed.setup = value
				index = next
				break
			}
			default:
				throw new Error(`Unknown gallery export option "${arg}"\n\n${usage}`)
		}
	}
	return parsed
}

const stageFromError = (error: unknown): ComponentShotGalleryExportFailure['stage'] =>
	typeof error === 'object' &&
	error !== null &&
	'stage' in error &&
	typeof error.stage === 'string'
		? (error.stage as ComponentShotDiagnosticStage)
		: 'unknown'

const commonPosixPathRoots = new Set([
	'applications',
	'etc',
	'home',
	'library',
	'mnt',
	'nix',
	'opt',
	'private',
	'root',
	'srv',
	'system',
	'tmp',
	'users',
	'usr',
	'var',
	'volumes',
])

const commonWindowsPathRoots = new Set([
	'documents and settings',
	'program files',
	'program files (x86)',
	'system32',
	'users',
	'windows',
])

const pathSegments = (value: string) =>
	value
		.split(/[\\/]/)
		.map((segment) => segment.trim())
		.filter(Boolean)

const isLikelyAbsoluteMachinePath = (value: string, wrapped = false) => {
	const candidate = value.trim()
	if (/^[a-z]:[\\/]/i.test(candidate) || /^~[\\/]/.test(candidate)) return true
	if (candidate.startsWith('\\\\')) {
		return pathSegments(candidate.slice(2)).length >= 2
	}
	if (candidate.startsWith('\\')) {
		const segments = pathSegments(candidate.slice(1))
		return (
			(wrapped && segments.length >= 2) ||
			(segments[0] ? commonWindowsPathRoots.has(segments[0].toLowerCase()) : false)
		)
	}
	if (candidate.startsWith('/')) {
		const segments = pathSegments(candidate.slice(1))
		return (
			(wrapped && segments.length >= 2) ||
			(segments[0] ? commonPosixPathRoots.has(segments[0].toLowerCase()) : false)
		)
	}
	return false
}

const redactWrappedMachinePaths = (value: string) =>
	value
		.replace(/<([^<>\r\n]*)>/g, (match, candidate: string) =>
			isLikelyAbsoluteMachinePath(candidate, true) ? '<[path]>' : match,
		)
		.replace(/(["'`])([^"'`\r\n]*)\1/g, (match, wrapper: string, candidate: string) =>
			isLikelyAbsoluteMachinePath(candidate, true) ? `${wrapper}[path]${wrapper}` : match,
		)

const redactUnwrappedMachinePaths = (value: string) =>
	value.replace(
		/(^|[^a-z0-9_./\\])((?:[a-z]:[\\/]|~?[\\/])[^\r\n"'`<>,;]*)/gi,
		(match, boundary: string, candidate: string) =>
			isLikelyAbsoluteMachinePath(candidate) ? `${boundary}[path]` : match,
	)

const sanitizeMessage = (value: unknown, projectRoot: string) => {
	const raw = value instanceof Error ? value.message : String(value)
	const firstLine = raw.split(/\r?\n/, 1)[0] ?? ''
	const withoutAnsi = firstLine.replace(/\u001b\[[0-9;]*m/g, '')
	const withoutProjectPath = withoutAnsi.split(projectRoot).join('.')
	const withoutUrls = withoutProjectPath.replace(/\b(?:file|https?):\/\/\S+/gi, '[url]')
	const withoutWrappedPaths = redactWrappedMachinePaths(withoutUrls)
	const withoutUnwrappedPaths = redactUnwrappedMachinePaths(withoutWrappedPaths)
	return withoutUnwrappedPaths
		.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
		.slice(0, 1_000)
}

const sanitizeDiagnostics = (
	diagnostics: readonly ComponentShotDiagnostic[],
	projectRoot: string,
): ComponentShotStaticGalleryScenario['diagnostics'] =>
	diagnostics.map((diagnostic) => ({
		message: sanitizeMessage(diagnostic.message, projectRoot),
		severity: diagnostic.severity,
		stage: diagnostic.stage,
	}))

const pngDataUrl = (bytes: Buffer) => `data:image/png;base64,${bytes.toString('base64')}`

type GalleryHistoryBudget = {
	limit: number
	used: number
}

type GalleryHistoryReadError = {
	error: unknown
	filename?: string
}

const readHistory = async ({
	budget,
	scenario,
	screenshotsDir,
}: {
	budget: GalleryHistoryBudget
	scenario: ComponentShotScenarioInfo
	screenshotsDir: string
}): Promise<{
	errors: GalleryHistoryReadError[]
	history: ComponentShotStaticGalleryScenario['history']
}> => {
	const history = await listHistory({ scenario, screenshotsDir })
	const embeddedHistory: ComponentShotStaticGalleryScenario['history'][number][] = []
	const errors: GalleryHistoryReadError[] = []
	for (const entry of history) {
		try {
			const stats = await fs.stat(entry.path)
			const remainingBytes = budget.limit - budget.used
			if (stats.size > remainingBytes) {
				throw new ComponentShotError(
					'artifact',
					`History embedding limit of ${budget.limit} bytes was reached before ${entry.filename}`,
				)
			}
			const bytes = await fs.readFile(entry.path)
			if (bytes.length > remainingBytes) {
				throw new ComponentShotError(
					'artifact',
					`History embedding limit of ${budget.limit} bytes was reached before ${entry.filename}`,
				)
			}
			embeddedHistory.push({
				dataUrl: pngDataUrl(bytes),
				filename: entry.filename,
				updatedAt: entry.updatedAt,
			})
			budget.used += bytes.length
		} catch (error) {
			errors.push({ error, filename: entry.filename })
		}
	}
	return { errors, history: embeddedHistory }
}

const resolvePublishPath = async ({
	outputPath,
	projectRoot,
}: {
	outputPath: string
	projectRoot: string
}) => {
	await assertPathWithin({
		candidate: outputPath,
		label: 'Gallery export path',
		root: projectRoot,
	})
	const [realProjectRoot, realOutputParent] = await Promise.all([
		fs.realpath(projectRoot),
		fs.realpath(path.dirname(outputPath)),
	])
	if (!isPathWithin({ candidate: realOutputParent, root: realProjectRoot })) {
		throw new ComponentShotError(
			'artifact',
			'Gallery export path resolves outside the project root',
		)
	}
	return path.join(realOutputParent, path.basename(outputPath))
}

const writeExportFile = async ({
	contents,
	outputPath,
	overwrite,
	projectRoot,
}: {
	contents: string
	outputPath: string
	overwrite: boolean
	projectRoot: string
}) => {
	const publishPath = await resolvePublishPath({ outputPath, projectRoot })
	const stagingPath = path.join(
		path.dirname(publishPath),
		`.${path.basename(publishPath)}.${randomUUID()}.tmp`,
	)
	try {
		await fs.writeFile(stagingPath, contents, 'utf8')
		if (!overwrite) {
			try {
				await fs.link(stagingPath, publishPath)
			} catch (error) {
				const code =
					typeof error === 'object' && error !== null && 'code' in error
						? error.code
						: undefined
				if (code === 'EEXIST') {
					throw new ComponentShotError(
						'artifact',
						`Gallery export already exists: ${outputPath}. Pass --overwrite to replace it.`,
					)
				}
				throw error
			}
			return
		}

		try {
			await fs.rename(stagingPath, publishPath)
		} catch (error) {
			const code =
				typeof error === 'object' && error !== null && 'code' in error
					? error.code
					: undefined
			if ((code !== 'EEXIST' && code !== 'EPERM') || !(await pathExists(publishPath))) {
				throw error
			}
			const backupPath = `${publishPath}.${randomUUID()}.bak`
			await fs.rename(publishPath, backupPath)
			try {
				await fs.rename(stagingPath, publishPath)
			} catch (publishError) {
				if (!(await pathExists(publishPath))) {
					await fs.rename(backupPath, publishPath).catch(() => {})
				}
				throw publishError
			}
			await fs.rm(backupPath, { force: true }).catch(() => {})
		}
	} finally {
		await fs.rm(stagingPath, { force: true })
	}
}

export const exportComponentShotGallery = async (
	options: ComponentShotGalleryExportOptions = {},
): Promise<ComponentShotGalleryExportResult> => {
	const {
		includeHistory = false,
		maxHistoryBytes = defaultGalleryHistoryByteLimit,
		output = defaultGalleryExportFilename,
		overwrite = false,
		title,
		...sessionOptions
	} = options
	if (!Number.isSafeInteger(maxHistoryBytes) || maxHistoryBytes < 0) {
		throw new ComponentShotError(
			'artifact',
			'Gallery export maxHistoryBytes must be a non-negative safe integer',
		)
	}
	const workspace = await createComponentShotWorkspace({
		...sessionOptions,
		allowExternalOutput: false,
	})
	const outputPath = await assertPathWithin({
		candidate: path.resolve(workspace.cwd, output),
		label: 'Gallery export path',
		root: workspace.cwd,
	})
	if (path.extname(outputPath).toLowerCase() !== '.html') {
		throw new ComponentShotError('artifact', 'Gallery export output must end in .html')
	}
	await fs.mkdir(path.dirname(outputPath), { recursive: true })
	await assertPathWithin({
		candidate: outputPath,
		label: 'Gallery export path',
		root: workspace.cwd,
	})
	if (!overwrite && (await pathExists(outputPath))) {
		throw new ComponentShotError(
			'artifact',
			`Gallery export already exists: ${outputPath}. Pass --overwrite to replace it.`,
		)
	}

	const scenarios = await listScenarioFiles({
		cwd: workspace.cwd,
		scenarioDir: workspace.scenarioDir,
		screenshotsDir: workspace.screenshotsDir,
	})
	const failures: ComponentShotGalleryExportFailure[] = []
	const warnings: ComponentShotGalleryExportWarning[] = []
	const historyBudget: GalleryHistoryBudget = { limit: maxHistoryBytes, used: 0 }
	const exportedScenarios: ComponentShotStaticGalleryScenario[] = []
	const session = await workspace.createSession()
	try {
		for (const scenario of scenarios) {
			let captured: Omit<ComponentShotStaticGalleryScenario, 'history'>
			try {
				const result = await session.capture({
					save: false,
					scenario: scenario.scenarioPath,
				})
				captured = {
					artifactKey: scenario.artifactKey,
					diagnostics: sanitizeDiagnostics(result.diagnostics, workspace.cwd),
					id: scenario.id,
					image: {
						dataUrl: pngDataUrl(await fs.readFile(result.outputPath)),
						viewport: result.viewport,
					},
					metadata: {
						description: result.metadata.description,
						tags: result.metadata.tags,
						title: result.metadata.title,
					},
					name: scenario.name,
					relativePath: scenario.relativePath,
					routeId: scenario.routeId,
				}
			} catch (error) {
				const failure = {
					id: scenario.id,
					message: sanitizeMessage(error, workspace.cwd),
					name: scenario.name,
					stage: stageFromError(error),
				}
				failures.push(failure)
				captured = {
					artifactKey: scenario.artifactKey,
					error: failure,
					id: scenario.id,
					name: scenario.name,
					relativePath: scenario.relativePath,
					routeId: scenario.routeId,
				}
			}

			let history: ComponentShotStaticGalleryScenario['history'] = []
			if (includeHistory) {
				try {
					const historyResult = await readHistory({
						budget: historyBudget,
						scenario,
						screenshotsDir: workspace.screenshotsDir,
					})
					history = historyResult.history
					if (historyResult.errors.length > 0) {
						const historyWarnings = historyResult.errors.map(
							({ error, filename }): ComponentShotGalleryExportWarning => ({
								filename,
								id: scenario.id,
								kind: 'history',
								message: sanitizeMessage(error, workspace.cwd),
								name: scenario.name,
								stage: 'artifact',
							}),
						)
						warnings.push(...historyWarnings)
						captured.diagnostics = [
							...(captured.diagnostics ?? []),
							...historyWarnings.map((warning) => ({
								message: warning.message,
								severity: 'warning' as const,
								stage: 'artifact',
							})),
						]
					}
				} catch (error) {
					const warning: ComponentShotGalleryExportWarning = {
						id: scenario.id,
						kind: 'history',
						message: sanitizeMessage(error, workspace.cwd),
						name: scenario.name,
						stage: 'artifact',
					}
					warnings.push(warning)
					captured.diagnostics = [
						...(captured.diagnostics ?? []),
						{
							message: warning.message,
							severity: 'warning',
							stage: 'artifact',
						},
					]
				}
			}
			exportedScenarios.push({ ...captured, history })
		}
	} finally {
		await session.close()
	}

	const exportedAt = new Date().toISOString()
	const html = createStaticGalleryHtml({
		exportedAt,
		scenarios: exportedScenarios,
		title: title ?? 'Component Shot gallery',
	})
	await writeExportFile({
		contents: html,
		outputPath,
		overwrite,
		projectRoot: workspace.cwd,
	})
	const historyCount = exportedScenarios.reduce(
		(total, scenario) => total + scenario.history.length,
		0,
	)
	return {
		bytes: Buffer.byteLength(html),
		capturedCount: scenarios.length - failures.length,
		failedCount: failures.length,
		failures,
		historyBytes: historyBudget.used,
		historyCount,
		historyWarningCount: warnings.length,
		outputPath,
		projectRoot: workspace.cwd,
		scenarioCount: scenarios.length,
		warnings,
	}
}

export const runComponentShotGalleryExportCli = async ({
	argv = process.argv.slice(2),
	options: baseOptions = {},
	usageCommand = 'component-shot gallery export [options]',
}: {
	argv?: string[]
	options?: ComponentShotGalleryExportOptions
	usageCommand?: string
} = {}) => {
	const parsed = parseGalleryExportCliArgs({ argv, usageCommand })
	if (parsed.help) {
		process.stdout.write(`${createGalleryExportUsage(usageCommand)}\n`)
		return
	}
	const {
		help: _help,
		json,
		...cliOptions
	} = parsed
	const requestedOptions = { ...baseOptions, ...cliOptions }
	const resolvedWorkspace = await resolveComponentShotCliWorkspace(requestedOptions)
	const result = await exportComponentShotGallery({
		...requestedOptions,
		cwd: resolvedWorkspace.cwd,
		scenarioDir: resolvedWorkspace.scenarioDir,
	})
	if (json) {
		process.stdout.write(`${JSON.stringify(result)}\n`)
	} else {
		process.stdout.write(`Exported Component Shot gallery: ${result.outputPath}\n`)
		process.stdout.write(
			`${result.capturedCount}/${result.scenarioCount} scenarios captured` +
				(result.historyCount ? `, ${result.historyCount} history images included` : '') +
				'.\n',
		)
		if (result.failedCount) {
			process.stderr.write(
				`${result.failedCount} scenario${result.failedCount === 1 ? '' : 's'} failed to capture; failure cards were included in the export.\n`,
			)
		}
		if (result.historyWarningCount) {
			process.stderr.write(
				`${result.historyWarningCount} history warning${result.historyWarningCount === 1 ? '' : 's'} reported; warning details were included in the export.\n`,
			)
		}
	}
	if (result.failedCount > 0 || result.historyWarningCount > 0) process.exitCode = 1
	return result
}
