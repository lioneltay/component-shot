import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import {
  initializeComponentShot,
  installComponentShotSkill,
  runComponentShotDoctor,
} from '../dist/index.js'
import { assertPathWithin, getScenarioInfo } from '../dist/scenarios.js'

const repoRoot = path.resolve(import.meta.dirname, '..')

test('init creates typed React provider setup and a reusable scenario', async () => {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'component-shot-init-test-'))
  try {
    const result = await initializeComponentShot({ cwd, scenarioDir: 'ui/scenarios' })
    assert.equal(result.written.length, 2)
    const setup = await fs.readFile(path.join(cwd, 'ui/setup.tsx'), 'utf8')
    const scenario = await fs.readFile(path.join(cwd, 'ui/scenarios/example.tsx'), 'utf8')
    assert.match(setup, /@lioneltay\/component-shot\/react/)
    assert.match(setup, /createComponentShot<AppShotState>/)
    assert.match(scenario, /title: 'Component Shot ready'/)

    const second = await initializeComponentShot({ cwd, scenarioDir: 'ui/scenarios' })
    assert.equal(second.written.length, 0)
    assert.equal(second.skipped.length, 2)
  } finally {
    await fs.rm(cwd, { force: true, recursive: true })
  }
})

test('skill installer copies the complete package and customizes its identity', async () => {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'component-shot-skill-test-'))
  try {
    const result = await installComponentShotSkill({ cwd, name: 'react-visual-loop' })
    assert.equal(result.files.length, 6)
    const skill = await fs.readFile(path.join(result.skillDir, 'SKILL.md'), 'utf8')
    const metadata = await fs.readFile(path.join(result.skillDir, 'agents/openai.yaml'), 'utf8')
    assert.match(skill, /^name: react-visual-loop$/m)
    assert.match(metadata, /\$react-visual-loop/)
    await assert.rejects(() => installComponentShotSkill({ cwd, name: 'react-visual-loop' }), /already exists/)
  } finally {
    await fs.rm(cwd, { force: true, recursive: true })
  }
})

test('repo-local skill matches the canonical packaged skill', async () => {
  const canonical = path.join(repoRoot, 'skill/component-shot')
  const installed = path.join(repoRoot, '.codex/skills/component-shot')
  const compareDirectory = async (relative = '') => {
    const canonicalEntries = await fs.readdir(path.join(canonical, relative), { withFileTypes: true })
    const installedEntries = await fs.readdir(path.join(installed, relative), { withFileTypes: true })
    assert.deepEqual(
      installedEntries.map((entry) => entry.name).sort(),
      canonicalEntries.map((entry) => entry.name).sort(),
    )
    for (const entry of canonicalEntries) {
      const entryRelative = path.join(relative, entry.name)
      if (entry.isDirectory()) {
        await compareDirectory(entryRelative)
      } else {
        assert.equal(
          await fs.readFile(path.join(installed, entryRelative), 'utf8'),
          await fs.readFile(path.join(canonical, entryRelative), 'utf8'),
        )
      }
    }
  }
  await compareDirectory()
})

test('path containment rejects traversal through a symlink', async () => {
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'component-shot-path-test-'))
  const root = path.join(parent, 'root')
  const outside = path.join(parent, 'outside')
  await fs.mkdir(root)
  await fs.mkdir(outside)
  await fs.symlink(outside, path.join(root, 'linked'))
  await fs.symlink(path.join(outside, 'not-created.tsx'), path.join(root, 'dangling.tsx'))
  try {
    await assert.rejects(
      () => assertPathWithin({ candidate: path.join(root, 'linked', 'capture.png'), root }),
      /resolves outside/,
    )
    await assert.rejects(
      () => assertPathWithin({ candidate: path.join(root, 'dangling.tsx'), root }),
      /dangling symbolic link/,
    )
    assert.equal(
      await assertPathWithin({ candidate: path.join(root, 'nested', 'capture.png'), root }),
      path.join(root, 'nested', 'capture.png'),
    )
  } finally {
    await fs.rm(parent, { force: true, recursive: true })
  }
})

test('scenario identity includes nested paths and avoids basename collisions', () => {
  const cwd = '/project'
  const scenarioDir = '/project/component-shot/scenarios'
  const first = getScenarioInfo({ cwd, scenarioDir, scenarioPath: `${scenarioDir}/account/loading.tsx` })
  const second = getScenarioInfo({ cwd, scenarioDir, scenarioPath: `${scenarioDir}/billing/loading.tsx` })
  assert.equal(first.id, 'account/loading')
  assert.equal(second.id, 'billing/loading')
  assert.notEqual(first.routeId, second.routeId)
  assert.notEqual(first.artifactKey, second.artifactKey)

  const file = getScenarioInfo({ cwd, scenarioDir, scenarioPath: `${scenarioDir}/card.tsx` })
  const index = getScenarioInfo({ cwd, scenarioDir, scenarioPath: `${scenarioDir}/card/index.tsx` })
  const spaced = getScenarioInfo({ cwd, scenarioDir, scenarioPath: `${scenarioDir}/foo bar.tsx` })
  const dashed = getScenarioInfo({ cwd, scenarioDir, scenarioPath: `${scenarioDir}/foo-bar.tsx` })
  assert.equal(index.id, 'card/index')
  assert.notEqual(file.routeId, index.routeId)
  assert.notEqual(spaced.artifactKey, dashed.artifactKey)
})

test('doctor recognizes React, scenarios, setup, and an automatic browser', async () => {
  const result = await runComponentShotDoctor({
    cwd: repoRoot,
    scenarioDir: 'demo/component-shot/scenarios',
    setup: 'demo/component-shot/setup.tsx',
  })
  assert.equal(result.ready, true)
  assert.equal(result.checks.find((check) => check.name === 'browser')?.status, 'ok')
  assert.equal(result.checks.find((check) => check.name === 'scenarios')?.message, '4 scenarios found')
})
