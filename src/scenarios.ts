import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

export const defaultScenarioDir = 'component-shot/scenarios'
export const defaultScreenshotsDir = 'component-shot/screenshots'
export const setupFilenames = ['setup.tsx', 'setup.ts', 'setup.jsx', 'setup.js'] as const

const scenarioExtensions = new Set(['.js', '.jsx', '.ts', '.tsx'])

export type ComponentShotWorkspacePaths = {
	cwd: string
	scenarioDir: string
	screenshotsDir: string
}

export type ComponentShotScenarioInfo = {
	artifactKey: string
	historyCount: number
	id: string
	name: string
	relativePath: string
	routeId: string
	scenarioPath: string
}

export const toPosixPath = (value: string) => value.split(path.sep).join('/')

export const sanitizePathSegment = (value: string) =>
	value
		.replace(/[^a-z0-9_.-]+/gi, '-')
		.replace(/^-+|-+$/g, '')
		.toLowerCase() || 'component-shot'

export const encodeScenarioId = (value: string) => Buffer.from(value).toString('base64url')

export const pathExists = async (filePath: string) => {
	try {
		await fs.access(filePath)
		return true
	} catch (error) {
		const code = typeof error === 'object' && error && 'code' in error ? error.code : undefined
		if (code === 'ENOENT' || code === 'ENOTDIR') {
			return false
		}
		throw error
	}
}

export const isPathWithin = ({ candidate, root }: { candidate: string; root: string }) => {
	const resolvedCandidate = path.resolve(candidate)
	const resolvedRoot = path.resolve(root)
	return resolvedCandidate === resolvedRoot || resolvedCandidate.startsWith(`${resolvedRoot}${path.sep}`)
}

const resolveRealPathForPotentialFile = async (candidate: string) => {
	let current = path.resolve(candidate)
	const missingSegments: string[] = []

	while (true) {
		try {
			await fs.lstat(current)
			let realCurrent: string
			try {
				realCurrent = await fs.realpath(current)
			} catch (error) {
				const code = typeof error === 'object' && error && 'code' in error ? error.code : undefined
				if (code === 'ENOENT' || code === 'ENOTDIR') {
					throw new Error(`${candidate} resolves through a dangling symbolic link`, { cause: error })
				}
				throw error
			}
			return path.join(realCurrent, ...missingSegments)
		} catch (error) {
			const code = typeof error === 'object' && error && 'code' in error ? error.code : undefined
			if (code !== 'ENOENT' && code !== 'ENOTDIR') throw error
			const parent = path.dirname(current)
			if (parent === current) {
				throw new Error(`Unable to resolve an existing parent for ${candidate}`)
			}
			missingSegments.unshift(path.basename(current))
			current = parent
		}
	}
}

export const assertPathWithin = async ({
	candidate,
	label = 'path',
	root,
}: {
	candidate: string
	label?: string
	root: string
}) => {
	const resolvedRoot = path.resolve(root)
	const resolvedCandidate = path.resolve(candidate)
	if (!isPathWithin({ candidate: resolvedCandidate, root: resolvedRoot })) {
		throw new Error(`${label} must stay within ${resolvedRoot}`)
	}

	await fs.mkdir(resolvedRoot, { recursive: true })
	const [realRoot, realCandidate] = await Promise.all([
		fs.realpath(resolvedRoot),
		resolveRealPathForPotentialFile(resolvedCandidate),
	])
	if (!isPathWithin({ candidate: realCandidate, root: realRoot })) {
		throw new Error(`${label} resolves outside ${realRoot}`)
	}

	return resolvedCandidate
}

