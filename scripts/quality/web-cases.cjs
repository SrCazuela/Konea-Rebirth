const fs = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')
const { spawn } = require('node:child_process')
const { randomUUID } = require('node:crypto')

module.exports = async function run({ root, output, origin }) {
  const toolsFolder = path.resolve(
    process.env.KONEA_BROWSER_TOOLS || path.join(root, '.local/browser-tools'),
  )
  const { chromium } = require(
    path.join(toolsFolder, 'node_modules/playwright-core'),
  )
  const edgeCandidates = [
    process.env.KONEA_EDGE_PATH,
    ...[
      process.env['PROGRAMFILES(X86)'],
      process.env.PROGRAMFILES,
      process.env.LOCALAPPDATA,
    ]
      .filter(Boolean)
      .map((folder) =>
        path.join(folder, 'Microsoft/Edge/Application/msedge.exe'),
      ),
  ].filter(Boolean)
  const edge = edgeCandidates.find((file) => fs.existsSync(file))
  assert.ok(
    edge,
    'Microsoft Edge not found. Set KONEA_EDGE_PATH to its executable.',
  )
  assert.equal(
    new URL(origin).hostname,
    '127.0.0.1',
    'QA must use loopback only',
  )
  assert.equal(
    new URL(origin).protocol,
    'http:',
    'QA must use its private local HTTP server',
  )
  const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
  const folder = path.join(output, 'Pruebas_Funcionales')
  fs.mkdirSync(folder, { recursive: true })
  const report = {
    startedAt: new Date().toISOString(),
    origin,
    browser: 'Microsoft Edge headless / real local API / disposable PostgreSQL',
    cases: [],
    axes: [],
    pageErrors: [],
    blockedExternalRequests: [],
    limitations: [
      'Mobile resolutions are emulated, not a physical Android device.',
      'Accessibility tree and axe do not replace a human NVDA or TalkBack reading session.',
    ],
  }
  const save = () =>
    fs.writeFileSync(
      path.join(folder, 'resultados.json'),
      JSON.stringify(report, null, 2),
    )
  const profile = path.join(
    output,
    '_qa',
    `edge-${Date.now()}-${randomUUID().slice(0, 8)}`,
  )
  fs.mkdirSync(profile, { recursive: true })
  const extension = path.join(profile, 'zoom-extension')
  fs.mkdirSync(extension, { recursive: true })
  fs.writeFileSync(
    path.join(extension, 'manifest.json'),
    JSON.stringify({
      manifest_version: 3,
      name: 'Konea isolated validation zoom',
      version: '1.0',
      host_permissions: ['http://127.0.0.1/*'],
      background: { service_worker: 'worker.js' },
    }),
  )
  fs.writeFileSync(
    path.join(extension, 'worker.js'),
    'chrome.runtime.onInstalled.addListener(() => {});',
  )
  let browser, child
  let currentCase
  const errors = []
  async function step(id, name, body) {
    const item = {
      id,
      name,
      status: 'NE',
      started: new Date().toISOString(),
      screenshots: [],
    }
    report.cases.push(item)
    currentCase = item
    save()
    console.log(`START ${id} ${name}`)
    try {
      const detail = await body(item)
      item.status = 'AP'
      if (detail) item.detail = detail
      console.log(`PASS ${id}`)
    } catch (error) {
      item.status = 'FA'
      item.error = error.message
      throw error
    } finally {
      item.finished = new Date().toISOString()
      save()
    }
  }
  async function shot(page, name) {
    const file = `${name}.png`
    await page.screenshot({ path: path.join(folder, file), fullPage: true })
    currentCase?.screenshots.push(file)
    if ((page.viewportSize()?.width ?? 0) < 900) {
      const viewportFile = `${name}-viewport.png`
      await page.screenshot({
        path: path.join(folder, viewportFile),
        fullPage: false,
      })
      currentCase?.screenshots.push(viewportFile)
    }
  }
  function observe(page) {
    page.setDefaultTimeout(20000)
    page.on('pageerror', (error) => {
      errors.push(error.message)
      report.pageErrors.push({ case: currentCase?.id, message: error.message })
    })
  }
  async function axe(page, name) {
    await page.addScriptTag({
      path: path.join(toolsFolder, 'node_modules/axe-core/axe.min.js'),
    })
    const result = await page.evaluate(async () => {
      const r = await window.axe.run(document, {
        runOnly: {
          type: 'tag',
          values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'],
        },
      })
      return {
        testEngine: r.testEngine,
        violations: r.violations.map((v) => ({
          id: v.id,
          impact: v.impact,
          help: v.help,
          helpUrl: v.helpUrl,
          nodes: v.nodes.map((n) => ({
            target: n.target,
            html: n.html,
            failureSummary: n.failureSummary,
          })),
        })),
        passes: r.passes.length,
        incomplete: r.incomplete.map((v) => ({
          id: v.id,
          nodes: v.nodes.length,
        })),
      }
    })
    report.axes.push({ name, ...result })
    save()
  }
  const suffix = randomUUID().replaceAll('-', '').slice(0, 10)
  const original = {
    email: `validation-${suffix}@konea.test`,
    username: `validation_${suffix}`,
    displayName: 'Cuenta de validación',
    password: 'TemporalCalidad2026!',
  }
  const edited = {
    email: `updated-${suffix}@konea.test`,
    username: `updated_${suffix}`,
    displayName: 'Cuenta Actualizada',
  }
  const newPassword = 'NuevaTemporalCalidad2026!'
  try {
    child = spawn(
      edge,
      [
        '--headless=new',
        `--disable-extensions-except=${extension}`,
        `--load-extension=${extension}`,
        '--disable-background-networking',
        '--no-first-run',
        '--no-default-browser-check',
        '--remote-debugging-address=127.0.0.1',
        '--remote-debugging-port=0',
        `--user-data-dir=${profile}`,
        'about:blank',
      ],
      { windowsHide: true, stdio: 'ignore' },
    )
    const portFile = path.join(profile, 'DevToolsActivePort')
    for (let i = 0; i < 100 && !fs.existsSync(portFile); i++) await pause(200)
    assert.ok(fs.existsSync(portFile), 'Isolated Edge CDP not ready')
    const port = Number(fs.readFileSync(portFile, 'utf8').split(/\r?\n/)[0])
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`)
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      reducedMotion: 'reduce',
      serviceWorkers: 'block',
    })
    await context.route('**/*', (route) => {
      const url = new URL(route.request().url())
      if (['http:', 'https:'].includes(url.protocol) && url.origin !== origin) {
        report.blockedExternalRequests.push({
          host: url.host,
          path: url.pathname,
        })
        return route.abort('blockedbyclient')
      }
      return route.continue()
    })
    const page = await context.newPage()
    observe(page)
    const loginButton = () =>
      page
        .getByRole('button', { name: /Iniciar sesión|Ingresar|Entrar/i })
        .filter({ visible: true })
        .first()
    const accountForm = () =>
      page
        .locator('form')
        .filter({ has: page.getByLabel('Correo electrónico', { exact: true }) })
    const passwordForm = () =>
      page
        .locator('form')
        .filter({ has: page.getByLabel('Nueva contraseña', { exact: true }) })
    const response = async (resource) =>
      context.request.get(`${origin}/api/v1${resource}`)
    async function openSettings() {
      await page.goto(`${origin}/#profile-settings`)
      await page.reload()
      await page
        .getByRole('heading', {
          name: 'Configuración de tu cuenta',
          exact: true,
        })
        .waitFor()
    }
    async function login(identifier, password) {
      await page.goto(origin)
      await loginButton().click()
      const dialog = page.getByRole('dialog')
      await dialog
        .getByLabel('Correo o usuario', { exact: true })
        .fill(identifier)
      await dialog.getByLabel('Contraseña', { exact: true }).fill(password)
      await dialog
        .getByRole('button', { name: 'Entrar a Konea', exact: true })
        .click()
      await page.locator('.portal-shell').waitFor()
    }
    await step(
      'T07',
      'Mobile welcome and authentication layout 320 360 390 412 CSS px',
      async () => {
        const widths = []
        for (const width of [320, 360, 390, 412]) {
          await page.setViewportSize({ width, height: 844 })
          await page.goto(origin)
          await loginButton().waitFor()
          await loginButton().click()
          await page.getByRole('dialog').waitFor()
          assert.ok(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth,
            ),
            `Authentication overflow at ${width}`,
          )
          await page
            .getByLabel('Correo o usuario', { exact: true })
            .fill(original.username)
          await shot(page, `T07-login-${width}`)
          await page
            .getByRole('dialog')
            .getByRole('button', { name: 'Cerrar', exact: true })
            .click()
          widths.push(width)
        }
        return { emulatedWidths: widths }
      },
    )
    await step(
      'T08',
      'Keyboard dialog focus loop Escape return and password visibility',
      async () => {
        await page.setViewportSize({ width: 1440, height: 1000 })
        await page.goto(origin)
        await loginButton().focus()
        await page.keyboard.press('Enter')
        const dialog = page.getByRole('dialog')
        await dialog.waitFor()
        await pause(150)
        assert.ok(
          await dialog.evaluate((el) => el.contains(document.activeElement)),
          'Dialog initial focus',
        )
        await dialog
          .getByLabel('Contraseña', { exact: true })
          .fill('FicticiaSoloVisibilidad!')
        await dialog
          .getByRole('button', { name: 'Mostrar contraseña', exact: true })
          .click()
        assert.equal(
          await dialog
            .getByLabel('Contraseña', { exact: true })
            .getAttribute('type'),
          'text',
        )
        await dialog
          .getByRole('button', { name: 'Ocultar contraseña', exact: true })
          .click()
        for (let i = 0; i < 24; i++) {
          await page.keyboard.press(i < 12 ? 'Tab' : 'Shift+Tab')
          assert.ok(
            await dialog.evaluate((el) => el.contains(document.activeElement)),
            'Focus escaped dialog',
          )
        }
        await axe(page, 'Login dialog desktop')
        await shot(page, 'T08-keyboard-dialog')
        await page.keyboard.press('Escape')
        await dialog.waitFor({ state: 'hidden' })
        assert.equal(
          await loginButton().evaluate((el) => el === document.activeElement),
          true,
        )
      },
    )
    await step(
      'T09',
      'Real local registration and cookie session',
      async () => {
        const registered = await context.request.post(
          `${origin}/api/v1/auth/register`,
          { data: original },
        )
        assert.equal(registered.status(), 201)
        assert.match(registered.headers()['set-cookie'], /HttpOnly/)
        assert.match(registered.headers()['set-cookie'], /SameSite=Lax/)
        await openSettings()
        assert.equal((await response('/auth/me')).status(), 200)
        await shot(page, 'T09-account-desktop')
        await axe(page, 'Account settings desktop')
      },
    )
    await step(
      'T10',
      'Wrong current password rejected and account edits persist',
      async () => {
        const form = accountForm()
        await form
          .getByLabel('Nombre visible', { exact: true })
          .fill(edited.displayName)
        await form
          .getByLabel('Nombre de usuario', { exact: true })
          .fill(edited.username)
        await form
          .getByLabel('Correo electrónico', { exact: true })
          .fill(edited.email)
        await form
          .getByLabel('Contraseña actual', { exact: true })
          .fill('incorrecta')
        await form
          .getByRole('button', { name: 'Guardar datos de cuenta', exact: true })
          .click()
        await form.getByRole('alert').waitFor()
        const before = (await (await response('/auth/me')).json()).user
        assert.equal(before.email, original.email)
        assert.equal(
          await form
            .getByLabel('Contraseña actual', { exact: true })
            .getAttribute('aria-invalid'),
          'true',
        )
        await shot(page, 'T10-password-error')
        await form
          .getByLabel('Contraseña actual', { exact: true })
          .fill(original.password)
        await form
          .getByRole('button', { name: 'Guardar datos de cuenta', exact: true })
          .click()
        await form.getByRole('status').waitFor()
        const user = (await (await response('/auth/me')).json()).user
        assert.equal(user.email, edited.email)
        assert.equal(user.username, edited.username)
        assert.equal(user.displayName, edited.displayName)
        assert.equal(
          await form
            .getByLabel('Contraseña actual', { exact: true })
            .inputValue(),
          '',
        )
        await page.reload()
        await page
          .getByRole('heading', {
            name: 'Configuración de tu cuenta',
            exact: true,
          })
          .waitFor()
        assert.equal(
          await accountForm()
            .getByLabel('Correo electrónico', { exact: true })
            .inputValue(),
          edited.email,
        )
        await shot(page, 'T10-account-persisted')
      },
    )
    await step(
      'T11',
      'Password confirmation change old password rejection and other session revocation',
      async () => {
        const other = await browser.newContext()
        try {
          assert.equal(
            (
              await other.request.post(`${origin}/api/v1/auth/login`, {
                data: {
                  identifier: edited.username,
                  password: original.password,
                },
              })
            ).status(),
            200,
          )
          const form = passwordForm()
          await form
            .getByLabel('Contraseña actual', { exact: true })
            .fill(original.password)
          await form
            .getByLabel('Nueva contraseña', { exact: true })
            .fill(newPassword)
          await form
            .getByLabel('Confirmar nueva contraseña', { exact: true })
            .fill('DiferenteCalidad2026!')
          await form
            .getByRole('button', { name: 'Actualizar contraseña', exact: true })
            .click()
          await form.getByRole('alert').waitFor()
          assert.equal(
            await form
              .getByLabel('Confirmar nueva contraseña', { exact: true })
              .getAttribute('aria-invalid'),
            'true',
          )
          await form
            .getByLabel('Confirmar nueva contraseña', { exact: true })
            .fill(newPassword)
          await form
            .getByRole('button', { name: 'Actualizar contraseña', exact: true })
            .click()
          await form.getByRole('status').waitFor()
          assert.equal(
            await form
              .getByLabel('Nueva contraseña', { exact: true })
              .inputValue(),
            '',
          )
          assert.equal((await response('/auth/me')).status(), 200)
          assert.equal(
            (await other.request.get(`${origin}/api/v1/auth/me`)).status(),
            401,
          )
          assert.equal(
            (
              await other.request.post(`${origin}/api/v1/auth/login`, {
                data: {
                  identifier: edited.username,
                  password: original.password,
                },
              })
            ).status(),
            401,
          )
          assert.equal(
            (
              await other.request.post(`${origin}/api/v1/auth/login`, {
                data: { identifier: edited.username, password: newPassword },
              })
            ).status(),
            200,
          )
          await shot(page, 'T11-password-changed')
        } finally {
          await other.close()
        }
      },
    )
    await step(
      'T12',
      'Mobile account controls and save at 320 360 390 412 CSS px',
      async () => {
        const sizes = []
        for (const width of [320, 360, 390, 412]) {
          await page.setViewportSize({ width, height: 844 })
          assert.ok(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth,
            ),
            `Settings overflow at ${width}`,
          )
          await accountForm()
            .getByRole('button', {
              name: 'Guardar datos de cuenta',
              exact: true,
            })
            .scrollIntoViewIfNeeded()
          assert.equal(
            await accountForm()
              .getByRole('button', {
                name: 'Guardar datos de cuenta',
                exact: true,
              })
              .isVisible(),
            true,
          )
          await accountForm()
            .getByLabel('Nombre visible', { exact: true })
            .fill(`Cuenta móvil ${width}`)
          await accountForm()
            .getByLabel('Contraseña actual', { exact: true })
            .fill(newPassword)
          await accountForm()
            .getByRole('button', {
              name: 'Guardar datos de cuenta',
              exact: true,
            })
            .click()
          await accountForm().getByRole('status').waitFor()
          assert.equal(
            (await (await response('/auth/me')).json()).user.displayName,
            `Cuenta móvil ${width}`,
          )
          await shot(page, `T12-account-${width}`)
          sizes.push(width)
        }
        await axe(page, 'Account settings mobile 412')
        return { emulatedWidths: sizes }
      },
    )
    await step(
      'T13',
      'Actual browser zoom 200 percent and account save with reflow',
      async () => {
        const defaultContext = browser.contexts()[0]
        await defaultContext.route('**/*', (route) => {
          const url = new URL(route.request().url())
          return ['http:', 'https:'].includes(url.protocol) &&
            url.origin !== origin
            ? route.abort('blockedbyclient')
            : route.continue()
        })
        await defaultContext.addCookies(await context.cookies())
        const zoomPage = await defaultContext.newPage()
        observe(zoomPage)
        await zoomPage.setViewportSize({ width: 1440, height: 1000 })
        await zoomPage.goto(`${origin}/#profile-settings`)
        await zoomPage
          .getByRole('heading', {
            name: 'Configuración de tu cuenta',
            exact: true,
          })
          .waitFor()
        const worker = defaultContext
          .serviceWorkers()
          .find((w) => w.url().endsWith('/worker.js'))
        assert.ok(worker, 'Owned isolated zoom extension')
        const before = await zoomPage.evaluate(() => ({
          cssWidth: innerWidth,
          devicePixelRatio,
          visualScale: visualViewport.scale,
        }))
        const zoom = await worker.evaluate(async (target) => {
          const tabs = await chrome.tabs.query({ url: `${target}/*` })
          if (tabs.length !== 1) throw Error('Expected one owned zoom tab')
          await chrome.tabs.setZoomSettings(tabs[0].id, {
            mode: 'automatic',
            scope: 'per-tab',
          })
          await chrome.tabs.setZoom(tabs[0].id, 2)
          return chrome.tabs.getZoom(tabs[0].id)
        }, origin)
        await pause(250)
        const after = await zoomPage.evaluate(() => ({
          cssWidth: innerWidth,
          devicePixelRatio,
          visualScale: visualViewport.scale,
        }))
        assert.equal(zoom, 2)
        assert.equal(after.cssWidth, before.cssWidth / 2)
        assert.ok(
          await zoomPage.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          'Actual zoom overflow',
        )
        const form = zoomPage.locator('form').filter({
          has: zoomPage.getByLabel('Correo electrónico', { exact: true }),
        })
        await form
          .getByLabel('Nombre visible', { exact: true })
          .fill('Cuenta a doscientos por ciento')
        await form
          .getByLabel('Contraseña actual', { exact: true })
          .fill(newPassword)
        await form
          .getByRole('button', { name: 'Guardar datos de cuenta', exact: true })
          .click()
        await form.getByRole('status').waitFor()
        const zoomCdp = await defaultContext.newCDPSession(zoomPage)
        const layout = await zoomCdp.send('Page.getLayoutMetrics')
        const zoomCapture = await zoomCdp.send('Page.captureScreenshot', {
          format: 'png',
          fromSurface: true,
          captureBeyondViewport: true,
          clip: {
            x: 0,
            y: 0,
            width: layout.contentSize.width,
            height: layout.contentSize.height,
            scale: 1,
          },
        })
        fs.writeFileSync(
          path.join(folder, 'T13-real-browser-zoom-200.png'),
          Buffer.from(zoomCapture.data, 'base64'),
        )
        currentCase.screenshots.push('T13-real-browser-zoom-200.png')
        const zoomViewport = await zoomCdp.send('Page.captureScreenshot', {
          format: 'png',
          fromSurface: true,
        })
        fs.writeFileSync(
          path.join(folder, 'T13-real-browser-zoom-200-viewport.png'),
          Buffer.from(zoomViewport.data, 'base64'),
        )
        currentCase.screenshots.push('T13-real-browser-zoom-200-viewport.png')
        await zoomCdp.detach()
        const cookies = await defaultContext.cookies(origin)
        await context.addCookies(cookies)
        await worker.evaluate(async (target) => {
          const tabs = await chrome.tabs.query({ url: `${target}/*` })
          await chrome.tabs.setZoom(tabs[0].id, 1)
        }, origin)
        await zoomPage.close()
        await page.reload()
        await page
          .getByRole('heading', {
            name: 'Configuración de tu cuenta',
            exact: true,
          })
          .waitFor()
        return {
          method: 'chrome.tabs.setZoom per-tab on owned isolated Edge profile',
          verifiedZoom: zoom,
          before,
          after,
          savedAt200Percent: true,
        }
      },
    )
    await step(
      'T14',
      'Keyboard navigation announces destination and reduced motion disables smooth scroll',
      async () => {
        await page.setViewportSize({ width: 1440, height: 1000 })
        await page.emulateMedia({ reducedMotion: 'reduce' })
        await page.evaluate(() => {
          window.__qaScrolls = []
          const original = window.scrollTo.bind(window)
          window.scrollTo = (...args) => {
            window.__qaScrolls.push(args[0])
            original(...args)
          }
        })
        const subjects = page
          .locator('.portal-nav')
          .getByRole('button', { name: 'Materias', exact: true })
        await subjects.focus()
        await page.keyboard.press('Tab')
        await page.keyboard.press('Shift+Tab')
        await page.keyboard.press('Enter')
        await page
          .locator('.academic-agenda')
          .waitFor()
          .catch(() =>
            page
              .getByRole('heading', { name: /materias|académic/i })
              .first()
              .waitFor(),
          )
        const detail = await page.evaluate(() => ({
          activeTag: document.activeElement.tagName,
          activeText: document.activeElement.textContent.trim(),
          scrolls: window.__qaScrolls,
        }))
        assert.ok(
          ['H1', 'MAIN'].includes(detail.activeTag),
          'Keyboard destination focus',
        )
        assert.ok(
          detail.scrolls.length > 0 &&
            detail.scrolls.every((s) => s.behavior === 'instant'),
          'Reduced motion must disable explicit smooth scrolling',
        )
        await shot(page, 'T14-keyboard-navigation')
        await axe(page, 'Subjects keyboard navigation')
        await openSettings()
        return detail
      },
    )
    await step(
      'T15',
      'Logout failure keeps session then successful logout revokes access',
      async () => {
        const session = page.locator('.account-settings__session')
        await page.route('**/api/v1/auth/logout', (route) =>
          route.fulfill({
            status: 503,
            contentType: 'application/json',
            body: JSON.stringify({ error: { code: 'TEST_OUTAGE' } }),
          }),
        )
        await session
          .getByRole('button', { name: 'Cerrar sesión', exact: true })
          .click()
        await session.getByRole('alert').waitFor()
        assert.equal((await response('/auth/me')).status(), 200)
        await shot(page, 'T15-logout-network-error')
        await page.unroute('**/api/v1/auth/logout')
        await session
          .getByRole('button', { name: 'Cerrar sesión', exact: true })
          .click()
        await page.locator('.landing-header').waitFor()
        assert.equal((await response('/auth/me')).status(), 401)
        await login(edited.username, newPassword)
        await openSettings()
        await page
          .locator('.account-settings__session')
          .getByRole('button', { name: 'Cerrar sesión', exact: true })
          .click()
        await page.locator('.landing-header').waitFor()
        await shot(page, 'T15-logout-complete')
      },
    )
    await step(
      'T16',
      'Accessible semantics automated checks on tested screens',
      async () => {
        await axe(page, 'Welcome desktop')
        const violations = report.axes.flatMap((a) =>
          a.violations.map((v) => ({
            screen: a.name,
            id: v.id,
            impact: v.impact,
            nodes: v.nodes.length,
          })),
        )
        report.accessibilityViolations = violations
        assert.deepEqual(errors, [], 'JavaScript errors')
        assert.deepEqual(
          violations,
          [],
          'Automated accessibility violations must be corrected',
        )
        return {
          axeScreenCount: report.axes.length,
          violations,
          humanScreenReaderTest:
            'NE; manual reading with NVDA or TalkBack still required',
        }
      },
    )
    report.passed =
      report.cases.every((c) => c.status === 'AP') &&
      report.pageErrors.length === 0
    await context.close()
  } catch (error) {
    report.passed = false
    report.error = error.message
    console.error(error.message)
  } finally {
    if (browser) await browser.close().catch(() => {})
    if (child && child.exitCode === null) child.kill()
    report.finishedAt = new Date().toISOString()
    save()
  }
  return report
}
