import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

// H7b 契约用例：环境维度 Pinia store（探测降级 / current 持久化 / default 恒在首）
const mocks = vi.hoisted(() => ({
  listEnvironments: vi.fn()
}))

vi.mock('@/api/environment', () => ({
  listEnvironments: mocks.listEnvironments
}))

import { useEnvironmentStore, useEnvironments } from '@/store/environment'
import { ENV_STORAGE_KEY, DEFAULT_ENV } from '@/utils/environment'
import { installMemoryStorage } from '@/test-utils/memory-storage'

beforeEach(() => {
  setActivePinia(createPinia())
  installMemoryStorage()
  mocks.listEnvironments.mockReset()
})

describe('useEnvironmentStore — ensureLoaded 成功路径（契约 1）', () => {
  it('探测成功：available=true，default 恒在首（前端兜底再排序）', async () => {
    mocks.listEnvironments.mockResolvedValue({ environments: ['staging', 'default', 'prod'] })
    const s = useEnvironmentStore()
    await s.ensureLoaded()
    expect(s.available).toBe(true)
    expect(s.environments[0]).toBe('default')
    expect(s.environments).toEqual(['default', 'staging', 'prod'])
  })

  it('非法环境名（不满足 ^[a-z0-9_-]{1,20}$）被过滤', async () => {
    mocks.listEnvironments.mockResolvedValue({ environments: ['default', 'Bad Env', 'x'.repeat(21), 'ok-1'] })
    const s = useEnvironmentStore()
    await s.ensureLoaded()
    expect(s.environments).toEqual(['default', 'ok-1'])
  })

  it('幂等：loaded 后不重复请求', async () => {
    mocks.listEnvironments.mockResolvedValue({ environments: ['default'] })
    const s = useEnvironmentStore()
    await s.ensureLoaded()
    await s.ensureLoaded()
    expect(mocks.listEnvironments).toHaveBeenCalledTimes(1)
  })

  it('存储的 current 不在列表里 → 回 default', async () => {
    localStorage.setItem(ENV_STORAGE_KEY, 'ghost')
    mocks.listEnvironments.mockResolvedValue({ environments: ['default', 'staging'] })
    const s = useEnvironmentStore()
    await s.ensureLoaded()
    expect(s.current).toBe('default')
  })
})

describe('useEnvironmentStore — 404 降级（契约 1：环境功能整体隐藏）', () => {
  it('GET /v1/environments 404 / 失败 → available=false、environments 仅空（UI 仅用 default）', async () => {
    mocks.listEnvironments.mockRejectedValue(new Error('Request failed with status 404'))
    const s = useEnvironmentStore()
    await s.ensureLoaded()
    expect(s.available).toBe(false)
    expect(s.environments).toEqual([])
    expect(s.current).toBe(DEFAULT_ENV)
  })

  it('降级后 switchable=false → 切换器不渲染的条件成立', async () => {
    mocks.listEnvironments.mockRejectedValue(new Error('404'))
    const s = useEnvironmentStore()
    await s.ensureLoaded()
    expect(s.switchable).toBe(false)
  })
})

describe('useEnvironmentStore — current 持久化（Pinia + localStorage gw4j_env）', () => {
  it('缺省 current=default；setCurrent 写状态 + localStorage', async () => {
    const s = useEnvironmentStore()
    expect(s.current).toBe('default')
    s.setCurrent('staging')
    expect(s.current).toBe('staging')
    expect(localStorage.getItem(ENV_STORAGE_KEY)).toBe('staging')
  })

  it('localStorage 里有合法值 → 初始化读取', () => {
    localStorage.setItem(ENV_STORAGE_KEY, 'staging')
    expect(useEnvironmentStore().current).toBe('staging')
  })

  it('localStorage 非法值 → 回 default（store 已创建过时同样重新读取需新 pinia）', () => {
    localStorage.setItem(ENV_STORAGE_KEY, 'NOT VALID!')
    setActivePinia(createPinia()) // 新实例 → state 工厂重跑 → 重新读 localStorage
    expect(useEnvironmentStore().current).toBe('default')
  })

  it('setCurrent 拒绝非法名与重复值', () => {
    const s = useEnvironmentStore()
    s.setCurrent('Bad Env!')
    expect(s.current).toBe('default')
    localStorage.removeItem(ENV_STORAGE_KEY)
    s.setCurrent('default')
    expect(localStorage.getItem(ENV_STORAGE_KEY)).toBeNull()
  })
})

describe('getters 与 useEnvironments 兜底', () => {
  it('options 映射为 {value,label}；单环境 switchable=false，多环境 true', async () => {
    mocks.listEnvironments.mockResolvedValue({ environments: ['default', 'staging'] })
    const s = useEnvironmentStore()
    await s.ensureLoaded()
    expect(s.options).toEqual([{ value: 'default', label: 'default' }, { value: 'staging', label: 'staging' }])
    expect(s.switchable).toBe(true)
  })

  it('无 active Pinia 上下文 → useEnvironments() 落到模块级兜底实例（不抛错）', async () => {
    setActivePinia(undefined as never)
    const env = useEnvironments()
    expect(env.current).toBe('default')
    mocks.listEnvironments.mockRejectedValue(new Error('404'))
    await env.ensureLoaded()
    expect(env.available).toBe(false)
  })
})
