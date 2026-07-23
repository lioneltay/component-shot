import { watch, type FSWatcher } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import { isPathWithin } from './scenarios.js'

export const componentShotIgnoredWatchDirectories = new Set([
	'.architecture',
	'.audit',
	'.git',
	'.next',
	'.turbo',
	'coverage',
	'dist',
	'node_modules',
])

const collectWatchDirectories = async ({
	ignoredDirectoryNames,
	ignoredRoots,
	root,
}: {
	ignoredDirectoryNames: ReadonlySet<string>
	ignoredRoots: string[]
	root: string
}) => {
	const directories: string[] = []
	const visit = async (directory: string) => {
		directories.push(directory)
		let entries: import('node:fs').Dirent[]
		try {
			entries = await fs.readdir(directory, { withFileTypes: true })
		} catch {
			return
		}
		await Promise.all(
			entries.map(async (entry) => {
				if (!entry.isDirectory() || ignoredDirectoryNames.has(entry.name)) return
				const child = path.join(directory, entry.name)
				if (ignoredRoots.some((ignoredRoot) => isPathWithin({ candidate: child, root: ignoredRoot }))) {
					return
				}
				await visit(child)
			}),
		)
	}
	await visit(root)
	return directories
}

export const startWorkspaceWatcher = async ({
	ignoredDirectoryNames = componentShotIgnoredWatchDirectories,
	ignoredRoots = [],
	onChange,
	root,
}: {
	ignoredDirectoryNames?: ReadonlySet<string>
	ignoredRoots?: string[]
	onChange: (changedPath: string) => void
	root: string
}) => {
	const absoluteRoot = path.resolve(root)
	const absoluteIgnoredRoots = ignoredRoots.map((ignoredRoot) => path.resolve(ignoredRoot))
	const watchers: FSWatcher[] = []
	const handleChange = (watchRoot: string, filename: string | Buffer | null) => {
		const changedPath = filename ? path.resolve(watchRoot, filename.toString()) : watchRoot
		if (
			absoluteIgnoredRoots.some((ignoredRoot) =>
				isPathWithin({ candidate: changedPath, root: ignoredRoot }),
			)
		) {
			return
		}
		const relative = path.relative(absoluteRoot, changedPath)
		if (relative.split(path.sep).some((segment) => ignoredDirectoryNames.has(segment))) return
		onChange(changedPath)
	}

	try {
		watchers.push(
			watch(absoluteRoot, { recursive: true }, (_event, filename) =>
				handleChange(absoluteRoot, filename),
			),
		)
	} catch {
		const directories = await collectWatchDirectories({
			ignoredDirectoryNames,
			ignoredRoots: absoluteIgnoredRoots,
			root: absoluteRoot,
		})
		for (const directory of directories) {
			try {
				watchers.push(
					watch(directory, (_event, filename) => handleChange(directory, filename)),
				)
			} catch {
				// A directory may disappear between discovery and watcher creation.
			}
		}
	}

	return () => {
		for (const watcher of watchers) watcher.close()
	}
}
