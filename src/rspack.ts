import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { ComponentShotBuild } from './build-types.js'

export type ComponentShotRspackOptions = {
	aliases?: Record<string, string>
	dependencyRoots?: string[]
	entry?: string
	publicPath?: string
	setup?: string
	workspacePackageDirs?: string[]
}

const dirname = path.dirname(fileURLToPath(import.meta.url))

export const createRspackBuild =
	(options: ComponentShotRspackOptions = {}): ComponentShotBuild =>
	(context) => ({
		args: [path.join(dirname, 'rspack-runner.js')],
		command: process.execPath,
		env: {
			COMPONENT_SHOT_RSPACK_CONTEXT: JSON.stringify(context),
			COMPONENT_SHOT_RSPACK_OPTIONS: JSON.stringify(options),
		},
	})
