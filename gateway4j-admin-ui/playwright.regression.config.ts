import { defineConfig } from '@playwright/test'
import * as path from 'path'
import { REPORT_ROOT } from './e2e-regression/helpers'

/**
 * 全量回归测试专用配置（不改动原有 e2e 配置）。
 * - testDir: ./e2e-regression
 * - 截图由 helper 统一写入 REPORT_ROOT/screenshots/<业务线>/（目录按跑批日期自动推导，
 *   规则与 fail-fast 护栏见 e2e-regression/helpers.ts；GW_REPORT_DIR / GW_REPORT_SLUG 可显式指定）
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
    ['json', { outputFile: path.join(REPORT_ROOT, 'results.json') }],
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
