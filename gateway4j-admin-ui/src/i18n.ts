import { createI18n } from 'vue-i18n'
import zhCN from './locales/zh-CN'
import enUS from './locales/en-US'

/**
 * 语言持久化读取：模块加载期执行，必须容错——
 * ① 非浏览器环境（node / SSR / 早期测试）没有 localStorage；
 * ② SDK 组件 barrel 会在 import 期链式拉起本模块。
 */
function readStoredLocale(): string {
  try {
    return typeof localStorage !== 'undefined'
      ? (localStorage.getItem('gw4j_lang') ?? 'zh-CN')
      : 'zh-CN'
  } catch {
    return 'zh-CN'
  }
}

export const i18n = createI18n({
  legacy: false,
  locale: readStoredLocale(),
  fallbackLocale: 'en-US',
  messages: { 'zh-CN': zhCN, 'en-US': enUS }
})
