import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    // Child workers do not inherit the CLI's Node flags.
    execArgv: process.platform === 'win32' ? ['--no-maglev'] : [],
    maxWorkers: 4,
    env: {
      NODE_ENV: 'test',
      KUCO_AI_PROVIDER: 'local',
    },
  },
})
