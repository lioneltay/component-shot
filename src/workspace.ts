import { countHistory } from './artifacts.js'
import {
	createComponentShotSession,
	type ComponentShotSession,
	type ComponentShotSessionOptions,
} from './session.js'
import {
	listScenarioFiles,
	resolveWorkspacePaths,
	type ComponentShotScenarioInfo,
} from './scenarios.js'

export type ComponentShotWorkspaceOptions = ComponentShotSessionOptions

export type ComponentShotWorkspace = {
	createSession: () => Promise<ComponentShotSession>
	cwd: string
	listScenarios: () => Promise<ComponentShotScenarioInfo[]>
	scenarioDir: string
	screenshotsDir: string
}

export const createComponentShotWorkspace = async (
	options: ComponentShotWorkspaceOptions = {},
): Promise<ComponentShotWorkspace> => {
	const paths = resolveWorkspacePaths(options)
	const listScenarios = async () => {
		const scenarioInfos = await listScenarioFiles(paths)
		const scenarios = await Promise.all(
			scenarioInfos.map(async (scenario) => {
				const historyCount = await countHistory({ scenario, screenshotsDir: paths.screenshotsDir })
				return { ...scenario, historyCount }
			}),
		)
		scenarios.sort((left, right) => left.id.localeCompare(right.id))
		return scenarios
	}

	return {
		createSession: () => createComponentShotSession(options),
		cwd: paths.cwd,
		listScenarios,
		scenarioDir: paths.scenarioDir,
		screenshotsDir: paths.screenshotsDir,
	}
}
