import { defineConfig } from '@playwright/test'

/**
 * 全量回归测试专用配置（不改动原有 e2e 配置）。
 * - testDir: ./e2e-regression
 * - 截图由 helper 统一写入 test-report/<日期>-<序号>/screenshots/<业务线>/
 */
export default defineConfig({
  testDir: './e2e-regression',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [
    ['list'],
    ['json', { outputFile: '../test-report/2026-11-02-01/results.json' }],
  ],
  use: {
    baseURL: 'http://localhost:9302',
    trace: 'off',
    screenshot: 'off',
    viewport: { width: 1600, height: 1000 },
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
  ],
  webServer: {
    command: 'npm run dev',
    port: 9302,
    reuseExistingServer: true,
    timeout: 120_000,
  },
})
