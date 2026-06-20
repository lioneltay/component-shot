import { rspack, type Configuration as RspackConfiguration } from '@rspack/core'
import fs from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { ComponentShotBuildContext } from './index.js'
import type { ComponentShotRspackOptions } from './rspack.js'

type PackageJson = {
	name?: string
}

const dirname = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)

const htmlTemplate = () => `<!doctype html>
<html lang="en">
	<head>
		<meta charset="utf-8" />
		<meta name="viewport" content="width=device-width, initial-scale=1" />
		<title>Component Shot</title>
		<link rel="preconnect" href="https://fonts.googleapis.com" />
		<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
		<link
			href="https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;700&display=swap"
			rel="stylesheet"
		/>
		<style>
			html,
			body {
				margin: 0;
				min-height: 100%;
				background: #fff;
				font-family: 'Roboto', 'Helvetica', 'Arial', sans-serif;
			}

			body {
				box-sizing: border-box;
				padding: 24px;
			}

			* {
				box-sizing: border-box;
			}

			pre[data-component-shot-error='true'] {
				margin: 0;
				max-width: 960px;
				overflow: auto;
				padding: 16px;
				white-space: pre-wrap;
			}
		</style>
	</head>
	<body>
		<div id="root"></div>
	</body>
</html>`

const readJson = async <T>(filePath: string): Promise<T | undefined> => {
	try {
		return JSON.parse(await fs.readFile(filePath, 'utf8')) as T
	} catch (error) {
		const code = typeof error === 'object' && error && 'code' in error ? error.code : undefined
		if (code === 'ENOENT') {
			return undefined
		}
		throw error
	}
}

const fileExists = async (filePath: string) => {
	try {
		await fs.access(filePath)
		return true
	} catch {
		return false
	}
}

const findWorkspaceRoot = async (cwd: string) => {
	let current = path.resolve(cwd)

	while (true) {
		if (await fileExists(path.join(current, 'pnpm-workspace.yaml'))) {
			return current
		}

		const parent = path.dirname(current)
		if (parent === current) {
			return cwd
		}
		current = parent
	}
}

const splitPathList = (value: string | undefined) =>
	(value ?? '')
		.split(/[,:]/)
		.map((entry) => entry.trim())
		.filter(Boolean)

const findNodeModulesDirs = async (root: string, packageDirs: string[]) => {
	const nodeModulesDirs: string[] = []
	const rootNodeModules = path.join(root, 'node_modules')
	if (await fileExists(rootNodeModules)) {
		nodeModulesDirs.push(rootNodeModules)
	}

	for (const packageDir of packageDirs) {
		const packagesRoot = path.resolve(root, packageDir)
		let entries: string[]
		try {
			entries = await fs.readdir(packagesRoot)
		} catch (error) {
			const code = typeof error === 'object' && error && 'code' in error ? error.code : undefined
			if (code === 'ENOENT') {
				continue
			}
			throw error
		}

		await Promise.all(
			entries.map(async (entry) => {
				const nodeModulesDir = path.join(packagesRoot, entry, 'node_modules')
				if (await fileExists(nodeModulesDir)) {
					nodeModulesDirs.push(nodeModulesDir)
				}
			}),
		)
	}

	return nodeModulesDirs
}

const discoverDependencyModules = async (options: ComponentShotRspackOptions, packageDirs: string[]) => {
	const dependencyRoots = [
		...splitPathList(process.env.COMPONENT_SHOT_DEPENDENCY_ROOT),
		...splitPathList(process.env.COMPONENT_SHOT_DEPENDENCY_ROOTS),
		...(options.dependencyRoots ?? []),
	]

	const nodeModulesDirs = await Promise.all(
		dependencyRoots.map((root) => findNodeModulesDirs(path.resolve(root), packageDirs)),
	)

	return [...new Set(nodeModulesDirs.flat())]
}

const discoverWorkspaceAliases = async (cwd: string, packageDirs: string[]) => {
	const aliases: Record<string, string> = {}
	const workspaceRoot = await findWorkspaceRoot(cwd)
	const roots = [...new Set([cwd, workspaceRoot])]

	for (const root of roots) {
		for (const packageDir of packageDirs) {
			const packagesRoot = path.resolve(root, packageDir)
			let entries: string[]
			try {
				entries = await fs.readdir(packagesRoot)
			} catch (error) {
				const code = typeof error === 'object' && error && 'code' in error ? error.code : undefined
				if (code === 'ENOENT') {
					continue
				}
				throw error
			}

			await Promise.all(
				entries.map(async (entry) => {
					const packageRoot = path.join(packagesRoot, entry)
					const packageJson = await readJson<PackageJson>(path.join(packageRoot, 'package.json'))
					if (packageJson?.name) {
						aliases[packageJson.name] = packageRoot
					}
				}),
			)
		}
	}

	return aliases
}

