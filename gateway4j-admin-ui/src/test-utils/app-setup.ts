import { vi } from 'vitest'
import { config } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { installMemoryStorage } from './memory-storage'

/**
 * gateway4j 自有用例的测试基座（vitest workspace 的 'app' project）。
 *
 * 只注册 i18n（组件内部 useI18n() 需要）+ jsdom polyfill。
 * **刻意不注册 ElementPlus**：gateway4j 既有用例有依赖「测试环境未注册 EP」的断言
 * （如 EnvironmentSwitcher 直接驱动 FcSelect → el-select 的 v-model 路径）。
 * 需要 EP 基座的 SDK 原生用例走 'sdk' project（见 vitest.workspace.ts）。
 */
const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  fallbackLocale: 'zh-CN',
  messages: {},
  missingWarn: false,
  fallbackWarn: false
})

config.global.plugins = [i18n]

// jsdom 缺失 matchMedia（useResponsive / FcThemeProvider 用到）
if (!window.matchMedia) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn()
  }))
}

// jsdom 缺失 ResizeObserver
if (!window.ResizeObserver) {
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
}

// jsdom 未暴露 localStorage（H7b 已知约束，见 memory-storage.ts）——P4d-3 设置页
// lang-switch 用例直接读写裸 localStorage，基座层面兜底安装（幂等、缺省才装）。
if (typeof (globalThis as { localStorage?: Storage }).localStorage === 'undefined') {
  installMemoryStorage()
}
