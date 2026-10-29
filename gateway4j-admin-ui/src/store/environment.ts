import { defineStore, createPinia, getActivePinia } from 'pinia'
import { listEnvironments } from '@/api/environment'
import { DEFAULT_ENV, ENV_STORAGE_KEY, isValidEnvName, sortEnvironmentsDefaultFirst } from '@/utils/environment'

/**
 * H7b 环境维度状态（Pinia + localStorage）。
 *
 * - current：顶栏切换器选中环境，持久化 localStorage key `gw4j_env`，缺省 default。
 * - available：GET /v1/environments 是否可达。404/失败 → false = 环境功能整体隐藏
 *   （切换器不渲染、路由列表不带 environment 参数、环境对比空态）。
 * - environments：default 恒在首（后端契约，前端兜底再排一次）。
 *
 * 组件内统一用 useEnvironments()（本文件底部）：无 active Pinia 的上下文
 * （部分单测 / 非组件模块）落到模块级兜底实例，避免 getActivePinia 抛错；
 * 生产环境只有 main.ts 创建的那一个 Pinia，永远走第一个分支。
 */

function readStoredEnv(): string {
  try {
    const raw = localStorage.getItem(ENV_STORAGE_KEY)
    if (raw && isValidEnvName(raw)) return raw
  } catch { /* 隐私模式等场景静默 */ }
  return DEFAULT_ENV
}

export const useEnvironmentStore = defineStore('environment', {
  state: () => ({
    environments: [] as string[],
    /** /v1/environments 探测成功（至少一个合法环境）才为 true；404 → false = 功能整体隐藏 */
    available: false,
    /** 已做过一次探测（无论成败）→ 不再重复请求 */
    loaded: false,
    loading: false,
    current: readStoredEnv()
  }),
  getters: {
    /** 下拉选项（default 恒在首） */
    options: (s) => s.environments.map(e => ({ value: e, label: e })),
    /** 是否有可切换的多环境（单环境时切换器无意义，不渲染） */
    switchable: (s) => s.available && s.environments.length > 1
  },
  actions: {
    /**
     * 探测环境列表（幂等：一次进程只探测一次）。
     * 404 / 失败 → available=false：环境功能整体隐藏（降级路径，不报错）。
     */
    async ensureLoaded() {
      if (this.loaded || this.loading) return
      this.loading = true
      try {
        const res = await listEnvironments()
        const list = sortEnvironmentsDefaultFirst(
          (res?.environments ?? []).filter(e => isValidEnvName(e))
        )
        this.environments = list
        this.available = list.length > 0
        // 存储的 current 不在列表里（后端环境被删 / 换了后端）→ 回 default
        if (this.available && !list.includes(this.current)) this.current = DEFAULT_ENV
      } catch {
        // 降级：仅用 ['default']，功能整体隐藏
        this.environments = []
        this.available = false
      } finally {
        this.loaded = true
        this.loading = false
      }
    },
    /** 顶栏切换：写状态 + localStorage；路由列表 / 大盘 watch current 自行刷新 */
    setCurrent(env: string) {
      if (!isValidEnvName(env) || env === this.current) return
      this.current = env
      try { localStorage.setItem(ENV_STORAGE_KEY, env) } catch { /* 静默 */ }
    }
  }
})

// ===== 无 active Pinia 上下文的兜底（单测 / 非组件模块）=====
let fallbackPinia: ReturnType<typeof createPinia> | null = null

export function useEnvironments() {
  if (getActivePinia()) return useEnvironmentStore()
  if (!fallbackPinia) fallbackPinia = createPinia()
  return useEnvironmentStore(fallbackPinia)
}
