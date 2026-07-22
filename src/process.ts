import { spawn } from 'node:child_process'
import type { ComponentShotBuild, ComponentShotBuildCommand, ComponentShotBuildContext } from './build-types.js'

const maxDiagnosticBytes = 64 * 1024

const appendBounded = (current: string, chunk: unknown) => {
	const next = `${current}${String(chunk)}`
	return next.length <= maxDiagnosticBytes ? next : next.slice(next.length - maxDiagnosticBytes)
}

export const resolveBuildCommand = async (
	build: ComponentShotBuild,
	context: ComponentShotBuildContext,
): Promise<ComponentShotBuildCommand | void> =>
	typeof build === 'function' ? await build(context) : build

export const runBuild = async ({
	build,
	context,
	timeoutMs,
}: {
	build: ComponentShotBuild
	context: ComponentShotBuildContext
	timeoutMs: number
}) => {
	const command = await resolveBuildCommand(build, context)
	if (!command) {
		return
	}

	await new Promise<void>((resolve, reject) => {
		const child = spawn(command.command, command.args ?? [], {
			cwd: command.cwd ?? context.cwd,
			env: { ...process.env, ...command.env },
			shell: command.shell,
			stdio: context.debug ? 'inherit' : ['ignore', 'pipe', 'pipe'],
		})
		let output = ''
		let didTimeout = false
		const timer = setTimeout(() => {
			didTimeout = true
			child.kill('SIGTERM')
			setTimeout(() => child.kill('SIGKILL'), 500).unref()
		}, timeoutMs)

		child.stdout?.on('data', (chunk) => {
			output = appendBounded(output, chunk)
		})
		child.stderr?.on('data', (chunk) => {
			output = appendBounded(output, chunk)
		})
		child.once('error', (error) => {
			clearTimeout(timer)
			reject(error)
		})
		child.once('close', (code) => {
			clearTimeout(timer)
			if (didTimeout) {
				reject(new Error(`Build timed out after ${timeoutMs}ms${output.trim() ? `\n\n${output.trim()}` : ''}`))
				return
			}
			if (code === 0) {
				resolve()
				return
			}
			reject(new Error(output.trim() || `${command.command} exited with code ${code}`))
		})
	})
}
