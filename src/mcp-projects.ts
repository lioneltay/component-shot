import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import type { ComponentShotBuild, ComponentShotRenderProtocol } from './build-types.js'
import type { ComponentShotRspackOptions } from './rspack.js'
import {
	findComponentShotDir,
	findSetupPath,
	isPathWithin,
	isScenarioFile,
	pathExists,
} from './scenarios.js'
import {
	ComponentShotError,
	type ComponentShotSession,
	type ComponentShotSessionOptions,
} from './session.js'
import { createComponentShotWorkspace } from './workspace.js'
import { startWorkspaceWatcher } from './workspace-watcher.js'

export type ComponentShotMcpProjectOptions = {
	browserChannel?: string
	build?: ComponentShotBuild
	cwd?: string
	defaults?: ComponentShotSessionOptions['defaults']
	protocol?: Partial<ComponentShotRenderProtocol>
	rspack?: ComponentShotRspackOptions | false
	watchSourceChanges?: boolean
}

export type ComponentShotMcpSetup =
	| { mode: 'configured'; path: string }
	| { mode: 'custom-build' }
	| { mode: 'default' }
	| { mode: 'project'; path: string }

export type ComponentShotMcpProjectRuntime = {
	getSetup: () => Promise<ComponentShotMcpSetup>
	projectRoot: string
	runCapture: <Result>(
		observedPaths: string[],
		operation: () => Promise<Result>,
	) => Promise<Result>
	session: ComponentShotSession
}

type ComponentShotMcpInternalProjectRuntime = ComponentShotMcpProjectRuntime & {
	close: () => Promise<void>
}

type ProjectReference = {
	project?: string
}

type ScenarioReference = ProjectReference & {
	path: string
}

type PersistedSourceReference = ProjectReference & {
	persistAs: string
}

export type ComponentShotMcpProjectRegistry = {
	close: () => Promise<void>
	resolvePersistedSource: (
		target: PersistedSourceReference,
	) => Promise<{ project: ComponentShotMcpProjectRuntime; scenario: string }>
	resolveScenario: (
		target: ScenarioReference,
	) => Promise<{ project: ComponentShotMcpProjectRuntime; scenario: string }>
	resolveTemporarySource: (project: string) => Promise<ComponentShotMcpProjectRuntime>
}

const statDirectory = async (directory: string) => {
	let stats
	try {
		stats = await fs.stat(directory)
	} catch (error) {
		const code = typeof error === 'object' && error && 'code' in error ? error.code : undefined
		if (code === 'ENOENT' || code === 'ENOTDIR') {
			throw new ComponentShotError('discover', `Project directory not found: ${directory}`)
		}
		throw error
	}
	if (!stats.isDirectory()) {
		throw new ComponentShotError('discover', `Project path is not a directory: ${directory}`)
	}
	return fs.realpath(directory)
}

const findNearestPackageRoot = async (inputPath: string) => {
	let current = path.resolve(inputPath)
	while (true) {
		if (await pathExists(path.join(current, 'package.json'))) {
			return fs.realpath(current)
		}
		const parent = path.dirname(current)
		if (parent === current) return undefined
		current = parent
	}
}

const inferComponentShotProject = (anchorPath: string) => {
	const componentShotDir = findComponentShotDir(path.dirname(anchorPath))
	if (!componentShotDir) return undefined
	const [firstSegment] = path.relative(componentShotDir, anchorPath).split(path.sep)
	return firstSegment === 'scenarios' ? path.dirname(componentShotDir) : undefined
}

const readSourceDigest = async (sourcePath: string) => {
	try {
		return createHash('sha256').update(await fs.readFile(sourcePath)).digest('hex')
	} catch (error) {
		const code = typeof error === 'object' && error && 'code' in error ? error.code : undefined
		if (code === 'ENOENT' || code === 'ENOTDIR') return undefined
		throw new ComponentShotError(
			'discover',
			`Unable to inspect source changes for ${sourcePath}: ${error instanceof Error ? error.message : String(error)}`,
			{ cause: error },
		)
	}
}

