import { defineConfig } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const configDir = path.dirname(fileURLToPath(import.meta.url))

/**
 * 网关数据面验证专用配置（独立于管理面回归配置）。
 * - testDir: ./e2e-gateway
 * - 纯 request 上下文，不需要浏览器，也无 webServer（9300/9301 由环境预先启动）
 * - 单 worker 串行；每个用例自建自清路由，互不依赖
 */
export default defineConfig({
  testDir: './e2e-gateway',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 180_000,
  expect: { timeout: 45_000 },
  reporter: [
    ['list'],
    [
      'json',
      {
        outputFile: path.resolve(
          configDir,
          '../test-report/2026-11-02-01/gateway-data-plane-results.json',
        ),
      },
    ],
  ],
  use: {
    trace: 'off',
    screenshot: 'off',
  },
})
