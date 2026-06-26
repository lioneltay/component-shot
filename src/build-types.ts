export type ComponentShotBuildContext = {
	cwd: string
	debug: boolean
	publicDir: string
	scenarioPath: string
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