export const createComponentShotMcpProjectRegistry = async (
	options: ComponentShotMcpProjectOptions = {},
): Promise<ComponentShotMcpProjectRegistry> => {
	const baseDir = await statDirectory(path.resolve(process.cwd(), options.cwd ?? '.'))
	const projects = new Map<string, Promise<ComponentShotMcpInternalProjectRuntime>>()
	let closed = false

	const resolveProjectDirectory = (projectInput: string) =>
		statDirectory(path.resolve(baseDir, projectInput))

	const createProject = async (projectRoot: string) => {
		const workspace = await createComponentShotWorkspace({
			allowExternalOutput: false,
			browserChannel: options.browserChannel,
			build: options.build,
			cwd: projectRoot,
			defaults: options.defaults,
			protocol: options.protocol,
			rspack: options.rspack,
		})
		const session = await workspace.createSession()
		const changedPaths = new Set<string>()
		const sourceDigests = new Map<string, string | undefined>()
		let stopWatching = () => {}
		try {
			if (options.watchSourceChanges !== false) {
				stopWatching = await startWorkspaceWatcher({
					ignoredRoots: [workspace.screenshotsDir],
					onChange: (changedPath) => changedPaths.add(changedPath),
					root: projectRoot,
				})
			}
		} catch (error) {
			await session.close()
			throw error
		}
		let operationQueue = Promise.resolve()
		const getSetup = async (): Promise<ComponentShotMcpSetup> => {
			const projectSetup = await findSetupPath(path.join(projectRoot, 'component-shot'))
			if (projectSetup) return { mode: 'project', path: projectSetup }
			if (typeof options.rspack === 'object' && options.rspack.setup) {
				return { mode: 'configured', path: path.resolve(projectRoot, options.rspack.setup) }
			}
			if (options.build || options.rspack === false) return { mode: 'custom-build' }
			return { mode: 'default' }
		}
		const observePaths = async (observedPaths: string[]) => {
			for (const observedPath of observedPaths) {
				const absolutePath = path.resolve(projectRoot, observedPath)
				if (!isPathWithin({ candidate: absolutePath, root: projectRoot })) continue
				const digest = await readSourceDigest(absolutePath)
				if (!sourceDigests.has(absolutePath) || sourceDigests.get(absolutePath) !== digest) {
					changedPaths.add(absolutePath)
				}
				sourceDigests.set(absolutePath, digest)
			}
		}
		const flushSourceChanges = async () => {
			if (changedPaths.size === 0) return
			const paths = [...changedPaths]
			changedPaths.clear()
			await session.invalidate(paths)
		}
		const runCapture = <Result>(
			observedPaths: string[],
			operation: () => Promise<Result>,
		): Promise<Result> => {
			const execute = async () => {
				await new Promise((resolve) => setTimeout(resolve, 30))
				await observePaths(observedPaths)
				await flushSourceChanges()
				try {
					return await operation()
				} finally {
					await observePaths(observedPaths)
					await flushSourceChanges()
				}
			}
			const result = operationQueue.then(execute)
			operationQueue = result.then(
				() => undefined,
				() => undefined,
			)
			return result
		}
		return {
			close: async () => {
				stopWatching()
				await operationQueue
				sourceDigests.clear()
				await session.close()
			},
			getSetup,
			projectRoot,
			runCapture,
			session,
		}
	}

	const getProject = async (projectRoot: string) => {
		if (closed) {
			throw new ComponentShotError('serve', 'Component Shot MCP server is already closed')
		}
		const existing = projects.get(projectRoot)
		if (existing) return existing
		const pending = createProject(projectRoot)
		projects.set(projectRoot, pending)
		try {
			return await pending
		} catch (error) {
			if (projects.get(projectRoot) === pending) projects.delete(projectRoot)
			throw error
		}
	}

	const resolveAnchorProject = async ({
		anchorPath,
		label,
		project: projectInput,
	}: {
		anchorPath: string
		label: string
		project?: string
	}) => {
		const componentShotProject = inferComponentShotProject(anchorPath)
		if (projectInput) {
			const explicitProject = await resolveProjectDirectory(projectInput)
			if (!isPathWithin({ candidate: anchorPath, root: explicitProject })) {
				throw new ComponentShotError(
					'discover',
					`${label} ${anchorPath} is outside the supplied project ${explicitProject}`,
				)
			}
			if (componentShotProject) {
				const inferredProject = await statDirectory(componentShotProject)
				if (inferredProject !== explicitProject) {
					throw new ComponentShotError(
						'discover',
						`Supplied project ${explicitProject} conflicts with ${label} ${anchorPath}, which belongs to ${inferredProject}`,
					)
				}
			}
			return explicitProject
		}

		if (componentShotProject) return statDirectory(componentShotProject)
		const packageRoot = await findNearestPackageRoot(path.dirname(anchorPath))
		if (packageRoot) return packageRoot
		throw new ComponentShotError(
			'discover',
			`Could not derive a React project from ${label.toLowerCase()} ${anchorPath}. Supply target.project.`,
		)
	}

	const resolveScenario = async (target: ScenarioReference) => {
		const unresolvedPath = path.resolve(baseDir, target.path)
		let scenarioPath: string
		try {
			const stats = await fs.stat(unresolvedPath)
			if (!stats.isFile()) {
				throw new ComponentShotError('discover', `Scenario path is not a file: ${unresolvedPath}`)
			}
			scenarioPath = await fs.realpath(unresolvedPath)
		} catch (error) {
			if (error instanceof ComponentShotError) throw error
			const code = typeof error === 'object' && error && 'code' in error ? error.code : undefined
			if (code === 'ENOENT' || code === 'ENOTDIR') {
				throw new ComponentShotError('discover', `Scenario not found: ${unresolvedPath}`)
			}
			throw error
		}
		if (!isScenarioFile(scenarioPath)) {
			throw new ComponentShotError(
				'discover',
				'Scenario path must end in .tsx, .ts, .jsx, or .js',
			)
		}
		const projectRoot = await resolveAnchorProject({
			anchorPath: scenarioPath,
			label: 'Scenario',
			project: target.project,
		})
		return {
			project: await getProject(projectRoot),
			scenario: path.relative(projectRoot, scenarioPath),
		}
	}

	const resolvePersistedSource = async (target: PersistedSourceReference) => {
		let scenarioPath = path.resolve(baseDir, target.persistAs)
		if (!path.extname(scenarioPath)) scenarioPath = `${scenarioPath}.tsx`
		if (!isScenarioFile(scenarioPath)) {
			throw new ComponentShotError(
				'discover',
				'persistAs must end in .tsx, .ts, .jsx, or .js',
			)
		}
		const projectRoot = await resolveAnchorProject({
			anchorPath: scenarioPath,
			label: 'persistAs path',
			project: target.project,
		})
		const scenarioDir = path.join(projectRoot, 'component-shot', 'scenarios')
		if (!isPathWithin({ candidate: scenarioPath, root: scenarioDir })) {
			throw new ComponentShotError(
				'discover',
				`persistAs must be inside ${scenarioDir}`,
			)
		}
		return {
			project: await getProject(projectRoot),
			scenario: path.relative(projectRoot, scenarioPath),
		}
	}

	return {
		close: async () => {
			if (closed) return
			closed = true
			const settledProjects = await Promise.allSettled(projects.values())
			await Promise.allSettled(
				settledProjects.flatMap((result) => {
					if (result.status === 'rejected') return []
					return [result.value.close()]
				}),
			)
			projects.clear()
		},
		resolvePersistedSource,
		resolveScenario,
		resolveTemporarySource: async (projectInput) =>
			getProject(await resolveProjectDirectory(projectInput)),
	}
}
