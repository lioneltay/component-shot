import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { chromium } from 'playwright'
import {
  createComponentShotMcpServer,
  createComponentShotSession,
  initializeComponentShot,
  startComponentShotGallery,
} from '../dist/index.js'
import { resolveComponentShotBrowserLaunchOptions } from '../dist/browser.js'

const repoRoot = path.resolve(import.meta.dirname, '..')
const scenarioDir = 'demo/component-shot/scenarios'

const assertPng = async (filePath) => {
  const bytes = await fs.readFile(filePath)
  assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a')
}

const readPngSize = (bytes) => {
  assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a')
  return { height: bytes.readUInt32BE(20), width: bytes.readUInt32BE(16) }
}

test('persistent session captures existing and ephemeral React states', async () => {
  const screenshotsDir = await fs.mkdtemp(path.join(os.tmpdir(), 'component-shot-session-test-'))
  const session = await createComponentShotSession({
    cwd: repoRoot,
    scenarioDir,
    screenshotsDir,
  })
  try {
		const [existing, standard] = await Promise.all([
			session.capture({ scenario: 'demo/component-shot/scenarios/product-card.tsx' }),
			session.capture({ scenario: 'demo/component-shot/scenarios/product-card/standard.tsx' }),
		])
    await assertPng(existing.outputPath)
		await assertPng(standard.outputPath)
    assert.equal(existing.metadata.title, 'Featured product card')
    assert.deepEqual(existing.viewport, { height: 560, width: 720 })

    const preview = await session.previewSource({
      name: 'ephemeral-test',
      source: `export default {
        title: 'Ephemeral source',
        viewport: { width: 420, height: 320 },
        render: () => <button style={{ padding: 16 }}>Rendered in one call</button>,
      }`,
    })
    await assertPng(preview.outputPath)
    assert.equal(preview.metadata.title, 'Ephemeral source')
    assert.deepEqual(preview.viewport, { height: 320, width: 420 })
    const scenarioNames = await fs.readdir(path.join(repoRoot, scenarioDir))
    assert.equal(scenarioNames.some((name) => name.startsWith('.component-shot-preview-')), false)
  } finally {
    await session.close()
    await fs.rm(screenshotsDir, { force: true, recursive: true })
  }
})

test('Rspack resolves NodeNext .js specifiers back to React TypeScript source', async () => {
  const fixtureDir = path.join(repoRoot, scenarioDir, `.node-next-${randomUUID()}`)
  const componentPath = path.join(fixtureDir, 'fixture-component.tsx')
  const scenarioPath = path.join(fixtureDir, 'scenario.tsx')
  await fs.mkdir(fixtureDir, { recursive: true })
  await fs.writeFile(
    componentPath,
    `export const FixtureComponent = () => <div data-node-next-source>NodeNext source resolved</div>\n`,
    'utf8',
  )
  await fs.writeFile(
    scenarioPath,
    `import { FixtureComponent } from './fixture-component.js'\nexport default { render: () => <FixtureComponent /> }\n`,
    'utf8',
  )
  const session = await createComponentShotSession({ cwd: repoRoot, scenarioDir })
  try {
    const result = await session.capture({ scenario: path.relative(repoRoot, scenarioPath) })
    await assertPng(result.outputPath)
  } finally {
    await session.close()
    await fs.rm(fixtureDir, { force: true, recursive: true })
  }
})

test('custom scenario roots share setup and screenshot discovery', async () => {
  const fixtureName = `.component-shot-custom-${randomUUID()}`
  const fixtureDir = path.join(repoRoot, fixtureName)
  const fixtureScenarioDir = `${fixtureName}/scenarios`
  await initializeComponentShot({ cwd: repoRoot, scenarioDir: fixtureScenarioDir })
  const session = await createComponentShotSession({ cwd: repoRoot, scenarioDir: fixtureScenarioDir })
  try {
    assert.equal(session.paths.screenshotsDir, path.join(fixtureDir, 'screenshots'))
    const result = await session.capture({ scenario: `${fixtureScenarioDir}/example.tsx` })
    await assertPng(result.outputPath)
    assert.equal(result.metadata.title, 'Component Shot ready')
  } finally {
    await session.close()
    await fs.rm(fixtureDir, { force: true, recursive: true })
  }
})

