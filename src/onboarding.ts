import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { detectComponentShotBrowser } from './browser.js'
import { createComponentShotWorkspace } from './workspace.js'
import { findSetupPath, pathExists, resolveWorkspacePaths } from './scenarios.js'

const require = createRequire(import.meta.url)

export type ComponentShotDoctorCheck = {
	message: string
	name: string
	status: 'error' | 'ok' | 'warning'
}

export type ComponentShotDoctorResult = {
	checks: ComponentShotDoctorCheck[]
	cwd: string
	ready: boolean
}

const runProcess = async (command: string, args: string[], quiet = false) => {
	await new Promise<void>((resolve, reject) => {
		const child = spawn(command, args, {
			stdio: quiet ? ['ignore', 'ignore', 'inherit'] : 'inherit',
		})
		child.once('error', reject)
		child.once('close', (code) => {
			if (code === 0) {
				resolve()
				return
			}
			reject(new Error(`${command} exited with code ${code}`))
		})
	})
}

export const installComponentShotBrowser = async (
	browserName = 'chromium',
	{ quiet = false }: { quiet?: boolean } = {},
) => {
	const playwrightRoot = path.dirname(require.resolve('playwright/package.json'))
	const cliPath = path.join(playwrightRoot, 'cli.js')
	await runProcess(process.execPath, [cliPath, 'install', browserName], quiet)
	return { browser: browserName, command: process.execPath, installed: true }
}

const resolveFromProject = (cwd: string, request: string) => {
	try {
		return require.resolve(`${request}/package.json`, { paths: [cwd] })
	} catch {
		return undefined
	}
}

export const runComponentShotDoctor = async ({
	cwd,
	scenarioDir,
	screenshotsDir,
	setup,
}: {
	cwd?: string
	scenarioDir?: string
	screenshotsDir?: string
	setup?: string
} = {}): Promise<ComponentShotDoctorResult> => {
	const paths = resolveWorkspacePaths({ cwd, scenarioDir, screenshotsDir })
	const checks: ComponentShotDoctorCheck[] = []
	const reactPath = resolveFromProject(paths.cwd, 'react')
	checks.push({
		message: reactPath ?? 'React is not installed in the project',
		name: 'react',
		status: reactPath ? 'ok' : 'error',
	})
	const reactDomPath = resolveFromProject(paths.cwd, 'react-dom')
	checks.push({
		message: reactDomPath ?? 'React DOM is not installed in the project',
		name: 'react-dom',
		status: reactDomPath ? 'ok' : 'error',
	})
	checks.push({
		message: (await pathExists(paths.scenarioDir))
			? paths.scenarioDir
			: `Scenario directory will be created at ${paths.scenarioDir}`,
		name: 'scenario-directory',
		status: (await pathExists(paths.scenarioDir)) ? 'ok' : 'warning',
	})
	const setupPath = setup
		? path.resolve(paths.cwd, setup)
		: await findSetupPath(path.dirname(paths.scenarioDir))
	checks.push({
		message:
			setupPath && (await pathExists(setupPath))
				? setupPath
				: setupPath
					? `Configured setup does not exist: ${setupPath}`
					: 'No setup provider found; simple scenarios can still render',
		name: 'setup',
		status: setupPath && (await pathExists(setupPath)) ? 'ok' : setupPath ? 'error' : 'warning',
	})
	const browser = await detectComponentShotBrowser()
	checks.push({
		message: browser.available
			? `${browser.executablePath}${browser.channel ? ` (channel: ${browser.channel})` : ''}`
			: 'No Chromium or supported system browser found. Run component-shot browser install.',
		name: 'browser',
		status: browser.available ? 'ok' : 'error',
	})
	const workspace = await createComponentShotWorkspace({
		cwd: paths.cwd,
		scenarioDir: paths.scenarioDir,
		screenshotsDir: paths.screenshotsDir,
	})
	const scenarios = await workspace.listScenarios()
	checks.push({
		message: `${scenarios.length} scenario${scenarios.length === 1 ? '' : 's'} found`,
		name: 'scenarios',
		status: scenarios.length > 0 ? 'ok' : 'warning',
	})

	return {
		checks,
		cwd: paths.cwd,
		ready: checks.every((check) => check.status !== 'error'),
	}
}

