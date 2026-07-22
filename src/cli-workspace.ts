import fs from 'node:fs/promises'
import path from 'node:path'
import { defaultScenarioDir, pathExists } from './scenarios.js'

const ignoredDirectories = new Set([
	'.git',
	'.next',
	'.pnpm',
	'.turbo',
	'.yarn',
	'build',
	'coverage',
	'dist',
	'node_modules',
])

export type ComponentShotCliWorkspace = {
	autoDiscovered: boolean
	cwd: string
	scenarioDir?: string
}

const isDirectory = async (directory: string) => {
	try {
		return (await fs.stat(directory)).isDirectory()
	} catch (error) {
		const code = typeof error === 'object' && error && 'code' in error ? error.code : undefined
		if (code === 'ENOENT' || code === 'ENOTDIR') return false
		throw error
	}
}

export const discoverComponentShotProjects = async (searchRoot: string) => {
	const root = path.resolve(searchRoot)
	const queue = [root]
	const projects: string[] = []

	for (let index = 0; index < queue.length; index += 1) {
		const directory = queue[index]
		if (!directory) continue
		const entries = await fs.readdir(directory, { withFileTypes: true })
		for (const entry of entries) {
			if (!entry.isDirectory()) continue
			const entryPath = path.join(directory, entry.name)
			if (entry.name === 'component-shot') {
				if (await isDirectory(path.join(entryPath, 'scenarios'))) {
					projects.push(directory)
				}
				continue
			}
			if (entry.name.startsWith('.') || ignoredDirectories.has(entry.name)) continue
			queue.push(entryPath)
		}
	}

	return projects.sort((left, right) => left.localeCompare(right))
}

export const resolveComponentShotCliWorkspace = async ({
	cwd: cwdInput,
	scenarioDir,
}: {
	cwd?: string
	scenarioDir?: string
} = {}): Promise<ComponentShotCliWorkspace> => {
	const cwd = path.resolve(process.cwd(), cwdInput ?? '.')
	if (scenarioDir || (await pathExists(path.join(cwd, defaultScenarioDir)))) {
		return { autoDiscovered: false, cwd, scenarioDir }
	}

	if (
		path.basename(cwd) === 'component-shot' &&
		(await isDirectory(path.join(cwd, 'scenarios')))
	) {
		return { autoDiscovered: true, cwd: path.dirname(cwd) }
	}

	const projects = await discoverComponentShotProjects(cwd)
	if (projects.length === 0) return { autoDiscovered: false, cwd }
	if (projects.length === 1) return { autoDiscovered: true, cwd: projects[0] ?? cwd }

	const projectList = projects
		.map((project) => `  - ${path.relative(cwd, project) || '.'}`)
		.join('\n')
	throw new Error(
		`Multiple Component Shot projects found under ${cwd}:\n${projectList}\nPass --cwd <project> or --scenario-dir <path> to choose one.`,
	)
}
