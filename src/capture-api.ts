import type { ComponentShotBuild } from './build-types.js'
import type { ComponentShotRspackOptions } from './rspack.js'
import type { ComponentShotEnvironment, ComponentShotViewport } from './runtime/types.js'
import {
	createComponentShotSession,
	type ComponentShotCaptureResult,
	type ComponentShotSourceResult,
} from './session.js'

export type ComponentShotOptions = {
	animations?: 'allow' | 'disabled'
	browserChannel?: string
	build?: ComponentShotBuild
	cwd?: string
	debug?: boolean
	environment?: ComponentShotEnvironment
	errorGlobal?: string
	fullPage?: boolean
	keepTemp?: boolean
	metadataGlobal?: string
	output?: string
	outputDirName?: string
	readyGlobal?: string
	rspack?: ComponentShotRspackOptions | false
	save?: boolean
	saveName?: string
	scenario: string
	scenarioDir?: string
	screenshotsDir?: string
	selector?: string
	setup?: string
	tempDirPrefix?: string
	timeoutMs?: number
	viewport?: ComponentShotViewport
	waitFor?: string
}

export type ComponentShotSourceOptions = Omit<ComponentShotOptions, 'scenario'> & {
	name?: string
	overwrite?: boolean
	scenario?: string
	source: string
}

export type ComponentShotResult = ComponentShotCaptureResult
export type { ComponentShotSourceResult }

const toSessionOptions = (options: ComponentShotOptions | ComponentShotSourceOptions) => ({
	browserChannel: options.browserChannel,
	build: options.build,
	cwd: options.cwd,
	debug: options.debug,
	defaults: {
		animations: options.animations,
		environment: options.environment,
		fullPage: options.fullPage,
		selector: options.selector,
		timeoutMs: options.timeoutMs,
		viewport: options.viewport,
	},
	keepTemp: options.keepTemp,
	protocol: {
		errorGlobal: options.errorGlobal,
		metadataGlobal: options.metadataGlobal,
		readyGlobal: options.readyGlobal,
	},
	rspack: options.rspack,
	scenarioDir: options.scenarioDir,
	screenshotsDir: options.screenshotsDir,
	setup: options.setup,
	tempDirPrefix: options.tempDirPrefix,
})

const createOneShotOutput = (options: ComponentShotOptions | ComponentShotSourceOptions) =>
	options.output ??
	path.join(
		os.tmpdir(),
		path.basename(options.outputDirName ?? 'component-shots'),
		`${Date.now()}-${randomUUID().slice(0, 8)}.png`,
	)

const toCaptureRequest = (options: ComponentShotOptions, output = options.output) => ({
	animations: options.animations,
	debug: options.debug,
	environment: options.environment,
	fullPage: options.fullPage,
	output,
	save: options.save,
	saveName: options.saveName,
	scenario: options.scenario,
	selector: options.selector,
	timeoutMs: options.timeoutMs,
	viewport: options.viewport,
	waitFor: options.waitFor,
})

const runOneShot = async <Result>(
	options: ComponentShotOptions | ComponentShotSourceOptions,
	operation: (session: Awaited<ReturnType<typeof createComponentShotSession>>) => Promise<Result>,
) => {
	const session = await createComponentShotSession(toSessionOptions(options))
	let primaryError: unknown
	try {
		return await operation(session)
	} catch (error) {
		primaryError = error
		throw error
	} finally {
		try {
			await session.close()
		} catch (cleanupError) {
			if (!primaryError) {
				throw cleanupError
			}
		}
	}
}

export const captureComponentShot = async (options: ComponentShotOptions): Promise<ComponentShotResult> =>
	runOneShot(options, (session) => session.capture(toCaptureRequest(options, createOneShotOutput(options))))

export const captureComponentSource = async (
	options: ComponentShotSourceOptions,
): Promise<ComponentShotSourceResult> =>
	runOneShot(options, (session) =>
		session.captureSource({
			...toCaptureRequest(
				{ ...options, scenario: options.scenario ?? '' },
				createOneShotOutput(options),
			),
			name: options.name,
			overwrite: options.overwrite,
			scenario: options.scenario,
			source: options.source,
		}),
	)

export const previewComponentSource = async (
	options: ComponentShotSourceOptions,
): Promise<ComponentShotSourceResult> =>
	runOneShot(options, (session) =>
		session.previewSource({
			...toCaptureRequest(
				{ ...options, scenario: options.scenario ?? '' },
				createOneShotOutput(options),
			),
			name: options.name,
			overwrite: true,
			source: options.source,
		}),
	)
import { randomUUID } from 'node:crypto'
import os from 'node:os'
import path from 'node:path'
