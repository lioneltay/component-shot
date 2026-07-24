import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import test from 'node:test'
import { chromium } from 'playwright'
import { exportComponentShotGallery } from '../dist/index.js'
import { resolveComponentShotBrowserLaunchOptions } from '../dist/browser.js'

const run = promisify(execFile)
const repoRoot = path.resolve(import.meta.dirname, '..')
const cliPath = path.join(repoRoot, 'dist/cli.js')
const fixturePng = path.join(repoRoot, 'component-shot/fixtures/gallery-product-card.png')

const writeScenario = ({ scenarioDir, filename, source }) =>
  fs.writeFile(path.join(scenarioDir, filename), `${source.trim()}\n`, 'utf8')

const createFixtureProject = async ({
  includeFailure = false,
  tallCapture = false,
} = {}) => {
  const cwd = await fs.mkdtemp(path.join(repoRoot, '.component-shot-gallery-export-test-'))
  const scenarioDir = path.join(cwd, 'component-shot/scenarios')
  const screenshotsDir = path.join(cwd, 'component-shot/screenshots')
  await fs.mkdir(scenarioDir, { recursive: true })
  const captureOptions = tallCapture
    ? 'capture: { fullPage: true }, viewport: { width: 1440, height: 900 },'
    : 'viewport: { width: 640, height: 480 },'
  const contentHeight = tallCapture ? 2400 : 320
  const endMarkerMargin = tallCapture ? 2100 : 120

  await writeScenario({
    filename: 'alpha.tsx',
    scenarioDir,
    source: String.raw`
      export default {
        title: 'Alpha export scenario',
        description: 'Safe metadata </script><script>window.__COMPONENT_SHOT_INJECTED__ = true</script>',
        tags: ['review', '<img src=x onerror=alert(1)>'],
        ${captureOptions}
        render: () => {
          console.warn(
            'Alpha export diagnostic at location,/Users/Diagnostic User/private/token.txt',
          )
          console.warn(
            'Pattern \\d+ did not match; expected \\n; numerator / denominator; route /api/users; nested route /api/v1/users; asset /assets/icons/check.svg; regex /foo/bar/baz/; closing tag </Button>; invalid escape \\q',
          )
          return (
            <main
              style={{
                minHeight: ${contentHeight},
                background: '#eff6ff',
                color: '#1e3a8a',
                padding: 32,
              }}
            >
              <h1>Alpha export content</h1>
              <p>Tall screenshot content for the scrollable image viewer.</p>
              <p style={{ marginTop: ${endMarkerMargin} }}>End of the screenshot.</p>
            </main>
          )
        },
      }
    `,
  })

  if (includeFailure) {
    await writeScenario({
      filename: 'broken.tsx',
      scenarioDir,
      source: String.raw`
        export default {
          title: 'Broken export scenario',
          viewport: { width: 320, height: 240 },
          render: () => {
            throw new Error(
              'Intentional static gallery export failure at \u0060/Users/Alice Smith/private/(token).txt\u0060, unknown roots \u0060/data/secret.txt\u0060 and \u0060/repo/token\u0060, drive "C:\\Users\\Alice Smith\\private\\(token).txt", UNC \u0060\\\\server\\share\\private\\token.txt\u0060, extended \u0060\\\\?\\C:\\Users\\Alice\\private\\token.txt\u0060, angles </Users/Angle User/private/token.txt>, </build/output.log>, and <C:\\Users\\Angle User\\private\\token.txt>, rooted \\Users\\Rooted User\\private\\token.txt<end>, punctuation,/Users/Punctuation User/private/token.txt',
            )
          },
        }
      `,
    })
  }

  const historyPath = path.join(
    screenshotsDir,
    'alpha/history/2026-07-23T00-00-00-000Z.png',
  )
  await fs.mkdir(path.dirname(historyPath), { recursive: true })
  await fs.copyFile(fixturePng, historyPath)

  return {
    cwd,
    historyPath,
    scenarioDir: 'component-shot/scenarios',
    screenshotsDir: 'component-shot/screenshots',
  }
}

const countDataImages = (html) => html.match(/data:image\/png;base64,/g)?.length ?? 0

const waitForScrollToSettle = (locator) =>
  locator.evaluate(
    (element) =>
      new Promise((resolve, reject) => {
        let frames = 0
        let previous = element.scrollTop
        let stableFrames = 0
        const timeout = setTimeout(
          () => reject(new Error('Timed out waiting for scrolling to settle')),
          3000,
        )
        const check = () => {
          frames += 1
          const current = element.scrollTop
          stableFrames = Math.abs(current - previous) < 0.25 ? stableFrames + 1 : 0
          previous = current
          if (stableFrames >= 3) {
            clearTimeout(timeout)
            resolve()
          }
          else if (frames >= 180) {
            clearTimeout(timeout)
            reject(new Error('Timed out waiting for scrolling to settle'))
          }
          else requestAnimationFrame(check)
        }
        requestAnimationFrame(check)
      }),
  )

