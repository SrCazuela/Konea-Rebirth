const { mkdirSync, writeFileSync } = require('node:fs')
const path = require('node:path')
const {
  DEFAULT_API_BASE_URL,
  apiBaseUrlFromAppUrl,
  normalizeApiBaseUrl,
} = require('../electron/api-url.cjs')

const explicitApiUrl = process.env.FOCUSBUDDY_API_URL?.trim()
const legacyAppUrl = process.env.FOCUSBUDDY_APP_URL?.trim()
const apiBaseUrl = explicitApiUrl
  ? normalizeApiBaseUrl(explicitApiUrl)
  : legacyAppUrl
    ? apiBaseUrlFromAppUrl(legacyAppUrl)
    : DEFAULT_API_BASE_URL
const outputDirectory = path.resolve(__dirname, '../build')
const output = path.join(outputDirectory, 'focusbuddy.config.json')

mkdirSync(outputDirectory, { recursive: true })
writeFileSync(output, `${JSON.stringify({ apiBaseUrl }, null, 2)}\n`, 'utf8')
console.log(`Configuración pública de FocusBuddy preparada para ${apiBaseUrl}`)
