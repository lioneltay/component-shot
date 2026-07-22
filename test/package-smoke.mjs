import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'

const run = promisify(execFile)
const repoRoot = path.resolve(import.meta.dirname, '..')
const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'component-shot-package-test-'))
const consumerDir = path.join(tempRoot, 'consumer')

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

  process.stdout.write(`Packed consumer smoke passed: ${filename}\n`)
} finally {
  await fs.rm(tempRoot, { force: true, recursive: true })
}
