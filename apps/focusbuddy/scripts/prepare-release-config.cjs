const { mkdirSync, writeFileSync } = require('node:fs')
const path = require('node:path')
const { DEFAULT_APP_URL, normalizeAppUrl } = require('../electron/app-url.cjs')

const appUrl = normalizeAppUrl(
  process.env.FOCUSBUDDY_APP_URL?.trim() || DEFAULT_APP_URL,
)
const outputDirectory = path.resolve(__dirname, '../build')
const output = path.join(outputDirectory, 'focusbuddy.config.json')

mkdirSync(outputDirectory, { recursive: true })
writeFileSync(output, `${JSON.stringify({ appUrl }, null, 2)}\n`, 'utf8')
console.log(`Configuración pública de FocusBuddy preparada para ${appUrl}`)