test('scenario environment metadata is applied before lifecycle hooks run', async () => {
  let requestCount = 0
  const dataServer = http.createServer((_request, response) => {
    requestCount += 1
    response.setHeader('Access-Control-Allow-Origin', '*')
    response.end('{"ready":true}')
  })
  await new Promise((resolve) => dataServer.listen(0, '127.0.0.1', resolve))
  const address = dataServer.address()
  assert.ok(address && typeof address !== 'string')
  const session = await createComponentShotSession({ cwd: repoRoot, scenarioDir })
  try {
    const result = await session.previewSource({
      name: 'metadata-before-lifecycle',
      source: `let loaded = false
        export default {
          environment: { network: 'allow' },
          viewport: { width: 320, height: 280 },
          setup: async () => { await fetch('http://127.0.0.1:${address.port}/state'); loaded = true },
          render: () => <div>{loaded ? 'ready' : 'not ready'}</div>,
        }`,
    })
    await assertPng(result.outputPath)
    assert.equal(requestCount, 1)
  } finally {
    await session.close()
    await new Promise((resolve, reject) =>
      dataServer.close((error) => (error ? reject(error) : resolve())),
    )
  }
})

test('gallery serves full-height workbench views and bounded capture APIs', async () => {
  const screenshotsDir = await fs.mkdtemp(path.join(os.tmpdir(), 'component-shot-gallery-test-'))
  const gallery = await startComponentShotGallery({
    cwd: repoRoot,
    open: false,
    scenarioDir,
    screenshotsDir,
  })
  let browser
  const eventsController = new AbortController()
  try {
		const documentResponse = await fetch(gallery.url)
		const galleryHtml = await documentResponse.text()
		assert.equal(documentResponse.status, 200)
		assert.match(galleryHtml, /<div id="root"><\/div>/)
		assert.match(galleryHtml, /src="\/assets\/gallery-client\.js"/)
		const clientResponse = await fetch(`${gallery.url}/assets/gallery-client.js`)
		assert.equal(clientResponse.status, 200)
		assert.match(clientResponse.headers.get('content-type'), /text\/javascript/)
		assert.ok((await clientResponse.text()).length > 10_000)

    const indexResponse = await fetch(`${gallery.url}/api/scenarios`)
    const index = await indexResponse.json()
    assert.equal(index.scenarios.length, 4)
    const selected = index.scenarios.find((scenario) => scenario.id === 'product-card')
    assert.ok(selected)

    const eventsResponse = await fetch(`${gallery.url}/api/events`, {
      signal: eventsController.signal,
    })
    const eventsReader = eventsResponse.body.getReader()
    await eventsReader.read()

    const captureResponse = await fetch(
      `${gallery.url}/api/scenarios/${encodeURIComponent(selected.routeId)}/capture`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ viewport: { width: 640, height: 480 } }),
      },
    )
    const capture = await captureResponse.json()
    assert.equal(captureResponse.status, 200)
    await assertPng(capture.outputPath)
    const historyEvent = await Promise.race([
      eventsReader.read(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('SSE history event timed out')), 2_000)),
    ])
    assert.match(new TextDecoder().decode(historyEvent.value), /event: history/)

    const traversalResponse = await fetch(
      `${gallery.url}/api/scenarios/${encodeURIComponent(selected.routeId)}/export`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ output: '../outside.png' }),
      },
    )
    assert.equal(traversalResponse.status, 422)

    const crossSiteResponse = await fetch(
      `${gallery.url}/api/scenarios/${encodeURIComponent(selected.routeId)}/capture`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain', Origin: 'https://example.test' },
        body: '{}',
      },
    )
    assert.equal(crossSiteResponse.status, 403)

    browser = await chromium.launch({
      ...(await resolveComponentShotBrowserLaunchOptions()),
      headless: true,
    })
    const page = await browser.newPage({ viewport: { width: 1365, height: 900 } })
    const browserErrors = []
    page.on('pageerror', (error) => browserErrors.push(error.message))
    page.on('console', (message) => {
      if (message.type() === 'error') browserErrors.push(message.text())
    })
    await page.goto(gallery.url)
    await page.locator('[data-render-state]').waitFor({ state: 'hidden', timeout: 20_000 })
    const desktop = await page.evaluate(() => ({
      bodyHeight: document.body.clientHeight,
      bodyScrollHeight: document.body.scrollHeight,
      exportVisible: document.querySelector('[data-export]').getBoundingClientRect().right <= window.innerWidth,
      frameHeight: document.querySelector('[data-preview-frame]').getBoundingClientRect().height,
      globalHeaderCount: document.querySelectorAll('.topbar').length,
      preset: document.querySelector('[data-viewport-preset]').value,
      detailTabCount: document.querySelectorAll('.detail-tab').length,
      visibleStatusCount: document.querySelectorAll('[data-status-text]').length,
    }))
    assert.deepEqual(browserErrors, [])
    assert.equal(desktop.bodyHeight, desktop.bodyScrollHeight)
    assert.equal(desktop.exportVisible, true)
    assert.ok(desktop.frameHeight > 400)
    assert.equal(desktop.globalHeaderCount, 0)
    assert.equal(desktop.preset, 'scenario')
    assert.equal(desktop.detailTabCount, 2)
    assert.equal(desktop.visibleStatusCount, 0)
    assert.equal(await page.locator('.scenario-actions-trigger').count(), index.scenarios.length)
    await page.locator('.scenario-actions-trigger').first().click()
    await page.locator('.scenario-actions-menu').waitFor()
    await page.keyboard.press('Escape')
    assert.equal(await page.locator('.scenario-actions-menu').count(), 0)
    await page.locator('[data-viewport-preset]').selectOption('1440x900')
    await page.waitForFunction(
      () => document.querySelector('[data-viewport-width]')?.value === '1440',
    )
    assert.equal(await page.locator('[data-viewport-width]').inputValue(), '1440')
    await page.locator('[data-viewport-preset]').selectOption('scenario')
    await page.waitForFunction(
      () => document.querySelector('[data-viewport-width]')?.value === '720',
    )
    assert.equal(await page.locator('[data-viewport-width]').inputValue(), '720')

    const widthInput = page.locator('[data-viewport-width]')
    await widthInput.fill('840')
    assert.equal(await page.locator('[data-viewport-shell]').evaluate((node) => node.style.width), '720px')
    await widthInput.press('Enter')
    assert.equal(await widthInput.inputValue(), '840')
    assert.equal(await page.locator('[data-viewport-shell]').evaluate((node) => node.style.width), '840px')

    await page.locator('[data-viewport-preset]').selectOption('scenario')
    const widthHandle = page.locator('[data-viewport-resize="width"]')
    const widthHandleBox = await widthHandle.boundingBox()
    assert.ok(widthHandleBox)
    await page.mouse.move(widthHandleBox.x + widthHandleBox.width / 2, widthHandleBox.y + widthHandleBox.height / 2)
    await page.mouse.down()
    await page.mouse.move(widthHandleBox.x + widthHandleBox.width / 2 + 40, widthHandleBox.y + widthHandleBox.height / 2)
    await page.mouse.up()
    assert.ok(Number(await widthInput.inputValue()) > 720)
    assert.equal(await page.locator('[data-viewport-preset]').inputValue(), 'custom')
    await page.locator('[data-viewport-preset]').selectOption('scenario')

    const expandedStageWidth = await page.locator('.stage').evaluate((node) => node.getBoundingClientRect().width)
    await page.locator('[data-panel-collapse="scenarios"]').click()
    await page.locator('[data-panel-collapse="inspector"]').click()
    const collapsedLayout = await page.evaluate(() => ({
      inspectorWidth: document.querySelector('.inspector').getBoundingClientRect().width,
      scenariosWidth: document.querySelector('.scenario-browser').getBoundingClientRect().width,
      stageWidth: document.querySelector('.stage').getBoundingClientRect().width,
    }))
    assert.ok(collapsedLayout.inspectorWidth <= 44)
    assert.ok(collapsedLayout.scenariosWidth <= 44)
    assert.ok(collapsedLayout.stageWidth > expandedStageWidth + 400)
    await page.locator('[data-panel-collapse="inspector"]').click()
    const collapsedOverviewButton = page.locator(
      '.scenario-browser[data-collapsed="true"] [data-view="overview"]',
    )
    await collapsedOverviewButton.click()
    assert.equal(await collapsedOverviewButton.getAttribute('aria-current'), 'true')
    await page.locator('[data-panel-collapse="scenarios"]').click()

    await assert.doesNotReject(() => page.locator('[data-stage-view="overview"]:not([hidden])').waitFor())
    assert.equal(await page.locator('.scenario-row[aria-current="true"]').count(), 0)
    await page.waitForFunction(
      () => {
        const previews = document.querySelectorAll('[data-overview-preview-state]')
        return previews.length > 0 && [...previews].every((preview) => preview.dataset.overviewPreviewState === 'ready')
      },
      undefined,
      { timeout: 20_000 },
    )
    const overview = await page.evaluate(() => ({
      cardWidth: document.querySelector('.overview-item').getBoundingClientRect().width,
      frameCount: document.querySelectorAll('.overview-preview-frame').length,
      inspectorDisplay: getComputedStyle(document.querySelector('.inspector')).display,
      legacyEmptyStateCount: [...document.querySelectorAll('*')].filter((node) => node.textContent === 'No capture').length,
      stageWidth: document.querySelector('.stage').getBoundingClientRect().width,
    }))
    assert.ok(overview.cardWidth > 300)
    assert.equal(overview.frameCount, index.scenarios.length)
    assert.equal(overview.inspectorDisplay, 'none')
    assert.equal(overview.legacyEmptyStateCount, 0)
    assert.ok(overview.stageWidth > 1_000)

    await page.locator('.scenario-row-main').first().click()
    await assert.doesNotReject(() => page.locator('[data-stage-view="live"]:not([hidden])').waitFor())
    await page.locator('[data-view="history"]').click()
    await assert.doesNotReject(() => page.locator('[data-stage-view="history"]:not([hidden])').waitFor())
    assert.equal(await page.locator('.overview-preview-frame').count(), 0)
    const historyHeight = await page.locator('[data-stage-view="history"]').evaluate((node) => node.clientHeight)
    assert.ok(historyHeight > 700)

    await page.setViewportSize({ width: 390, height: 844 })
    await page.locator('[data-view="live"]').click()
    await page.waitForTimeout(50)
    const mobile = await page.evaluate(() => ({
      actionsWidth: document.querySelector('.toolbar-actions').scrollWidth,
      actionsVisibleWidth: document.querySelector('.toolbar-actions').clientWidth,
      controlsWidth: document.querySelector('.toolbar-controls').scrollWidth,
      controlsVisibleWidth: document.querySelector('.toolbar-controls').clientWidth,
      frameHeight: document.querySelector('[data-preview-frame]').getBoundingClientRect().height,
      panelCollapseDisplay: getComputedStyle(document.querySelector('[data-panel-collapse="scenarios"]')).display,
      pageWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
    }))
    assert.equal(mobile.pageWidth, mobile.viewportWidth)
    assert.equal(mobile.actionsWidth, mobile.actionsVisibleWidth)
    assert.equal(mobile.controlsWidth, mobile.controlsVisibleWidth)
    assert.equal(mobile.panelCollapseDisplay, 'none')
    assert.ok(mobile.frameHeight > 100)
  } finally {
    eventsController.abort()
    await browser?.close()
    await gallery.close()
    await fs.rm(screenshotsDir, { force: true, recursive: true })
  }
})

