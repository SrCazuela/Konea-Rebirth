import { createServer } from 'node:http'
import { createApp } from './app.js'
import { env } from './config/env.js'
import { closeDatabaseConnection } from './db/client.js'

const app = createApp()
const server = createServer(app)

server.listen(env.API_PORT, () => {
  console.log(`Konea API listening on http://localhost:${env.API_PORT}`)
})

async function shutdown(signal: NodeJS.Signals) {
  console.log(`${signal} received, shutting down gracefully`)

  server.close(async () => {
    await closeDatabaseConnection()
    process.exit(0)
  })

  setTimeout(() => process.exit(1), 10_000).unref()
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
