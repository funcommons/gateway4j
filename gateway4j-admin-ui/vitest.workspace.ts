import { defineWorkspace } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

/**
 * Vitest 双 project 工作区（2026-10-31 SDK 合入）。
 *
 * 为什么要分两个 project：
 *  - SDK 原生用例（*.sdk.test.ts + src/components/__tests__/**）依赖一套「重基座」：
 *    全局 ElementPlus + i18n + pinia + matchMedia/ResizeObserver/localStorage polyfill，
 *    否则 SDK 组件内部的 el-* 与 useI18n() 全部无法解析（整片红）。
 *  - gateway4j 自有用例有依赖「测试环境未注册 ElementPlus」的断言
 *    （如 EnvironmentSwitcher 直接驱动 FcSelect → el-select 的 v-model 路径），
 *    一旦全局注册 EP 就会改变它们的行为。
 *
 * 因此按文件范围隔离两套基座，而不是全局一刀切。
 */
const alias = {
  '@': resolve(__dirname, 'src')
}

export default defineWorkspace([
  {
    plugins: [vue()],
    resolve: { alias },
    test: {
      name: 'app',
      environment: 'jsdom',
      globals: true,
      include: ['src/**/*.test.ts'],
      setupFiles: ['src/test-utils/app-setup.ts'],
      exclude: [
        '**/*.sdk.test.ts',
        'src/components/__tests__/**',
        'e2e/**',
        'node_modules/**'
      ]
    }
  },
  {
    plugins: [vue()],
    resolve: { alias },
    test: {
      name: 'sdk',
      environment: 'jsdom',
      globals: true,
      include: ['src/**/*.sdk.test.ts', 'src/components/__tests__/**/*.test.ts'],
      setupFiles: ['src/components/__tests__/setup.ts']
    }
  }
])
