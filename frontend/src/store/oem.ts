import { defineStore } from 'pinia'
import { ref } from 'vue'
import { getOemConfig, type OemConfig } from '@/api/oem'
import { logger } from '@/utils'

/** 前端默认 OEM 配置 (后端字段 null 时降级用) */
const DEFAULT_OEM: OemConfig = {
  logoUrl: '/logo.svg',
  companyName: '视觉统一手脚架',
  title: '视觉统一手脚架',
  subtitle: '',
  brand: 'ldx2',
  theme: 'light',
  locale: 'zh-CN',
  footerText: '',
}

/** localStorage 缓存 key 前缀: aigc:oem:<host> (按域名隔离) */
const CACHE_PREFIX = 'aigc:oem'
/** 缓存 TTL: 24 小时, 过期从网络拉 */
const CACHE_TTL_MS = 24 * 60 * 60 * 1000

interface CachedOem {
  config: OemConfig
  host: string | null
  cachedAt: number
}

function cacheKey(host: string | null): string {
  return `${CACHE_PREFIX}:${host ?? 'default'}`
}

function loadFromCache(host: string | null): OemConfig | null {
  try {
    const raw = localStorage.getItem(cacheKey(host))
    if (!raw) return null
    const cached = JSON.parse(raw) as CachedOem
    if (Date.now() - cached.cachedAt > CACHE_TTL_MS) return null
    return cached.config
  } catch {
    return null
  }
}

function saveToCache(host: string | null, config: OemConfig): void {
  try {
    const payload: CachedOem = { config, host, cachedAt: Date.now() }
    localStorage.setItem(cacheKey(host), JSON.stringify(payload))
  } catch {
    // localStorage 不可用 (隐私模式 / 满), 静默忽略
  }
}

/** 同步读缓存, 在 main.ts bootstrap 时立即 apply, 避免 first paint 闪默认 */
export function loadOemConfigSync(host: string | null): OemConfig | null {
  return loadFromCache(host)
}

export const useOemStore = defineStore('oem', () => {
  const config = ref<OemConfig>({ ...DEFAULT_OEM })
  const loaded = ref(false)

  /**
   * 启动期加载 OEM 配置
   *
   * 失败时降级到 DEFAULT_OEM, 不抛错 (保证应用可启动)
   *
   * @param host 当前域名 (用于多租户匹配), 传 null 走后端 default 配置
   */
  async function load(host?: string | null) {
    try {
      const data = await getOemConfig(host ?? undefined)
      const merged = { ...DEFAULT_OEM, ...data }
      config.value = merged
      saveToCache(host ?? null, merged)
    } catch (e) {
      // 离线时降级到缓存
      const cached = loadFromCache(host ?? null)
      if (cached) {
        config.value = { ...DEFAULT_OEM, ...cached }
        logger.warn('[OEM] API 失败, 使用缓存配置')
      } else {
        logger.warn('[OEM] 加载失败, 使用默认配置:', e)
        config.value = { ...DEFAULT_OEM }
      }
    } finally {
      loaded.value = true
    }
  }

  /**
   * 把 OEM 配置应用到 DOM:
   * - document.title
   * - favicon
   * - CSS 变量 (--el-color-primary 等)
   * - data-brand 属性 (供 SCSS 选择器使用)
   */
  /**
   * 应用 OEM 配置到 DOM.
   *
   * 注: data-brand / data-theme 属性由 FcThemeProvider 管理 (基于 v-model:brand/theme + localStorage).
   * OEM 只设置 title / favicon / --el-color-* 等. OEM config.brand/theme 通过
   * App.vue 传给 FcThemeProvider 的 initialBrand/initialTheme prop 作为兜底默认.
   */
  function apply() {
    const c = config.value
    const root = document.documentElement

    if (c.title) document.title = c.title

    if (c.faviconUrl) {
      let link = document.querySelector('link[rel~="icon"]') as HTMLLinkElement | null
      if (!link) {
        link = document.createElement('link')
        link.rel = 'icon'
        document.head.appendChild(link)
      }
      link.href = c.faviconUrl
    }

    if (c.primaryColor) root.style.setProperty('--el-color-primary', c.primaryColor)
    if (c.successColor) root.style.setProperty('--el-color-success', c.successColor)
    if (c.warningColor) root.style.setProperty('--el-color-warning', c.warningColor)
    if (c.dangerColor) root.style.setProperty('--el-color-danger', c.dangerColor)
  }

  return { config, loaded, load, apply }
})