const resolveFromProject = (cwd: string, request: string) =>
	path.dirname(require.resolve(`${request}/package.json`, { paths: [cwd, dirname] }))

const createConfig = async ({
	context,
	options,
}: {
	context: ComponentShotBuildContext
	options: ComponentShotRspackOptions
}): Promise<RspackConfiguration> => {
	const setupPath = options.setup
		? path.resolve(context.cwd, options.setup)
		: path.join(dirname, 'runtime/default-setup.js')
	const packageDirs = options.workspacePackageDirs ?? ['packages']
	const [workspaceAliases, dependencyModules] = await Promise.all([
		discoverWorkspaceAliases(context.cwd, packageDirs),
		discoverDependencyModules(options, packageDirs),
	])
	const aliases = Object.fromEntries(
		Object.entries({
			...workspaceAliases,
			...options.aliases,
		}).map(([name, target]) => [name, path.resolve(context.cwd, target)]),
	)
	const tsConfigPath = path.resolve(context.cwd, 'tsconfig.json')
	const tsConfig = (await fileExists(tsConfigPath)) ? tsConfigPath : undefined

	return {
		devtool: 'cheap-module-source-map',
		entry: options.entry ? path.resolve(context.cwd, options.entry) : path.join(dirname, 'runtime/entry.js'),
		externals: ['tinymce'],
		mode: 'development',
		module: {
			rules: [
				{
					resolve: {
						fullySpecified: false,
					},
					test: /\.mjs$/,
					type: 'javascript/auto',
				},
				{
					test: /\.(j|t)sx?$/,
					type: 'javascript/auto',
					use: {
						loader: 'builtin:swc-loader',
						options: {
							env: {
								targets: '> 1%, not dead',
							},
							jsc: {
								parser: {
									syntax: 'typescript',
									tsx: true,
								},
								transform: {
									react: {
										runtime: 'automatic',
									},
								},
							},
							sourceMap: true,
						},
					},
				},
				{
					test: /\.css$/,
					type: 'css/auto',
				},
				{
					test: /\.(png|jpe?g|webp|svg)$/,
					type: 'asset/resource',
				},
				{
					test: /\.(gql|graphql)$/,
					type: 'asset/source',
				},
			],
		},
		optimization: {
			minimize: false,
			splitChunks: false,
		},
		output: {
			filename: 'component-shot.js',
			path: context.publicDir,
			publicPath: options.publicPath ?? '/',
		},
		plugins: [
			new rspack.HtmlRspackPlugin({
				filename: 'index.html',
				templateContent: htmlTemplate(),
			}),
			new rspack.ProvidePlugin({
				Buffer: ['buffer', 'Buffer'],
			}),
		],
		resolve: {
			alias: {
				...aliases,
				__component_shot_scenario__: context.scenarioPath,
				__component_shot_setup__: setupPath,
				react: resolveFromProject(context.cwd, 'react'),
				'react-dom': resolveFromProject(context.cwd, 'react-dom'),
				'react-dom/client': require.resolve('react-dom/client', { paths: [context.cwd, dirname] }),
				'react/jsx-dev-runtime': require.resolve('react/jsx-dev-runtime', {
					paths: [context.cwd, dirname],
				}),
				'react/jsx-runtime': require.resolve('react/jsx-runtime', { paths: [context.cwd, dirname] }),
			},
			extensions: ['.mjs', '.js', '.jsx', '.ts', '.tsx', '.json', '.gql', '.graphql'],
			fallback: {
				buffer: require.resolve('buffer/', { paths: [context.cwd, dirname] }),
			},
			modules: ['node_modules', ...dependencyModules],
			tsConfig,
		},
		target: 'web',
	}
}

const runRspack = async (context: ComponentShotBuildContext, options: ComponentShotRspackOptions) => {
	const config = await createConfig({ context, options })
	await new Promise<void>((resolve, reject) => {
		rspack(config, (error, stats) => {
			if (error) {
				reject(error)
				return
			}

			if (stats?.hasErrors()) {
				reject(new Error(stats.toString({ colors: true, errorDetails: true })))
				return
			}

			if (context.debug && stats) {
				process.stderr.write(`${stats.toString({ colors: true })}\n`)
			}

			resolve()
		})
	})
}

const main = async () => {
	const contextJson = process.env.COMPONENT_SHOT_RSPACK_CONTEXT
	if (!contextJson) {
		throw new Error('COMPONENT_SHOT_RSPACK_CONTEXT is required')
	}

	const context = JSON.parse(contextJson) as ComponentShotBuildContext
	const options = JSON.parse(process.env.COMPONENT_SHOT_RSPACK_OPTIONS ?? '{}') as ComponentShotRspackOptions
	await runRspack(context, options)
}

main().catch((error: unknown) => {
	process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`)
	process.exitCode = 1
})
