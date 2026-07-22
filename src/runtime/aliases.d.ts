declare module '__component_shot_scenario__' {
	const scenario: import('./types.js').ComponentShotScenario
	export default scenario
}

declare module '__component_shot_setup__' {
	const setup: import('./types.js').ComponentShotAppSetup
	export default setup
}

declare module '__component_shot_protocol__' {
	const protocol: {
		continueGlobal: string
		errorGlobal: string
		metadataGlobal: string
		readyGlobal: string
	}
	export default protocol
}
