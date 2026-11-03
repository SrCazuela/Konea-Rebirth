import { createServer } from 'node:http'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { config } from 'dotenv'
import { createDemoApp } from './demo/app.js'
import { readDemoConfiguration } from './demo/config.js'

const repositoryRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../..',
)
config({ path: resolve(repositoryRoot, '.env'), quiet: true })

// Validate isolation before importing the application (which initializes the DB).
const configuration = readDemoConfiguration(process.env, repositoryRoot)
const [{ createApp }, { closeDatabaseConnection }] = await Promise.all([
  import('./app.js'),
  import('./db/client.js'),
])
const app = createDemoApp({
  configuration,
  webDirectory: resolve(repositoryRoot, 'apps/web/dist'),
  apiApp: createApp(),
})
const server = createServer(app)

server.listen(configuration.apiPort, configuration.apiHost, () => {
  console.log(`Konea demo ready on loopback port ${configuration.apiPort}.`)
})

server.on('error', () => {
  console.error(
    'Konea demo could not start. Check the local demo port and build.',
  )
  void closeDatabaseConnection().finally(() => process.exit(1))
})

let stopping = false
function shutdown() {
  if (stopping) return
  stopping = true
  server.close(() => {
    void closeDatabaseConnection().finally(() => process.exit(0))
  })
  server.closeIdleConnections()
  setTimeout(() => process.exit(1), 10_000).unref()
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
