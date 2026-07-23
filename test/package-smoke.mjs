import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'

const run = promisify(execFile)
const repoRoot = path.resolve(import.meta.dirname, '..')
const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'component-shot-package-test-'))
const consumerDir = path.join(tempRoot, 'consumer')
const gitSourceDir = path.join(tempRoot, 'git-source')
const gitConsumerDir = path.join(tempRoot, 'git-consumer')

try {
  await fs.mkdir(consumerDir)
  const packed = await run(
    'npm',
    ['pack', '--ignore-scripts', '--json', '--pack-destination', tempRoot],
    { cwd: repoRoot, maxBuffer: 1024 * 1024 },
  )
  const [{ filename }] = JSON.parse(packed.stdout)
  const tarball = path.join(tempRoot, filename)
  await run(
    'npm',
    [
      'install',
      '--prefix',
      consumerDir,
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
      tarball,
      'react@18.3.1',
      'react-dom@18.3.1',
    ],
    { cwd: repoRoot, maxBuffer: 4 * 1024 * 1024 },
  )
	await fs.access(
		path.join(
			consumerDir,
			'node_modules',
			'@lioneltay',
			'component-shot',
			'dist',
			'gallery-client.js',
		),
	)

  const binary = path.join(
    consumerDir,
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'component-shot.cmd' : 'component-shot',
  )
  const runComponentShot = (args, maxBuffer = 1024 * 1024) =>
		run(binary, args, { maxBuffer, shell: process.platform === 'win32' })
  await runComponentShot(['init', '--cwd', consumerDir, '--json'])
  const skill = await runComponentShot(['skill', '--cwd', consumerDir, '--json'])
  assert.equal(JSON.parse(skill.stdout).files.length, 6)
  const mcp = await runComponentShot(['mcp', 'install', '--cwd', consumerDir, '--json'])
  assert.equal(JSON.parse(mcp.stdout).changed, true)
  const doctor = await runComponentShot(['doctor', '--cwd', consumerDir, '--json'])
  assert.equal(JSON.parse(doctor.stdout).ready, true)
  const capture = await runComponentShot(
		[
      'capture',
      '--cwd',
      consumerDir,
      '--scenario',
      'component-shot/scenarios/example.tsx',
      '--json',
		],
		4 * 1024 * 1024,
	)
  const result = JSON.parse(capture.stdout)
  assert.equal(result.metadata.title, 'Component Shot ready')
  assert.equal((await fs.readFile(result.outputPath)).subarray(0, 8).toString('hex'), '89504e470d0a1a0a')

	await Promise.all([fs.mkdir(gitSourceDir), fs.mkdir(gitConsumerDir)])
	for (const entry of [
		'CHANGELOG.md',
		'LICENSE',
		'README.md',
		'docs',
		'package.json',
		'skill',
		'src',
		'tsconfig.json',
	]) {
		await fs.cp(path.join(repoRoot, entry), path.join(gitSourceDir, entry), { recursive: true })
	}
	await run('git', ['init', '--quiet'], { cwd: gitSourceDir })
	await run('git', ['add', '.'], { cwd: gitSourceDir })
	await run(
		'git',
		[
			'-c',
			'user.name=Component Shot Test',
			'-c',
			'user.email=component-shot@example.invalid',
			'commit',
			'--quiet',
			'-m',
			'package fixture',
		],
		{ cwd: gitSourceDir },
	)
	const gitInstallEnvironment = {
		...process.env,
		PATH: [path.dirname(process.execPath), '/usr/bin', '/bin'].join(path.delimiter),
	}
	await run(
		'npm',
		[
			'install',
			'--prefix',
			gitConsumerDir,
			'--no-audit',
			'--no-fund',
			`git+${pathToFileURL(gitSourceDir).href}`,
			'react@18.3.1',
			'react-dom@18.3.1',
		],
		{
			cwd: gitConsumerDir,
			env: gitInstallEnvironment,
			maxBuffer: 8 * 1024 * 1024,
		},
	)
	const gitBinary = path.join(
		gitConsumerDir,
		'node_modules',
		'.bin',
		process.platform === 'win32' ? 'component-shot.cmd' : 'component-shot',
	)
	await fs.access(
		path.join(
			gitConsumerDir,
			'node_modules',
			'@lioneltay',
			'component-shot',
			'dist',
			'gallery-client.js',
		),
	)
	await run(gitBinary, ['init', '--cwd', gitConsumerDir, '--json'], {
		env: gitInstallEnvironment,
		maxBuffer: 1024 * 1024,
		shell: process.platform === 'win32',
	})

  process.stdout.write(`Packed consumer smoke passed: ${filename}\n`)
  process.stdout.write('Git dependency prepare smoke passed without pnpm\n')
} finally {
  await fs.rm(tempRoot, { force: true, recursive: true })
}
