import type { ComponentType, CSSProperties, ReactNode } from 'react'

export type ComponentShotMaybePromise<T> = T | Promise<T>

export type ComponentShotWrapper = ComponentType<{ children: ReactNode }>

export type ComponentShotViewport = {
	height: number
	width: number
}

export type ComponentShotEnvironment = {
	colorScheme?: 'dark' | 'light'
	deviceScaleFactor?: number
	locale?: string
	network?: 'allow' | 'block-external'
	reducedMotion?: 'no-preference' | 'reduce'
	timezoneId?: string
}

export type ComponentShotCaptureSettings = {
	animations?: 'allow' | 'disabled'
	fullPage?: boolean
	selector?: string
}

export type ComponentShotAppProvider<ProviderOptions = unknown> = ComponentType<{
	children: ReactNode
	options?: ProviderOptions
}>

export type ComponentShotAppSetup<ProviderOptions = unknown> = {
	Provider?: ComponentShotAppProvider<ProviderOptions>
	rootStyle?: CSSProperties
}

export type ComponentShotScenarioObject<ProviderOptions = unknown> = {
	afterRender?: () => ComponentShotMaybePromise<void>
	beforeScreenshot?: () => ComponentShotMaybePromise<void>
	capture?: ComponentShotCaptureSettings
	description?: string
	environment?: ComponentShotEnvironment
	providerOptions?: ProviderOptions | false
	render: () => ComponentShotMaybePromise<ReactNode>
	rootStyle?: CSSProperties
	setup?: () => ComponentShotMaybePromise<void>
	tags?: string[]
	title?: string
	viewport?: ComponentShotViewport
	wrapper?: ComponentShotWrapper
}

export type ComponentShotScenario<ProviderOptions = unknown> =
	| ComponentShotScenarioObject<ProviderOptions>
	| ReactNode
	| (() => ComponentShotMaybePromise<ReactNode>)

export type ComponentShotDefinition<ProviderOptions> = {
	scenario: <Scenario extends ComponentShotScenarioObject<ProviderOptions>>(scenario: Scenario) => Scenario
	setup: <Setup extends ComponentShotAppSetup<ProviderOptions>>(setup: Setup) => Setup
}

export const defineComponentShotScenario = <ProviderOptions = unknown>(
	scenario: ComponentShotScenarioObject<ProviderOptions>,
) => scenario

export const defineComponentShotSetup = <ProviderOptions = unknown>(
	setup: ComponentShotAppSetup<ProviderOptions>,
) => setup

export const createComponentShot = <ProviderOptions = unknown>(): ComponentShotDefinition<ProviderOptions> => ({
	scenario: (scenario) => scenario,
	setup: (setup) => setup,
})
