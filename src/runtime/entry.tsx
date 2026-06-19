import scenarioExport from '__component_shot_scenario__'
import setupExport from '__component_shot_setup__'
import React, { Fragment, type CSSProperties, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import type {
	ComponentShotAppSetup,
	ComponentShotScenario,
	ComponentShotScenarioObject,
} from './types.js'

declare global {
	interface Window {
		__COMPONENT_SHOT_ERROR__?: string
		__COMPONENT_SHOT_READY__?: boolean
	}
}

const defaultRootStyle: CSSProperties = {
	display: 'inline-block',
	maxWidth: '100%',
}

const nextFrame = () =>
	new Promise<void>((resolve) => {
		let isSettled = false
		const finish = () => {
			if (!isSettled) {
				isSettled = true
				resolve()
			}
		}

		window.requestAnimationFrame(() => {
			window.requestAnimationFrame(finish)
		})
		window.setTimeout(finish, 100)
	})

const isScenarioObject = (
	scenario: ComponentShotScenario,
): scenario is ComponentShotScenarioObject =>
	typeof scenario === 'object' &&
	scenario !== null &&
	!React.isValidElement(scenario) &&
	'render' in scenario &&
	typeof scenario.render === 'function'

const renderScenario = async (
	scenario: ComponentShotScenario,
): Promise<{
	node: ReactNode
	objectScenario?: ComponentShotScenarioObject
}> => {
	if (isScenarioObject(scenario)) {
		await scenario.setup?.()
		return {
			node: await scenario.render(),
			objectScenario: scenario,
		}
	}

	if (typeof scenario === 'function') {
		return {
			node: await scenario(),
		}
	}

	return {
		node: scenario,
	}
}

const mount = async () => {
	window.__COMPONENT_SHOT_READY__ = false
	window.__COMPONENT_SHOT_ERROR__ = undefined

	const rootElement = document.getElementById('root')
	if (!rootElement) {
		throw new Error('Missing #root element for component-shot')
	}

	const appSetup = setupExport ?? {}
	const { node, objectScenario } = await renderScenario(scenarioExport)
	const Wrapper = objectScenario?.wrapper
	const Provider = appSetup.Provider ?? Fragment
	const providerOptions = objectScenario?.providerOptions
	const content = Wrapper ? <Wrapper>{node}</Wrapper> : node
	const wrappedContent =
		providerOptions === false ? content : <Provider options={providerOptions}>{content}</Provider>

	createRoot(rootElement).render(
		<div
			data-component-shot-root={true}
			style={objectScenario?.rootStyle ?? appSetup.rootStyle ?? defaultRootStyle}
		>
			{wrappedContent}
		</div>,
	)

	await nextFrame()
	await objectScenario?.beforeScreenshot?.()
	await nextFrame()
	window.__COMPONENT_SHOT_READY__ = true
}

mount().catch((error: unknown) => {
	const message = error instanceof Error ? (error.stack ?? error.message) : String(error)
	window.__COMPONENT_SHOT_ERROR__ = message
	window.__COMPONENT_SHOT_READY__ = true

	const rootElement = document.getElementById('root')
	if (rootElement) {
		const errorElement = document.createElement('pre')
		errorElement.dataset.componentShotError = 'true'
		errorElement.textContent = message
		rootElement.replaceChildren(errorElement)
	}
})