export const findComponentShotDir = (inputPath: string) => {
	let current = path.resolve(inputPath)

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

export const findSetupPath = async (componentShotDir: string) => {
	for (const filename of setupFilenames) {
		const candidate = path.join(componentShotDir, filename)
		if (await pathExists(candidate)) {
			return candidate
		}
	}
	return undefined
}

export const resolveSetupPath = async ({
	cwd,
	scenarioDir,
	scenarioPath,
	setup,
}: {
	cwd: string
	scenarioDir?: string
	scenarioPath: string
	setup?: string
}) => {
	if (setup) {
		return path.resolve(cwd, setup)
	}
	if (scenarioDir) {
		const workspaceSetup = await findSetupPath(path.dirname(scenarioDir))
		if (workspaceSetup) return workspaceSetup
	}

	const componentShotDir = findComponentShotDir(path.dirname(scenarioPath))
	if (componentShotDir) {
		const discovered = await findSetupPath(componentShotDir)
		if (discovered) {
			return discovered
		}
	}

	const defaultComponentShotDir = path.join(cwd, 'component-shot')
	return findSetupPath(defaultComponentShotDir)
}

export const resolveWorkspacePaths = ({
	cwd: cwdInput,
	scenarioDir: scenarioDirInput,
	screenshotsDir: screenshotsDirInput,
}: {
	cwd?: string
	scenarioDir?: string
	screenshotsDir?: string
} = {}): ComponentShotWorkspacePaths => {
	const cwd = path.resolve(process.cwd(), cwdInput ?? '.')
	const scenarioDir = path.resolve(cwd, scenarioDirInput ?? defaultScenarioDir)
	const scenarioParent = path.dirname(scenarioDir)
	const discoveredComponentShotDir = findComponentShotDir(scenarioDir)
	const componentShotDir =
		discoveredComponentShotDir &&
		(discoveredComponentShotDir !== cwd || scenarioParent === cwd)
			? discoveredComponentShotDir
			: scenarioParent
	const screenshotsDir = screenshotsDirInput
		? path.resolve(cwd, screenshotsDirInput)
		: path.join(componentShotDir, 'screenshots')

	return { cwd, scenarioDir, screenshotsDir }
}

export const isScenarioFile = (filePath: string) =>
	scenarioExtensions.has(path.extname(filePath).toLowerCase()) && !filePath.endsWith('.d.ts')

const readDirOrEmpty = async (dir: string) => {
	try {
		return await fs.readdir(dir, { withFileTypes: true })
	} catch (error) {
		const code = typeof error === 'object' && error && 'code' in error ? error.code : undefined
		if (code === 'ENOENT' || code === 'ENOTDIR') {
			return []
		}
		throw error
	}
}

const ignoredScenarioDirectories = new Set(['.component-shot-preview', 'node_modules'])

export const walkScenarioFiles = async (dir: string): Promise<string[]> => {
	const entries = await readDirOrEmpty(dir)
	const files = await Promise.all(
		entries.map(async (entry) => {
			if (entry.name.startsWith('.') && entry.name !== '.states') {
				return []
			}
			const entryPath = path.join(dir, entry.name)
			if (entry.isDirectory() && !ignoredScenarioDirectories.has(entry.name)) {
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

const getScenarioStem = (scenarioDir: string, scenarioPath: string) => {
	const relative = path.relative(scenarioDir, scenarioPath)
	const withoutExtension = relative.slice(0, Math.max(0, relative.length - path.extname(relative).length))
	return withoutExtension || path.basename(scenarioPath, path.extname(scenarioPath))
}

const createArtifactSegment = (segment: string) => {
	const sanitized = sanitizePathSegment(segment)
	if (sanitized === segment) return sanitized
	const hash = createHash('sha256').update(segment).digest('hex').slice(0, 8)
	return `${sanitized}-${hash}`
}

export const getScenarioInfo = ({
	cwd,
	scenarioDir,
	scenarioPath,
	historyCount = 0,
}: {
	cwd: string
	historyCount?: number
	scenarioDir: string
	scenarioPath: string
}): ComponentShotScenarioInfo => {
	const stem = isPathWithin({ candidate: scenarioPath, root: scenarioDir })
		? getScenarioStem(scenarioDir, scenarioPath)
		: path.basename(scenarioPath, path.extname(scenarioPath))
	const id = toPosixPath(stem)
	const artifactKey = id
		.split('/')
		.filter(Boolean)
		.map(createArtifactSegment)
		.join('/')
	const basename = path.basename(scenarioPath, path.extname(scenarioPath))
	const name = basename === 'index' ? path.basename(path.dirname(scenarioPath)) : basename

	return {
		artifactKey: artifactKey || sanitizePathSegment(name),
		historyCount,
		id,
		name,
		relativePath: toPosixPath(path.relative(cwd, scenarioPath)),
		routeId: encodeScenarioId(id),
		scenarioPath,
	}
}

export const resolveSourceScenarioPath = async ({
	cwd,
	name,
	scenario,
	scenarioDir,
}: {
	cwd: string
	name?: string
	scenario?: string
	scenarioDir: string
}) => {
	await fs.mkdir(scenarioDir, { recursive: true })
	let candidate: string
	if (scenario) {
		const cwdRelative = path.resolve(cwd, scenario)
		candidate = isPathWithin({ candidate: cwdRelative, root: scenarioDir })
			? cwdRelative
			: path.resolve(scenarioDir, scenario)
	} else {
		const stem = sanitizePathSegment(name ?? `source-${new Date().toISOString()}`)
		candidate = path.join(scenarioDir, `${stem}.tsx`)
	}
	if (!path.extname(candidate)) {
		candidate = `${candidate}.tsx`
	}
	if (!isScenarioFile(candidate)) {
		throw new Error('Scenario source path must end in .tsx, .ts, .jsx, or .js')
	}

	return assertPathWithin({ candidate, label: 'Scenario source path', root: scenarioDir })
}

export const listScenarioFiles = async (paths: ComponentShotWorkspacePaths) => {
	const files = await walkScenarioFiles(paths.scenarioDir)
	files.sort((left, right) => left.localeCompare(right))
	return files.map((scenarioPath) => getScenarioInfo({ ...paths, scenarioPath }))
}
