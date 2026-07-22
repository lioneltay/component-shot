import scenarioExport from '__component_shot_scenario__'
import setupExport from '__component_shot_setup__'
import protocolExport from '__component_shot_protocol__'
import React, { type CSSProperties, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { componentShotDefaultProtocol } from '../build-types.js'
import type {
	ComponentShotAppSetup,
	ComponentShotScenario,
	ComponentShotScenarioObject,
} from './types.js'

declare global {
	interface Window {
		__COMPONENT_SHOT_ERROR__?: string
		__COMPONENT_SHOT_METADATA__?: Record<string, unknown>
		__COMPONENT_SHOT_READY__?: boolean
	}
}

const defaultRootStyle: CSSProperties = {
	display: 'inline-block',
	maxWidth: '100%',
}

const protocol = {
	continueGlobal: protocolExport?.continueGlobal ?? componentShotDefaultProtocol.continueGlobal,
	errorGlobal: protocolExport?.errorGlobal ?? componentShotDefaultProtocol.errorGlobal,
	metadataGlobal: protocolExport?.metadataGlobal ?? componentShotDefaultProtocol.metadataGlobal,
	readyGlobal: protocolExport?.readyGlobal ?? componentShotDefaultProtocol.readyGlobal,
}

const windowState = window as unknown as Record<string, unknown>

const notifyParent = (type: 'error' | 'layout' | 'ready', details?: Record<string, unknown>) => {
	if (window.parent === window) {
		return
	}
	window.parent.postMessage(
		{
			...details,
			type: `component-shot:${type}`,
		},
		'*',
	)
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

const waitForCaptureHost = async () => {
	if (!new URLSearchParams(window.location.search).has('component-shot-capture')) return
	await new Promise<void>((resolve) => {
		const check = () => {
			if (windowState[protocol.continueGlobal] === true) {
				resolve()
				return
			}
			window.setTimeout(check, 5)
		}
		check()
	})
}

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
	windowState[protocol.continueGlobal] = false
	windowState[protocol.readyGlobal] = false
	windowState[protocol.errorGlobal] = undefined

	const rootElement = document.getElementById('root')
	if (!rootElement) {
		throw new Error('Missing #root element for component-shot')
	}

	const appSetup = setupExport ?? {}
	const staticScenario = isScenarioObject(scenarioExport) ? scenarioExport : undefined
	windowState[protocol.metadataGlobal] = staticScenario
		? {
				capture: staticScenario.capture,
				description: staticScenario.description,
				environment: staticScenario.environment,
				tags: staticScenario.tags,
				title: staticScenario.title,
				viewport: staticScenario.viewport,
			}
		: {}
	await waitForCaptureHost()
	const { node, objectScenario } = await renderScenario(scenarioExport)
	const Wrapper = objectScenario?.wrapper
	const Provider = appSetup.Provider
	const providerOptions = objectScenario?.providerOptions
	const content = Wrapper ? <Wrapper>{node}</Wrapper> : node
	const wrappedContent =
		providerOptions === false || !Provider ? content : <Provider options={providerOptions}>{content}</Provider>

	createRoot(rootElement).render(
		<div
			data-component-shot-root={true}
			style={objectScenario?.rootStyle ?? appSetup.rootStyle ?? defaultRootStyle}
		>
			{wrappedContent}
		</div>,
	)

	await nextFrame()
	await objectScenario?.afterRender?.()
	await nextFrame()
	await objectScenario?.beforeScreenshot?.()
	await nextFrame()
	const captureSelector = objectScenario?.capture?.selector ?? '[data-component-shot-root]'
	const readFrameDetails = () => {
		const captureElement = document.querySelector(captureSelector)
		const bounds = captureElement?.getBoundingClientRect()
		return {
			bounds: bounds
				? {
						height: bounds.height,
						width: bounds.width,
						x: bounds.x,
						y: bounds.y,
					}
				: undefined,
			frameViewport: { height: window.innerHeight, width: window.innerWidth },
		}
	}
	let layoutFrame: number | undefined
	const scheduleLayout = () => {
		if (layoutFrame !== undefined) return
		layoutFrame = window.requestAnimationFrame(() => {
			layoutFrame = window.requestAnimationFrame(() => {
				layoutFrame = undefined
				notifyParent('layout', readFrameDetails())
			})
		})
	}
	window.addEventListener('resize', scheduleLayout)
	window.addEventListener('message', (event) => {
		if (
			event.source === window.parent &&
			event.data &&
			typeof event.data === 'object' &&
			(event.data as { type?: string }).type === 'component-shot:request-layout'
		) {
			notifyParent('layout', readFrameDetails())
		}
	})
	windowState[protocol.readyGlobal] = true
	notifyParent('ready', {
		...readFrameDetails(),
		metadata: windowState[protocol.metadataGlobal],
	})
}

mount().catch((error: unknown) => {
	const message = error instanceof Error ? (error.stack ?? error.message) : String(error)
	windowState[protocol.errorGlobal] = message
	windowState[protocol.readyGlobal] = true
	notifyParent('error', { message })

	const rootElement = document.getElementById('root')
	if (rootElement) {
		const errorElement = document.createElement('pre')
		errorElement.dataset.componentShotError = 'true'
		errorElement.textContent = message
		rootElement.replaceChildren(errorElement)
	}
})
