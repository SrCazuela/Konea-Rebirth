import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    execArgv: process.platform === 'win32' ? ['--no-maglev'] : [],
    restoreMocks: true,
  },
})