test('read-only gallery blocks every artifact and source mutation', async () => {
  const screenshotsDir = await fs.mkdtemp(path.join(os.tmpdir(), 'component-shot-read-only-test-'))
  const gallery = await startComponentShotGallery({
    cwd: repoRoot,
    editable: false,
    open: false,
    scenarioDir,
    screenshotsDir,
  })
  try {
    const index = await fetch(`${gallery.url}/api/scenarios`).then((response) => response.json())
    const routeId = index.scenarios[0].routeId
    for (const request of [
      fetch(`${gallery.url}/api/scenarios/${routeId}/capture`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      }),
      fetch(`${gallery.url}/api/scenarios/${routeId}/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ output: 'docs/read-only.png' }),
      }),
      fetch(`${gallery.url}/api/scenarios/${routeId}`, { method: 'DELETE' }),
    ]) {
      assert.equal((await request).status, 403)
    }
  } finally {
    await gallery.close()
    await fs.rm(screenshotsDir, { force: true, recursive: true })
  }
})

test('MCP exposes one capture tool for source, scenarios, focused regions, and artifacts', async () => {
	const demoRoot = path.join(repoRoot, 'demo')
  const watchedScenario = path.join(
    repoRoot,
    scenarioDir,
    '.states',
    `mcp-watch-${randomUUID()}.tsx`,
  )
  const watchedScenarioRelative = path.relative(repoRoot, watchedScenario)
  const persistedScenario = path.join(
    repoRoot,
    scenarioDir,
    '.states',
    `mcp-persisted-${randomUUID()}.tsx`,
  )
  const persistedScenarioRelative = path.relative(repoRoot, persistedScenario)
	const exportDir = path.join(demoRoot, `.component-shot-mcp-export-${randomUUID()}`)
	const exportRelative = path.relative(demoRoot, path.join(exportDir, 'focused-card.png'))
	const zeroSetupProject = path.join(repoRoot, `.component-shot-zero-setup-${randomUUID()}`)
	await fs.mkdir(zeroSetupProject)
  await fs.mkdir(path.dirname(watchedScenario), { recursive: true })
  const writeWatchedScenario = (color) =>
    fs.writeFile(
      watchedScenario,
      `export default { viewport: { width: 320, height: 280 }, render: () => <div style={{ width: 160, height: 120, background: '${color}' }} /> }\n`,
      'utf8',
    )
  await writeWatchedScenario('#dc2626')
	const service = await createComponentShotMcpServer({
		cwd: repoRoot,
		watchSourceChanges: false,
	})
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  const client = new Client({ name: 'component-shot-test', version: '1.0.0' })
  await service.server.connect(serverTransport)
  await client.connect(clientTransport)
  try {
    const tools = await client.listTools()
    assert.deepEqual(tools.tools.map((tool) => tool.name), ['capture_component_shot'])
    assert.match(tools.tools[0].description, /existing Component Shot scenario or complete TSX/)
    assert.deepEqual(Object.keys(tools.tools[0].inputSchema.properties).sort(), [
      'animations',
      'area',
      'environment',
      'saveScreenshot',
      'target',
      'timeoutMs',
      'viewport',
      'waitFor',
    ])

    const preview = await client.callTool({
      arguments: {
        area: { type: 'viewport' },
        target: {
          code: `export default {
          title: 'MCP one-call preview',
          viewport: { width: 360, height: 300 },
          render: () => <div style={{ padding: 24 }}>Agent can inspect this image now</div>,
        }`,
			project: 'demo',
          type: 'source',
        },
      },
      name: 'capture_component_shot',
    })
    assert.equal(preview.isError ?? false, false)
    assert.deepEqual(preview.content.map((item) => item.type), ['text', 'image'])
    assert.deepEqual(preview.structuredContent.viewport, { height: 300, width: 360 })
    assert.equal(preview.structuredContent.persistentScenario, false)
    assert.equal(preview.structuredContent.scenarioPath, undefined)
		assert.equal(preview.structuredContent.projectRoot, demoRoot)
		assert.deepEqual(preview.structuredContent.setup, {
			mode: 'project',
			path: path.join(demoRoot, 'component-shot/setup.tsx'),
		})
    const previewImage = preview.content.find((item) => item.type === 'image')
    assert.deepEqual(readPngSize(Buffer.from(previewImage.data, 'base64')), {
      height: 300,
      width: 360,
    })

    const fullPage = await client.callTool({
      arguments: {
        area: { type: 'page' },
        target: {
          code: `export default {
            viewport: { width: 320, height: 240 },
            render: () => <div style={{ height: 640, background: '#f8fafc' }}>Long composition</div>,
          }`,
			project: 'demo',
          type: 'source',
        },
      },
      name: 'capture_component_shot',
    })
    const fullPageImage = fullPage.content.find((item) => item.type === 'image')
    const fullPageSize = readPngSize(Buffer.from(fullPageImage.data, 'base64'))
    assert.equal(fullPageSize.width, 320)
    assert.ok(fullPageSize.height >= 640)

    const focused = await client.callTool({
      arguments: {
        area: { selector: '[data-shot="focused"]', type: 'element' },
        saveScreenshot: { type: 'history' },
        target: {
          code: `export default {
            title: 'Persisted focused element',
            viewport: { width: 480, height: 320 },
            render: () => <main style={{ padding: 40 }}>
              <div data-shot="focused" style={{ width: 160, height: 120, background: '#2563eb' }} />
            </main>,
          }`,
          persistAs: persistedScenarioRelative,
			project: 'demo',
          type: 'source',
        },
      },
      name: 'capture_component_shot',
    })
    assert.equal(focused.isError ?? false, false)
    assert.equal(focused.structuredContent.persistentScenario, true)
    assert.equal(focused.structuredContent.scenarioPath, persistedScenario)
    await Promise.all([
      fs.access(persistedScenario),
      assertPng(focused.structuredContent.historyPath),
      assertPng(focused.structuredContent.latestPath),
    ])
    const focusedImage = focused.content.find((item) => item.type === 'image')
    assert.deepEqual(readPngSize(Buffer.from(focusedImage.data, 'base64')), {
      height: 120,
      width: 160,
    })

    const duplicateSource = await client.callTool({
      arguments: {
        target: {
          code: 'export default { render: () => <div>Do not overwrite</div> }',
          persistAs: persistedScenarioRelative,
          type: 'source',
        },
      },
      name: 'capture_component_shot',
    })
    assert.equal(duplicateSource.isError, true)
    assert.match(
      duplicateSource.content.find((item) => item.type === 'text').text,
      /already exists/,
    )

    const exported = await client.callTool({
      arguments: {
        saveScreenshot: { path: exportRelative, type: 'file' },
        target: {
          code: `export default {
            viewport: { width: 320, height: 240 },
            render: () => <div>Standalone documentation image</div>,
          }`,
			project: 'demo',
          type: 'source',
        },
      },
      name: 'capture_component_shot',
    })
		assert.equal(exported.structuredContent.outputPath, path.join(demoRoot, exportRelative))
    assert.equal(exported.structuredContent.persistentScenario, false)
		await assertPng(path.join(demoRoot, exportRelative))

    const invalidHistory = await client.callTool({
      arguments: {
        saveScreenshot: { type: 'history' },
        target: {
          code: 'export default { render: () => <div>Invalid history</div> }',
			project: 'demo',
          type: 'source',
        },
      },
      name: 'capture_component_shot',
    })
    assert.equal(invalidHistory.isError, true)
    assert.match(
      invalidHistory.content.find((item) => item.type === 'text').text,
      /Gallery history requires an existing scenario or source with persistAs/,
    )

		const missingProject = await client.callTool({
			arguments: {
				target: {
					code: 'export default { render: () => <div>Missing project</div> }',
					type: 'source',
				},
			},
			name: 'capture_component_shot',
		})
		assert.equal(missingProject.isError, true)
		assert.match(missingProject.content.find((item) => item.type === 'text').text, /project/i)

		const zeroSetup = await client.callTool({
			arguments: {
				target: {
					code: 'export default { render: () => <div>Zero setup works</div> }',
					project: path.relative(repoRoot, zeroSetupProject),
					type: 'source',
				},
			},
			name: 'capture_component_shot',
		})
		assert.equal(zeroSetup.isError ?? false, false)
		assert.equal(zeroSetup.structuredContent.projectRoot, zeroSetupProject)
		assert.deepEqual(zeroSetup.structuredContent.setup, { mode: 'default' })

		const missingProviderHint = await client.callTool({
			arguments: {
				target: {
					code: `export default {
						render: () => { throw new Error('Missing application context') },
					}`,
					project: path.relative(repoRoot, zeroSetupProject),
					type: 'source',
				},
			},
			name: 'capture_component_shot',
		})
		assert.equal(missingProviderHint.isError, true)
		assert.match(
			missingProviderHint.content.find((item) => item.type === 'text').text,
			/No Component Shot setup was found/,
		)
		await assert.rejects(
			fs.access(path.join(zeroSetupProject, 'component-shot')),
			(error) => error?.code === 'ENOENT',
		)

		const conflictingProject = await client.callTool({
			arguments: {
				target: {
					path: watchedScenarioRelative,
					project: '.',
					type: 'scenario',
				},
			},
			name: 'capture_component_shot',
		})
		assert.equal(conflictingProject.isError, true)
		assert.match(
			conflictingProject.content.find((item) => item.type === 'text').text,
			/conflicts with scenario/i,
		)

		const conflictingPersistAs = await client.callTool({
			arguments: {
				target: {
					code: 'export default { render: () => <div>Conflicting project</div> }',
					persistAs: persistedScenarioRelative,
					project: '.',
					type: 'source',
				},
			},
			name: 'capture_component_shot',
		})
		assert.equal(conflictingPersistAs.isError, true)
		assert.match(
			conflictingPersistAs.content.find((item) => item.type === 'text').text,
			/conflicts with persistAs path/i,
		)

    const firstCapture = await client.callTool({
			arguments: {
				target: { path: watchedScenarioRelative, project: 'demo', type: 'scenario' },
			},
      name: 'capture_component_shot',
    })
    await writeWatchedScenario('#2563eb')
    const [secondCapture, concurrentCapture] = await Promise.all([
      client.callTool({
        arguments: { target: { path: watchedScenarioRelative, type: 'scenario' } },
        name: 'capture_component_shot',
      }),
      client.callTool({
        arguments: { target: { path: watchedScenarioRelative, type: 'scenario' } },
        name: 'capture_component_shot',
      }),
    ])
    const firstImage = firstCapture.content.find((item) => item.type === 'image')
    const secondImage = secondCapture.content.find((item) => item.type === 'image')
    const concurrentImage = concurrentCapture.content.find((item) => item.type === 'image')
    assert.notEqual(firstImage.data, secondImage.data)
    assert.equal(secondImage.data, concurrentImage.data)
  } finally {
    await client.close()
    await service.close()
    await Promise.all([
      fs.rm(exportDir, { force: true, recursive: true }),
      fs.rm(persistedScenario, { force: true }),
			fs.rm(path.join(demoRoot, 'component-shot/screenshots/.states', path.basename(persistedScenario, '.tsx')), {
				force: true,
				recursive: true,
			}),
			fs.rm(watchedScenario, { force: true }),
			fs.rm(zeroSetupProject, { force: true, recursive: true }),
    ])
  }
})

test('MCP stdio process shuts down when its client closes stdin', async () => {
  const child = spawn(process.execPath, [path.join(repoRoot, 'dist/mcp.js')], {
    cwd: repoRoot,
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  child.stdin.end()
  let timeout
  const exitCode = await Promise.race([
		new Promise((resolve, reject) => {
			child.once('error', reject)
			child.once('close', resolve)
		}),
		new Promise((_, reject) => {
			timeout = setTimeout(() => {
				child.kill('SIGKILL')
				reject(new Error('MCP process did not stop after stdin closed'))
			}, 3_000)
		}),
	]).finally(() => clearTimeout(timeout))
  assert.equal(exitCode, 0)
})
