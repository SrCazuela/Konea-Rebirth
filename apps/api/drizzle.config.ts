import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { config } from 'dotenv'
import { defineConfig } from 'drizzle-kit'

const currentDirectory = dirname(fileURLToPath(import.meta.url))

config({ path: resolve(currentDirectory, '../../.env'), quiet: true })

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required to run database commands')
}

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
  strict: true,
  verbose: true,
})
