import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const environment = loadEnv(mode, repositoryRoot, '')
  const apiPort = environment.API_PORT || '3000'

  return {
    clearScreen: false,
    envDir: repositoryRoot,
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: `http://localhost:${apiPort}`,
          changeOrigin: true,
        },
      },
    },
  }
})