const setupTemplate = `import type { ReactNode } from 'react'
import { createComponentShot } from '@lioneltay/component-shot/react'

export type AppShotState = {
  route?: string
}

export const componentShot = createComponentShot<AppShotState>()
export const scenario = componentShot.scenario

export default componentShot.setup({
	Provider: ({ children }: { children: ReactNode }) => <>{children}</>,
})
`

const scenarioTemplate = `import { scenario } from '../setup'

export default scenario({
  title: 'Component Shot ready',
  tags: ['example'],
  render: () => (
    <main style={{ fontFamily: 'system-ui', padding: 24 }}>
      <h1 style={{ margin: 0 }}>Component Shot is ready</h1>
    </main>
  ),
})
`

export const initializeComponentShot = async ({
	cwd,
	overwrite = false,
	scenarioDir,
}: {
	cwd?: string
	overwrite?: boolean
	scenarioDir?: string
} = {}) => {
	const paths = resolveWorkspacePaths({ cwd, scenarioDir })
	const componentShotDir = path.dirname(paths.scenarioDir)
	const files = [
		{ content: setupTemplate, path: path.join(componentShotDir, 'setup.tsx') },
		{ content: scenarioTemplate, path: path.join(paths.scenarioDir, 'example.tsx') },
	]
	const written: string[] = []
	const skipped: string[] = []
	for (const file of files) {
		await fs.mkdir(path.dirname(file.path), { recursive: true })
		try {
			await fs.writeFile(file.path, file.content, {
				encoding: 'utf8',
				flag: overwrite ? 'w' : 'wx',
			})
			written.push(file.path)
		} catch (error) {
			const code = typeof error === 'object' && error && 'code' in error ? error.code : undefined
			if (!overwrite && code === 'EEXIST') {
				skipped.push(file.path)
				continue
			}
			throw error
		}
	}
	return { componentShotDir, skipped, written }
}

const getPackageManagerInvocation = async (cwd: string) => {
	if (await pathExists(path.join(cwd, 'pnpm-lock.yaml'))) {
		return { args: ['exec', 'component-shot-mcp'], command: 'pnpm' }
	}
	if (await pathExists(path.join(cwd, 'yarn.lock'))) {
		return { args: ['component-shot-mcp'], command: 'yarn' }
	}
	return { args: ['--no-install', 'component-shot-mcp'], command: 'npx' }
}

export const installComponentShotMcpConfig = async ({
	client = 'codex',
	cwd,
}: {
	client?: 'codex'
	cwd?: string
} = {}) => {
	if (client !== 'codex') {
		throw new Error(`Unsupported MCP client: ${client}`)
	}
	const paths = resolveWorkspacePaths({ cwd })
	const configPath = path.join(paths.cwd, '.codex', 'config.toml')
	const current = (await pathExists(configPath)) ? await fs.readFile(configPath, 'utf8') : ''
	const section = '[mcp_servers.component-shot]'
	if (current.includes(section)) {
		return { changed: false, client, configPath }
	}
	const invocation = await getPackageManagerInvocation(paths.cwd)
	const block = `${section}
command = ${JSON.stringify(invocation.command)}
args = ${JSON.stringify(invocation.args)}
startup_timeout_sec = 30
tool_timeout_sec = 120
`
	await fs.mkdir(path.dirname(configPath), { recursive: true })
	await fs.writeFile(configPath, `${current.trimEnd()}${current.trim() ? '\n\n' : ''}${block}`, 'utf8')
	return { changed: true, client, configPath }
}
