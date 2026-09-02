import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    env: {
      NODE_ENV: 'test',
      DUCO_AI_PROVIDER: 'local',
    },
  },
})
