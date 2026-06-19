import type { ComponentType, CSSProperties, ReactNode } from 'react'

export type ComponentShotMaybePromise<T> = T | Promise<T>

export type ComponentShotWrapper = ComponentType<{ children: ReactNode }>

export type ComponentShotAppProvider<ProviderOptions = unknown> = ComponentType<{
	children: ReactNode
	options?: ProviderOptions
}>

export type ComponentShotAppSetup<ProviderOptions = unknown> = {
	Provider?: ComponentShotAppProvider<ProviderOptions>
	rootStyle?: CSSProperties
}

export type ComponentShotScenarioObject<ProviderOptions = unknown> = {
	beforeScreenshot?: () => ComponentShotMaybePromise<void>
	providerOptions?: ProviderOptions | false
	render: () => ComponentShotMaybePromise<ReactNode>
	rootStyle?: CSSProperties
	setup?: () => ComponentShotMaybePromise<void>
	wrapper?: ComponentShotWrapper
}

export type ComponentShotScenario<ProviderOptions = unknown> =
	| ComponentShotScenarioObject<ProviderOptions>
	| ReactNode
	| (() => ComponentShotMaybePromise<ReactNode>)
