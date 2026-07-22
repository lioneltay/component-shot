import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export type ComponentShotSkillInstallOptions = {
	cwd?: string
	json?: boolean
	name?: string
	outputDir?: string
	overwrite?: boolean
}

export type ComponentShotSkillInstallResult = {
	files: string[]
	skillDir: string
}

type ParsedSkillOptions = Required<Pick<ComponentShotSkillInstallOptions, 'name' | 'outputDir'>> &
	ComponentShotSkillInstallOptions & {
		help: boolean
		json: boolean
	}

const defaultSkillOptions = {
	name: 'component-shot',
	outputDir: '.codex/skills',
} satisfies Required<Pick<ComponentShotSkillInstallOptions, 'name' | 'outputDir'>>

const packagedSkillDir = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	'../skill/component-shot',
)

const isValidSkillName = (value: string) =>
	value.length <= 64 &&
	/^[a-z0-9-]+$/.test(value) &&
	!value.startsWith('-') &&
	!value.endsWith('-') &&
	!value.includes('--')

const pathExists = async (filePath: string) => {
	try {
		await fs.access(filePath)
		return true
	} catch (error) {
		const code = typeof error === 'object' && error && 'code' in error ? error.code : undefined
		if (code === 'ENOENT' || code === 'ENOTDIR') return false
		throw error
	}
}

const walkFiles = async (directory: string): Promise<string[]> => {
	const entries = await fs.readdir(directory, { withFileTypes: true })
	const files = await Promise.all(
		entries.map(async (entry) => {
			const entryPath = path.join(directory, entry.name)
			return entry.isDirectory() ? walkFiles(entryPath) : entry.isFile() ? [entryPath] : []
		}),
	)
	return files.flat().sort((left, right) => left.localeCompare(right))
}

const customizeSkillContent = ({
	content,
	name,
	relativePath,
}: {
	content: string
	name: string
	relativePath: string
}) => {
	if (name === defaultSkillOptions.name) return content
	if (relativePath === 'SKILL.md') {
		return content.replace(/^name: component-shot$/m, `name: ${name}`)
	}
	if (relativePath === 'agents/openai.yaml') {
		return content.replaceAll('$component-shot', `$${name}`)
	}
	return content
}

export const installComponentShotSkill = async (
	optionsInput: ComponentShotSkillInstallOptions = {},
): Promise<ComponentShotSkillInstallResult> => {
	const options = { ...defaultSkillOptions, ...optionsInput }
	if (!isValidSkillName(options.name)) {
		throw new Error(
			'--name must use lowercase letters, numbers, and hyphens, be 1-64 characters long, and not start/end with or contain consecutive hyphens',
		)
	}
	if (!(await pathExists(packagedSkillDir))) {
		throw new Error(`Packaged Component Shot skill is missing at ${packagedSkillDir}`)
	}

	const cwd = path.resolve(process.cwd(), options.cwd ?? '.')
	const outputDir = path.resolve(cwd, options.outputDir)
	const skillDir = path.join(outputDir, options.name)
	await fs.mkdir(outputDir, { recursive: true })
	if (options.overwrite) {
		await fs.rm(skillDir, { force: true, recursive: true })
	}
	try {
		await fs.mkdir(skillDir)
	} catch (error) {
		const code = typeof error === 'object' && error && 'code' in error ? error.code : undefined
		if (!options.overwrite && code === 'EEXIST') {
			throw new Error(`Component Shot skill already exists at ${skillDir}. Use --overwrite to replace it.`)
		}
		throw error
	}

	const sourceFiles = await walkFiles(packagedSkillDir)
	const installedFiles: string[] = []
	for (const sourcePath of sourceFiles) {
		const relativePath = path.relative(packagedSkillDir, sourcePath)
		const destinationPath = path.join(skillDir, relativePath)
		const content = customizeSkillContent({
			content: await fs.readFile(sourcePath, 'utf8'),
			name: options.name,
			relativePath: relativePath.split(path.sep).join('/'),
		})
		await fs.mkdir(path.dirname(destinationPath), { recursive: true })
		await fs.writeFile(destinationPath, content, 'utf8')
		installedFiles.push(destinationPath)
	}

	return { files: installedFiles, skillDir }
}

const createSkillUsage = (usageCommand: string) => `Usage:
  ${usageCommand}

Options:
  --output-dir <path>  Skill parent directory. Defaults to .codex/skills.
  --path <path>        Alias for --output-dir.
  --name <name>        Skill folder/name. Defaults to component-shot.
  --cwd <path>         Repository root. Defaults to the current directory.
  --overwrite          Replace an existing skill directory.
  --json               Print machine-readable install details.
  --help               Show this help message.`

const readFlagValue = (args: string[], index: number, flag: string): [string, number] => {
	const inlineValue = flag.includes('=') ? flag.slice(flag.indexOf('=') + 1) : undefined
	if (inlineValue) return [inlineValue, index]
	const value = args[index + 1]
	if (!value || value.startsWith('--')) throw new Error(`Missing value for ${flag}`)
	return [value, index + 1]
}

const parseSkillCliArgs = ({
	argv,
	usageCommand,
}: {
	argv: string[]
	usageCommand: string
}): ParsedSkillOptions => {
	const options: ParsedSkillOptions = { ...defaultSkillOptions, help: false, json: false }
	const usage = createSkillUsage(usageCommand)
	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index] ?? ''
		const flag = arg.includes('=') ? arg.slice(0, arg.indexOf('=')) : arg
		switch (flag) {
			case '--cwd': {
				const [value, next] = readFlagValue(argv, index, arg)
				options.cwd = value
				index = next
				break
			}
			case '--help':
			case '-h':
				options.help = true
				break
			case '--json':
				options.json = true
				break
			case '--name': {
				const [value, next] = readFlagValue(argv, index, arg)
				options.name = value
				index = next
				break
			}
			case '--output-dir':
			case '--path': {
				const [value, next] = readFlagValue(argv, index, arg)
				options.outputDir = value
				index = next
				break
			}
			case '--overwrite':
				options.overwrite = true
				break
			default:
				throw new Error(`Unknown skill option "${arg}"\n\n${usage}`)
		}
	}
	if (!isValidSkillName(options.name)) {
		throw new Error(
			'--name must use lowercase letters, numbers, and hyphens, be 1-64 characters long, and not start/end with or contain consecutive hyphens',
		)
	}
	return options
}

export const runComponentShotSkillCli = async ({
	argv = process.argv.slice(2),
	usageCommand = 'component-shot skill [options]',
}: {
	argv?: string[]
	usageCommand?: string
} = {}) => {
	const options = parseSkillCliArgs({ argv, usageCommand })
	if (options.help) {
		process.stdout.write(`${createSkillUsage(usageCommand)}\n`)
		return
	}
	const result = await installComponentShotSkill(options)
	if (options.json) {
		process.stdout.write(`${JSON.stringify(result)}\n`)
		return
	}
	process.stdout.write(`Installed Component Shot skill: ${result.skillDir}\n`)
	for (const file of result.files) process.stdout.write(`- ${file}\n`)
}
