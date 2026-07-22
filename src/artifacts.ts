import { randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import type { ComponentShotScenarioInfo } from './scenarios.js'
import { sanitizePathSegment } from './scenarios.js'

export type ComponentShotHistoryEntry = {
	filename: string
	path: string
	updatedAt: string
}

const createTimestamp = () => new Date().toISOString().replace(/[:.]/g, '-')

export const getArtifactDir = ({
	saveName,
	scenario,
	screenshotsDir,
}: {
	saveName?: string
	scenario: ComponentShotScenarioInfo
	screenshotsDir: string
}) =>
	path.join(
		screenshotsDir,
		...(saveName ? [sanitizePathSegment(saveName)] : scenario.artifactKey.split('/')),
	)

export const getLegacyArtifactDir = ({
	scenario,
	screenshotsDir,
}: {
	scenario: ComponentShotScenarioInfo
	screenshotsDir: string
}) => path.join(screenshotsDir, sanitizePathSegment(scenario.name))

const hasSafeLegacyIdentity = (scenario: ComponentShotScenarioInfo) =>
	scenario.id === scenario.name && scenario.artifactKey === sanitizePathSegment(scenario.name)

export const findLatestArtifact = async ({
	scenario,
	screenshotsDir,
}: {
	scenario: ComponentShotScenarioInfo
	screenshotsDir: string
}) => {
	const candidates = [path.join(getArtifactDir({ scenario, screenshotsDir }), 'latest.png')]
	if (hasSafeLegacyIdentity(scenario)) {
		candidates.push(path.join(getLegacyArtifactDir({ scenario, screenshotsDir }), 'latest.png'))
	}
	for (const candidate of candidates) {
		try {
			await fs.access(candidate)
			return candidate
		} catch (error) {
			const code = typeof error === 'object' && error && 'code' in error ? error.code : undefined
			if (code !== 'ENOENT' && code !== 'ENOTDIR') {
				throw error
			}
		}
	}
	return undefined
}

export const listHistory = async ({
	limit = Number.POSITIVE_INFINITY,
	scenario,
	screenshotsDir,
}: {
	limit?: number
	scenario: ComponentShotScenarioInfo
	screenshotsDir: string
}): Promise<ComponentShotHistoryEntry[]> => {
	const currentDir = path.join(getArtifactDir({ scenario, screenshotsDir }), 'history')
	const legacyDir = path.join(getLegacyArtifactDir({ scenario, screenshotsDir }), 'history')
	const dirs =
		hasSafeLegacyIdentity(scenario) && currentDir !== legacyDir
			? [currentDir, legacyDir]
			: [currentDir]
	const entries = await Promise.all(
		dirs.map(async (dir) => {
			try {
				const names = await fs.readdir(dir, { withFileTypes: true })
				return Promise.all(
					names
						.filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.png'))
						.sort((left, right) => right.name.localeCompare(left.name))
						.slice(0, limit)
						.map(async (entry) => {
							const entryPath = path.join(dir, entry.name)
							const stats = await fs.stat(entryPath)
							return {
								filename: entry.name,
								path: entryPath,
								updatedAt: stats.mtime.toISOString(),
							}
						}),
				)
			} catch (error) {
				const code = typeof error === 'object' && error && 'code' in error ? error.code : undefined
				if (code === 'ENOENT' || code === 'ENOTDIR') {
					return []
				}
				throw error
			}
		}),
	)

	const unique = new Map<string, ComponentShotHistoryEntry>()
	for (const entry of entries.flat()) {
		unique.set(entry.path, entry)
	}
	return [...unique.values()]
		.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
		.slice(0, limit)
}

export const countHistory = async ({
	scenario,
	screenshotsDir,
}: {
	scenario: ComponentShotScenarioInfo
	screenshotsDir: string
}) => {
	const currentDir = path.join(getArtifactDir({ scenario, screenshotsDir }), 'history')
	const legacyDir = path.join(getLegacyArtifactDir({ scenario, screenshotsDir }), 'history')
	const dirs =
		hasSafeLegacyIdentity(scenario) && currentDir !== legacyDir
			? [currentDir, legacyDir]
			: [currentDir]
	const names = await Promise.all(
		dirs.map(async (dir) => {
			try {
				return (await fs.readdir(dir, { withFileTypes: true }))
					.filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.png'))
					.map((entry) => path.join(dir, entry.name))
			} catch (error) {
				const code = typeof error === 'object' && error && 'code' in error ? error.code : undefined
				if (code === 'ENOENT' || code === 'ENOTDIR') return []
				throw error
			}
		}),
	)
	return new Set(names.flat()).size
}

const atomicCopy = async (source: string, destination: string) => {
	await fs.mkdir(path.dirname(destination), { recursive: true })
	const staging = `${destination}.${randomUUID()}.tmp`
	await fs.copyFile(source, staging)
	try {
		await fs.rename(staging, destination)
	} catch (error) {
		const code = typeof error === 'object' && error && 'code' in error ? error.code : undefined
		if (code !== 'EEXIST' && code !== 'EPERM') {
			throw error
		}
		await fs.rm(destination, { force: true })
		await fs.rename(staging, destination)
	}
}

export const publishCapture = async ({
	explicitOutput,
	previewOutput,
	save,
	saveName,
	scenario,
	screenshotsDir,
	stagingPath,
}: {
	explicitOutput?: string
	previewOutput: string
	save: boolean
	saveName?: string
	scenario: ComponentShotScenarioInfo
	screenshotsDir: string
	stagingPath: string
}) => {
	const outputPath = explicitOutput ?? previewOutput
	await atomicCopy(stagingPath, outputPath)

	if (!save) {
		return { outputPath }
	}

	const artifactDir = getArtifactDir({ saveName, scenario, screenshotsDir })
	const latestPath = path.join(artifactDir, 'latest.png')
	const historyPath = path.join(
		artifactDir,
		'history',
		`${createTimestamp()}-${randomUUID().slice(0, 8)}.png`,
	)
	await Promise.all([atomicCopy(stagingPath, historyPath), atomicCopy(stagingPath, latestPath)])
	return { historyPath, latestPath, outputPath }
}