const listRelativeFiles = async (root, current = root) => {
  const entries = await fs.readdir(current, { withFileTypes: true })
  const files = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(current, entry.name)
      if (entry.isDirectory()) return listRelativeFiles(root, entryPath)
      return entry.isFile() ? [path.relative(root, entryPath)] : []
    }),
  )
  return files.flat().sort()
}

test('programmatic gallery export is self-contained, resilient, and preserves history', async () => {
  const fixture = await createFixtureProject({ includeFailure: true })
  const output = 'exports/shared-gallery.html'
  const supportsPermissionFailures =
    process.platform !== 'win32' && process.getuid?.() !== 0
  let browser
  let viewerFixture

  try {
    await assert.rejects(
      exportComponentShotGallery({
        cwd: fixture.cwd,
        output: '../outside.html',
        scenarioDir: fixture.scenarioDir,
      }),
      /must stay within/,
    )
    await assert.rejects(
      exportComponentShotGallery({
        cwd: fixture.cwd,
        output: 'exports/not-html.txt',
        scenarioDir: fixture.scenarioDir,
      }),
      /must end in \.html/,
    )

    const historyBefore = await fs.readFile(fixture.historyPath)
    const historyStatBefore = await fs.stat(fixture.historyPath)
    const screenshotFilesBefore = await listRelativeFiles(
      path.join(fixture.cwd, fixture.screenshotsDir),
    )
    const historyDir = path.dirname(fixture.historyPath)
    if (supportsPermissionFailures) await fs.chmod(historyDir, 0o000)
    let withoutHistory
    try {
      withoutHistory = await exportComponentShotGallery({
        cwd: fixture.cwd,
        output,
        scenarioDir: fixture.scenarioDir,
        screenshotsDir: fixture.screenshotsDir,
      })
    } finally {
      if (supportsPermissionFailures) await fs.chmod(historyDir, 0o755)
    }
    assert.equal(withoutHistory.outputPath, path.join(fixture.cwd, output))
    assert.equal(withoutHistory.scenarioCount, 2)
    assert.equal(withoutHistory.capturedCount, 1)
    assert.equal(withoutHistory.failedCount, 1)
    assert.equal(withoutHistory.historyBytes, 0)
    assert.equal(withoutHistory.historyCount, 0)
    assert.equal(withoutHistory.historyWarningCount, 0)
    assert.equal(withoutHistory.failures.length, 1)
    assert.deepEqual(withoutHistory.warnings, [])
    const failureJson = JSON.stringify(withoutHistory.failures)
    assert.match(failureJson, /broken/i)
    assert.match(failureJson, /intentional static gallery export failure/i)
    assert.doesNotMatch(failureJson, /\/Users\//)
    assert.doesNotMatch(failureJson, /\/(?:build|data|repo)\//)
    assert.doesNotMatch(failureJson, /Users\\\\/)
    assert.doesNotMatch(failureJson, /server\\\\share/)

    const firstHtml = await fs.readFile(withoutHistory.outputPath, 'utf8')
    assert.equal(withoutHistory.bytes, Buffer.byteLength(firstHtml))
    assert.match(firstHtml, /data-static-gallery/)
    assert.match(firstHtml, /data-gallery-card/)
    assert.match(firstHtml, /data-gallery-search/)
    assert.match(firstHtml, /data-gallery-dialog/)
    assert.match(firstHtml, /Safe metadata &lt;\/script&gt;/)
    assert.match(firstHtml, /Alpha export diagnostic/)
    assert.match(firstHtml, /Pattern \\d\+ did not match/)
    assert.match(firstHtml, /expected \\n/)
    assert.match(firstHtml, /numerator \/ denominator/)
    assert.match(firstHtml, /route \/api\/users/)
    assert.match(firstHtml, /nested route \/api\/v1\/users/)
    assert.match(firstHtml, /asset \/assets\/icons\/check\.svg/)
    assert.match(firstHtml, /regex \/foo\/bar\/baz\//)
    assert.match(firstHtml, /closing tag &lt;\/Button&gt;/)
    assert.match(firstHtml, /invalid escape \\q/)
    assert.doesNotMatch(firstHtml, /\/Users\//)
    assert.doesNotMatch(firstHtml, /Users\\/)
    assert.doesNotMatch(firstHtml, /server\\share/)
    assert.match(firstHtml, /\[path\]/)
    const currentImageReferenceCount = countDataImages(firstHtml)
    assert.equal(currentImageReferenceCount, 1)

    await assert.rejects(
      () =>
        exportComponentShotGallery({
          cwd: fixture.cwd,
          output,
          scenarioDir: fixture.scenarioDir,
          screenshotsDir: fixture.screenshotsDir,
        }),
      /already exists|overwrite/i,
    )

    const withHistory = await exportComponentShotGallery({
      cwd: fixture.cwd,
      includeHistory: true,
      output,
      overwrite: true,
      scenarioDir: fixture.scenarioDir,
      screenshotsDir: fixture.screenshotsDir,
    })
    assert.equal(withHistory.scenarioCount, 2)
    assert.equal(withHistory.capturedCount, 1)
    assert.equal(withHistory.failedCount, 1)
    assert.ok(withHistory.historyBytes > 0)
    assert.equal(withHistory.historyCount, 1)
    assert.equal(withHistory.historyWarningCount, 0)
    assert.equal(withHistory.failures.length, 1)
    assert.deepEqual(withHistory.warnings, [])

    const html = await fs.readFile(withHistory.outputPath, 'utf8')
    assert.equal(withHistory.bytes, Buffer.byteLength(html))
    assert.equal(countDataImages(html), currentImageReferenceCount + 1)
    assert.deepEqual(await fs.readFile(fixture.historyPath), historyBefore)
    assert.equal((await fs.stat(fixture.historyPath)).mtimeMs, historyStatBefore.mtimeMs)
    assert.deepEqual(
      await listRelativeFiles(path.join(fixture.cwd, fixture.screenshotsDir)),
      screenshotFilesBefore,
    )
    await assert.rejects(
      fs.access(path.join(fixture.cwd, fixture.screenshotsDir, 'alpha/latest.png')),
      (error) => error?.code === 'ENOENT',
    )

    {
      const historyWarningResult = await exportComponentShotGallery({
        cwd: fixture.cwd,
        includeHistory: true,
        maxHistoryBytes: 0,
        output: 'exports/history-warning-gallery.html',
        scenarioDir: fixture.scenarioDir,
        screenshotsDir: fixture.screenshotsDir,
      })
      assert.equal(historyWarningResult.historyBytes, 0)
      assert.equal(historyWarningResult.historyCount, 0)
      assert.equal(historyWarningResult.historyWarningCount, 1)
      assert.equal(historyWarningResult.warnings.length, 1)
      assert.equal(historyWarningResult.warnings[0].kind, 'history')
      assert.equal(historyWarningResult.warnings[0].stage, 'artifact')
      assert.equal(
        historyWarningResult.warnings[0].filename,
        path.basename(fixture.historyPath),
      )
      await fs.access(historyWarningResult.outputPath)
    }

    viewerFixture = await createFixtureProject({
      includeFailure: true,
      tallCapture: true,
    })
    const viewerExport = await exportComponentShotGallery({
      cwd: viewerFixture.cwd,
      includeHistory: true,
      output: 'exports/viewer-gallery.html',
      scenarioDir: viewerFixture.scenarioDir,
      screenshotsDir: viewerFixture.screenshotsDir,
    })

    browser = await chromium.launch({
      ...(await resolveComponentShotBrowserLaunchOptions()),
      headless: true,
    })
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    const browserErrors = []
    const externalRequests = []
    const galleryUrl = pathToFileURL(viewerExport.outputPath).href
    page.on('console', (message) => {
      if (message.type() === 'error') browserErrors.push(message.text())
    })
    page.on('pageerror', (error) => browserErrors.push(error.message))
    page.on('request', (request) => {
      const protocol = new URL(request.url()).protocol
      if (request.url() !== galleryUrl && protocol !== 'data:') {
        externalRequests.push(request.url())
      }
    })

    await page.goto(galleryUrl)
    await page.locator('[data-static-gallery]').waitFor()
    assert.equal(
      await page.evaluate(() => window.__COMPONENT_SHOT_INJECTED__),
      undefined,
    )
    assert.equal(await page.locator('[data-gallery-card]').count(), 2)
    assert.equal(
      await page.locator('[data-gallery-card]').evaluateAll((cards) =>
        cards.filter((card) =>
          Boolean(card.querySelector('img[src^="data:image/png;base64,"]')),
        ).length,
      ),
      viewerExport.capturedCount,
    )

    const search = page.locator('[data-gallery-search]')
    await search.focus()
    assert.deepEqual(
      await search.evaluate((element) => {
        const styles = getComputedStyle(element)
        return {
          color: styles.outlineColor,
          style: styles.outlineStyle,
          width: styles.outlineWidth,
        }
      }),
      { color: 'rgb(15, 118, 110)', style: 'solid', width: '3px' },
    )
    await search.fill('broken')
    assert.equal(await page.locator('[data-gallery-card]:visible').count(), 1)
    await page
      .locator('[data-gallery-card]:visible')
      .getByText(/Broken|Intentional/)
      .first()
      .waitFor()
    await page.locator('[data-gallery-card]:visible [data-gallery-open]').first().click()
    const failedDialog = page.locator('[data-gallery-dialog]:visible')
    await failedDialog.waitFor()
    await failedDialog
      .getByText('Intentional static gallery export failure')
      .first()
      .waitFor()
    await failedDialog.locator('[data-gallery-close]').click()

    await search.fill('Alpha export')
    assert.equal(await page.locator('[data-gallery-card]:visible').count(), 1)
    const capturedOpener = page.locator(
      '[data-gallery-card]:visible .card-preview[data-gallery-open]',
    )
    await capturedOpener.click()
    const capturedDialog = page.locator('[data-gallery-dialog]:visible')
    await capturedDialog.waitFor()
    await capturedDialog.evaluate((dialog) =>
      Promise.all(dialog.getAnimations().map((animation) => animation.finished)),
    )
    const desktopDialogBox = await capturedDialog.boundingBox()
    assert.ok(desktopDialogBox)
    assert.ok(desktopDialogBox.width >= 1240)
    assert.ok(desktopDialogBox.height >= 860)
    const dialogImage = capturedDialog.locator('[data-gallery-dialog-image]')
    assert.match(await dialogImage.getAttribute('src'), /^data:image\/png;base64,/)
    await dialogImage.evaluate((image) => image.decode())
    const currentSnapshot = capturedDialog.locator('[data-gallery-current-snapshot]')
    const fitMetrics = await currentSnapshot.evaluate((element) => {
      const image = element.querySelector('img')
      return {
        clientHeight: element.clientHeight,
        clientWidth: element.clientWidth,
        imageWidth: image?.getBoundingClientRect().width,
        mode: element.getAttribute('data-image-mode'),
        naturalHeight: image?.naturalHeight,
        naturalWidth: image?.naturalWidth,
        scrollHeight: element.scrollHeight,
        scrollWidth: element.scrollWidth,
      }
    })
    assert.equal(fitMetrics.mode, 'fit')
    assert.equal(fitMetrics.naturalWidth, 1440)
    assert.ok(
      fitMetrics.naturalHeight >= 2400,
      'The viewer fixture should retain its full-page capture height',
    )
    assert.ok(fitMetrics.imageWidth <= fitMetrics.clientWidth)
    assert.ok(fitMetrics.clientWidth - fitMetrics.imageWidth <= 24)
    assert.ok(
      fitMetrics.scrollHeight > fitMetrics.clientHeight,
      'Tall screenshots should scroll vertically at fit width',
    )
    assert.ok(fitMetrics.scrollWidth <= fitMetrics.clientWidth + 1)
    const fitImageBox = await dialogImage.boundingBox()
    const desktopSnapshotBox = await currentSnapshot.boundingBox()
    assert.ok(fitImageBox)
    assert.ok(desktopSnapshotBox)
    assert.ok(
      desktopSnapshotBox.y + desktopSnapshotBox.height <=
        desktopDialogBox.y + desktopDialogBox.height - 16,
    )

    const desktopDialogScroll = capturedDialog.locator('.dialog-scroll')
    const outerScrollTopBeforePageDown = await desktopDialogScroll.evaluate(
      (element) => element.scrollTop,
    )
    await currentSnapshot.press('PageDown')
    await page.waitForFunction(
      (snapshot) => snapshot.scrollTop > 0,
      await currentSnapshot.elementHandle(),
    )
    await waitForScrollToSettle(currentSnapshot)
    assert.equal(
      await desktopDialogScroll.evaluate((element) => element.scrollTop),
      outerScrollTopBeforePageDown,
      'PageDown in the screenshot viewport should not move the dialog',
    )
    const fitCenterY = await currentSnapshot.evaluate(
      (element) => (element.scrollTop + element.clientHeight / 2) / element.scrollHeight,
    )

    const scaleButton = capturedDialog.locator('[data-gallery-image-scale]')
    assert.equal(await scaleButton.getAttribute('aria-pressed'), null)
    const currentSnapshotId = await currentSnapshot.getAttribute('id')
    assert.ok(currentSnapshotId)
    assert.equal(
      await scaleButton.getAttribute('aria-controls'),
      currentSnapshotId,
    )
    assert.match(await scaleButton.innerText(), /View at 100%/)
    await scaleButton.press('Enter')
    await page.waitForFunction(
      (snapshot) => {
        const image = snapshot.querySelector('img')
        return (
          snapshot.getAttribute('data-image-mode') === 'actual' &&
          image?.getBoundingClientRect().width === image?.naturalWidth
        )
      },
      await currentSnapshot.elementHandle(),
    )
    await page.waitForFunction(
      ({ centerY, id }) => {
        const snapshot = document.getElementById(id)
        if (!snapshot) return false
        const currentCenterY =
          (snapshot.scrollTop + snapshot.clientHeight / 2) / snapshot.scrollHeight
        return Math.abs(currentCenterY - centerY) < 0.02
      },
      { centerY: fitCenterY, id: currentSnapshotId },
    )
    const actualMetrics = await currentSnapshot.evaluate((element) => {
      const image = element.querySelector('img')
      return {
        centerX: (element.scrollLeft + element.clientWidth / 2) / element.scrollWidth,
        centerY: (element.scrollTop + element.clientHeight / 2) / element.scrollHeight,
        clientWidth: element.clientWidth,
        imageWidth: image?.getBoundingClientRect().width,
        mode: element.getAttribute('data-image-mode'),
        naturalWidth: image?.naturalWidth,
        scrollWidth: element.scrollWidth,
      }
    })
    const actualImageBox = await dialogImage.boundingBox()
    assert.equal(actualMetrics.mode, 'actual')
    assert.ok(actualMetrics.scrollWidth > actualMetrics.clientWidth)
    assert.equal(actualMetrics.imageWidth, actualMetrics.naturalWidth)
    assert.ok(
      Math.abs(actualMetrics.centerX - 0.5) < 0.02,
      'Changing scale should preserve the horizontal center',
    )
    assert.ok(
      Math.abs(actualMetrics.centerY - fitCenterY) < 0.02,
      'Changing scale should preserve the viewed part of the screenshot',
    )
    assert.ok(actualImageBox && actualImageBox.width > fitImageBox.width)
    await currentSnapshot.evaluate((element) => {
      element.scrollLeft = 120
    })
    assert.ok(await currentSnapshot.evaluate((element) => element.scrollLeft > 0))
    const actualCenterBeforeRapidToggle = await currentSnapshot.evaluate((element) => ({
      x: (element.scrollLeft + element.clientWidth / 2) / element.scrollWidth,
      y: (element.scrollTop + element.clientHeight / 2) / element.scrollHeight,
    }))
    await scaleButton.evaluate((button) => {
      button.click()
      button.click()
    })
    await page.evaluate(
      () =>
        new Promise((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(resolve))
        }),
    )
    const actualCenterAfterRapidToggle = await currentSnapshot.evaluate((element) => ({
      mode: element.getAttribute('data-image-mode'),
      x: (element.scrollLeft + element.clientWidth / 2) / element.scrollWidth,
      y: (element.scrollTop + element.clientHeight / 2) / element.scrollHeight,
    }))
    assert.equal(actualCenterAfterRapidToggle.mode, 'actual')
    assert.ok(
      Math.abs(actualCenterAfterRapidToggle.x - actualCenterBeforeRapidToggle.x) < 0.02,
    )
    assert.ok(
      Math.abs(actualCenterAfterRapidToggle.y - actualCenterBeforeRapidToggle.y) < 0.02,
    )
    assert.equal(await scaleButton.getAttribute('aria-pressed'), null)
    assert.match(await scaleButton.innerText(), /Fit to width/)
    await scaleButton.press('Space')
    await page.waitForFunction(
      ({ centerY, id }) => {
        const snapshot = document.getElementById(id)
        if (!snapshot || snapshot.getAttribute('data-image-mode') !== 'fit') return false
        const currentCenterY =
          (snapshot.scrollTop + snapshot.clientHeight / 2) / snapshot.scrollHeight
        return Math.abs(currentCenterY - centerY) < 0.02
      },
      { centerY: actualCenterAfterRapidToggle.y, id: currentSnapshotId },
    )
    await page.keyboard.press('Escape')
    await capturedDialog.waitFor({ state: 'hidden' })
    assert.equal(
      await capturedOpener.evaluate((element) => document.activeElement === element),
      true,
    )
    await search.fill('No exported scenario matches this')
    assert.equal(await page.locator('[data-gallery-card]:visible').count(), 0)

    await page.setViewportSize({ width: 768, height: 600 })
    await search.fill('Alpha export')
    const tabletCapturedOpener = page.locator(
      '[data-gallery-card]:visible .card-preview[data-gallery-open]',
    )
    await tabletCapturedOpener.click()
    const tabletDialog = page.locator('[data-gallery-dialog]:visible')
    await tabletDialog.waitFor()
    await tabletDialog.evaluate((dialog) =>
      Promise.all(dialog.getAnimations().map((animation) => animation.finished)),
    )
    const tabletLayout = await tabletDialog.evaluate((dialog) => {
      const box = dialog.getBoundingClientRect()
      const main = dialog.querySelector('.dialog-main')?.getBoundingClientRect()
      const sidebar = dialog.querySelector('.dialog-sidebar')?.getBoundingClientRect()
      const scroll = dialog.querySelector('.dialog-scroll')
      return {
        bottom: box.bottom,
        height: box.height,
        left: box.left,
        mainTop: main?.top,
        outerClientHeight: scroll?.clientHeight,
        outerScrollHeight: scroll?.scrollHeight,
        right: box.right,
        sidebarTop: sidebar?.top,
        top: box.top,
        width: box.width,
      }
    })
    assert.ok(tabletLayout.left >= 0 && tabletLayout.top >= 0)
    assert.ok(tabletLayout.right <= 768 && tabletLayout.bottom <= 600)
    assert.ok(tabletLayout.width >= 730 && tabletLayout.height >= 560)
    assert.ok(tabletLayout.sidebarTop > tabletLayout.mainTop)
    assert.ok(tabletLayout.outerScrollHeight > tabletLayout.outerClientHeight)
    await tabletDialog.locator('[data-gallery-close]').click()
    await tabletDialog.waitFor({ state: 'hidden' })

    await page.setViewportSize({ width: 375, height: 812 })
    await search.fill('Alpha export')
    const mobileCapturedOpener = page.locator(
      '[data-gallery-card]:visible .card-preview[data-gallery-open]',
    )
    await mobileCapturedOpener.click()
    const mobileDialog = page.locator('[data-gallery-dialog]:visible')
    await mobileDialog.waitFor()
    await mobileDialog.evaluate((dialog) =>
      Promise.all(dialog.getAnimations().map((animation) => animation.finished)),
    )
    const [mobileMain, mobileSidebar] = await Promise.all([
      mobileDialog.locator('.dialog-main').boundingBox(),
      mobileDialog.locator('.dialog-sidebar').boundingBox(),
    ])
    assert.ok(mobileMain && mobileSidebar)
    assert.ok(mobileMain.y < mobileSidebar.y, 'Snapshot should precede metadata on mobile')
    const mobileSnapshotMetrics = await mobileDialog
      .locator('[data-gallery-current-snapshot]')
      .evaluate((element) => ({
        clientHeight: element.clientHeight,
        clientWidth: element.clientWidth,
        overscrollBehaviorY: getComputedStyle(element).overscrollBehaviorY,
        scrollHeight: element.scrollHeight,
        scrollWidth: element.scrollWidth,
        touchAction: getComputedStyle(element).touchAction,
      }))
    assert.ok(mobileSnapshotMetrics.scrollHeight > mobileSnapshotMetrics.clientHeight)
    assert.ok(mobileSnapshotMetrics.scrollWidth <= mobileSnapshotMetrics.clientWidth + 1)
    assert.equal(mobileSnapshotMetrics.overscrollBehaviorY, 'auto')
    assert.equal(mobileSnapshotMetrics.touchAction, 'auto')
    const mobileSnapshot = mobileDialog.locator('[data-gallery-current-snapshot]')
    const mobileDialogScroll = mobileDialog.locator('.dialog-scroll')
    await mobileSnapshot.evaluate((element) => {
      element.scrollTop = element.scrollHeight
    })
    const mobileSnapshotTopAtEnd = await mobileSnapshot.evaluate(
      (element) => element.scrollTop,
    )
    const pageScrollBeforeWheel = await page.evaluate(() => window.scrollY)
    await mobileDialogScroll.evaluate((element) => {
      element.scrollTop = 0
    })
    const mobileSnapshotBox = await mobileSnapshot.boundingBox()
    assert.ok(mobileSnapshotBox)
    await page.mouse.move(
      mobileSnapshotBox.x + mobileSnapshotBox.width / 2,
      mobileSnapshotBox.y + mobileSnapshotBox.height / 2,
    )
    await page.mouse.wheel(0, 500)
    await page.waitForFunction(
      (dialogScroll) => dialogScroll.scrollTop > 0,
      await mobileDialogScroll.elementHandle(),
    )
    assert.equal(
      await mobileSnapshot.evaluate((element) => element.scrollTop),
      mobileSnapshotTopAtEnd,
      'Wheel scrolling at the image end should move only the dialog',
    )
    assert.equal(await page.evaluate(() => window.scrollY), pageScrollBeforeWheel)
    const mobileScaleButton = mobileDialog.locator('[data-gallery-image-scale]')
    await mobileScaleButton.click()
    const mobileActualMetrics = await mobileSnapshot.evaluate((element) => ({
      clientWidth: element.clientWidth,
      mode: element.getAttribute('data-image-mode'),
      scrollWidth: element.scrollWidth,
    }))
    assert.equal(mobileActualMetrics.mode, 'actual')
    assert.ok(mobileActualMetrics.scrollWidth > mobileActualMetrics.clientWidth)
    const mobileOuterWidth = await mobileDialogScroll.evaluate((element) => ({
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
    }))
    assert.ok(mobileOuterWidth.scrollWidth <= mobileOuterWidth.clientWidth)
    const mobileDialogBox = await mobileDialog.boundingBox()
    assert.ok(mobileDialogBox)
    assert.ok(mobileDialogBox.x >= 0)
    assert.ok(mobileDialogBox.y >= 0)
    assert.ok(mobileDialogBox.x + mobileDialogBox.width <= 375)
    assert.ok(mobileDialogBox.y + mobileDialogBox.height <= 812)
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      true,
    )
    await mobileDialog.locator('[data-gallery-close]').click()
    await mobileDialog.waitFor({ state: 'hidden' })
    assert.equal(
      await mobileCapturedOpener.evaluate((element) => document.activeElement === element),
      true,
    )
    const fallbackDialog = page
      .locator('[data-gallery-dialog]')
      .filter({ hasText: 'Alpha export' })
    await page.evaluate(() => {
      window.scrollTo(0, document.documentElement.scrollHeight)
    })
    const fallbackPageScroll = await page.evaluate(() => window.scrollY)
    assert.ok(fallbackPageScroll > 0)
    await fallbackDialog.evaluate((dialog) => {
      dialog.showModal = undefined
      dialog.close = undefined
    })
    await mobileCapturedOpener.evaluate((button) => button.click())
    await mobileDialog.waitFor()
    await mobileDialog.evaluate((dialog) =>
      Promise.all(dialog.getAnimations().map((animation) => animation.finished)),
    )
    assert.equal(await page.evaluate(() => window.scrollY), fallbackPageScroll)
    const fallbackDialogBox = await mobileDialog.boundingBox()
    assert.ok(fallbackDialogBox)
    assert.ok(fallbackDialogBox.x >= 0 && fallbackDialogBox.y >= 0)
    assert.ok(fallbackDialogBox.x + fallbackDialogBox.width <= 375)
    assert.ok(fallbackDialogBox.y + fallbackDialogBox.height <= 812)
    const fallbackFocus = await mobileDialog.evaluate((dialog) => ({
      activeLabel: document.activeElement?.getAttribute('aria-label'),
      activeTag: document.activeElement?.tagName,
      closeIsActive:
        document.activeElement === dialog.querySelector('[data-gallery-close]'),
      routeId: document.activeElement?.closest('dialog')?.getAttribute('data-route-id'),
    }))
    assert.equal(
      fallbackFocus.closeIsActive,
      true,
      `Fallback dialog should focus its close button: ${JSON.stringify(fallbackFocus)}`,
    )
    assert.equal(
      await page.locator('[data-static-gallery]').getAttribute(
        'data-gallery-fallback-active',
      ),
      '',
    )
    await page.keyboard.press('Shift+Tab')
    assert.equal(
      await mobileDialog.evaluate((dialog) => dialog.contains(document.activeElement)),
      true,
    )
    await page.keyboard.press('Tab')
    assert.equal(
      await mobileDialog
        .locator('[data-gallery-close]')
        .evaluate((element) => document.activeElement === element),
      true,
    )
    await page.evaluate(() => {
      document.body.tabIndex = -1
      document.body.focus()
    })
    await page.keyboard.press('Escape')
    await mobileDialog.waitFor({ state: 'hidden' })
    assert.equal(
      await mobileCapturedOpener.evaluate((element) => document.activeElement === element),
      true,
    )
    assert.equal(
      await page.locator('[data-static-gallery]').getAttribute(
        'data-gallery-fallback-active',
      ),
      null,
    )

    assert.deepEqual(browserErrors, [])
    assert.deepEqual(externalRequests, [])
  } finally {
    await browser?.close()
    if (viewerFixture) {
      await fs.rm(viewerFixture.cwd, { force: true, recursive: true })
    }
    await fs.rm(fixture.cwd, { force: true, recursive: true })
  }
})

test('gallery export CLI documents its flags and returns the JSON result', async () => {
  const fixture = await createFixtureProject()
  const partialFixture = await createFixtureProject({ includeFailure: true })
  const output = 'exports/cli-gallery.html'
  try {
    const help = await run(process.execPath, [cliPath, 'gallery', 'export', '--help'], {
      cwd: repoRoot,
      maxBuffer: 1024 * 1024,
    })
    assert.match(help.stdout, /component-shot gallery export/)
    assert.match(help.stdout, /--output/)
    assert.match(help.stdout, /--include-history/)
    assert.match(help.stdout, /--max-history-bytes/)
    assert.match(help.stdout, /--overwrite/)

    await assert.rejects(
      run(process.execPath, [cliPath, 'gallery', 'export', '--overwrite=false'], {
        cwd: repoRoot,
        maxBuffer: 1024 * 1024,
      }),
      (error) => {
        assert.match(error.stderr, /--overwrite does not accept a value/)
        return true
      },
    )
    await assert.rejects(
      run(
        process.execPath,
        [cliPath, 'gallery', 'export', '--max-history-bytes', 'not-a-number'],
        {
          cwd: repoRoot,
          maxBuffer: 1024 * 1024,
        },
      ),
      (error) => {
        assert.match(error.stderr, /--max-history-bytes must be a non-negative integer/)
        return true
      },
    )

    const exported = await run(
      process.execPath,
      [
        cliPath,
        'gallery',
        'export',
        '--cwd',
        fixture.cwd,
        '--scenario-dir',
        fixture.scenarioDir,
        '--screenshots-dir',
        fixture.screenshotsDir,
        '--output',
        output,
        '--include-history',
        '--json',
      ],
      { cwd: repoRoot, maxBuffer: 16 * 1024 * 1024, timeout: 120_000 },
    )
    const result = JSON.parse(exported.stdout)
    assert.equal(result.outputPath, path.join(fixture.cwd, output))
    assert.equal(result.scenarioCount, 1)
    assert.equal(result.capturedCount, 1)
    assert.equal(result.failedCount, 0)
    assert.ok(result.historyBytes > 0)
    assert.equal(result.historyCount, 1)
    assert.equal(result.historyWarningCount, 0)
    assert.equal(result.failures.length, 0)
    assert.deepEqual(result.warnings, [])
    assert.ok(result.bytes > 0)

    const html = await fs.readFile(result.outputPath, 'utf8')
    assert.equal(result.bytes, Buffer.byteLength(html))
    assert.match(html, /data-static-gallery/)
    assert.equal(countDataImages(html), 2)

    let historyWarningError
    try {
      await run(
        process.execPath,
        [
          cliPath,
          'gallery',
          'export',
          '--cwd',
          fixture.cwd,
          '--scenario-dir',
          fixture.scenarioDir,
          '--screenshots-dir',
          fixture.screenshotsDir,
          '--output',
          'exports/cli-history-warning-gallery.html',
          '--include-history',
          '--max-history-bytes',
          '0',
          '--json',
        ],
        { cwd: repoRoot, maxBuffer: 16 * 1024 * 1024, timeout: 120_000 },
      )
    } catch (error) {
      historyWarningError = error
    }
    assert.ok(historyWarningError, 'Expected a history warning to set an unsuccessful exit status')
    const historyWarningResult = JSON.parse(historyWarningError.stdout)
    assert.equal(historyWarningResult.capturedCount, 1)
    assert.equal(historyWarningResult.historyCount, 0)
    assert.equal(historyWarningResult.historyWarningCount, 1)
    assert.equal(historyWarningResult.warnings[0].kind, 'history')
    await fs.access(historyWarningResult.outputPath)

    let partialError
    try {
      await run(
        process.execPath,
        [
          cliPath,
          'gallery',
          'export',
          '--cwd',
          partialFixture.cwd,
          '--scenario-dir',
          partialFixture.scenarioDir,
          '--output',
          'exports/partial-gallery.html',
          '--json',
        ],
        { cwd: repoRoot, maxBuffer: 16 * 1024 * 1024, timeout: 120_000 },
      )
    } catch (error) {
      partialError = error
    }
    assert.ok(partialError, 'Expected the partial gallery export command to exit unsuccessfully')
    const partialResult = JSON.parse(partialError.stdout)
    assert.equal(partialResult.scenarioCount, 2)
    assert.equal(partialResult.capturedCount, 1)
    assert.equal(partialResult.failedCount, 1)
    await fs.access(partialResult.outputPath)
  } finally {
    await Promise.all([
      fs.rm(fixture.cwd, { force: true, recursive: true }),
      fs.rm(partialFixture.cwd, { force: true, recursive: true }),
    ])
  }
})
