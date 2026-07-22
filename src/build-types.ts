export type ComponentShotRenderProtocol = {
	continueGlobal: string
	errorGlobal: string
	metadataGlobal: string
	readyGlobal: string
}

export const componentShotDefaultProtocol = {
	continueGlobal: '__COMPONENT_SHOT_CONTINUE__',
	errorGlobal: '__COMPONENT_SHOT_ERROR__',
	metadataGlobal: '__COMPONENT_SHOT_METADATA__',
	readyGlobal: '__COMPONENT_SHOT_READY__',
} as const satisfies ComponentShotRenderProtocol

export type ComponentShotBuildContext = {
	cwd: string
	debug: boolean
	protocol: ComponentShotRenderProtocol
	publicDir: string
	publicPath: string
	scenarioPath: string
	setupPath?: string
}

export type ComponentShotBuildCommand = {
	args?: string[]
	command: string
	cwd?: string
	env?: Record<string, string | undefined>
	shell?: boolean
}

export type ComponentShotBuild =
	| ComponentShotBuildCommand
	| ((
			context: ComponentShotBuildContext,
	  ) => ComponentShotBuildCommand | void | Promise<ComponentShotBuildCommand | void>)
