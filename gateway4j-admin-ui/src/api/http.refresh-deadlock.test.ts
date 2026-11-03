import { describe, it, expect, beforeAll } from 'vitest'
import { AxiosError, type InternalAxiosRequestConfig } from 'axios'
import { http, envelope, BusinessError, setOnTokenRefresh } from './http'
import { refreshToken as doRefresh } from './auth'

/**
 * 回归：存量失效 refresh token 时的 401 刷新自死锁。
 *
 * 死锁链（修复前）：refresh 请求自身 401 → 响应拦截器 tryRefreshToken() →
 * 并发去重命中在飞的 _refreshPromise —— 而该 promise 正等待本次请求的结果
 * → await 自己 → 永不落定。表现：路由守卫卡死在 await auth.init()，
 * 页面空白、token 不清、不跳 /login、控制台无报错（仅两条 401 网络日志）。
 *
 * 本文件用真实拦截器 + 自定义 adapter 复现该链路：修复前以下用例超时，
 * 修复后 Promise 必须落定并按既有契约 reject。
 */

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// 本项目 jsdom 环境不提供可用 localStorage（同 recent-images.test.ts 的惯例），装 Map 桩
const localStorageMock = (() => {
  let store = new Map<string, string>()
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => void store.clear(),
  }
})()
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock, configurable: true })

/** 与 store/auth.ts 的 setOnTokenRefresh 回调同构（走同一个 http 实例） */
function installStoreMirrorCallback() {
  setOnTokenRefresh(async () => {
    const refresh = localStorage.getItem('gw4j_refresh')
    if (!refresh) return null
    try {
      const r = await envelope<{ access_token: string }>(doRefresh(refresh))
      return r.access_token
    } catch {
      return null
    }
  })
}

/** 所有请求一律 401（业务信封形态），模拟 refresh token 已失效的后端 */
beforeAll(() => {
  http.defaults.adapter = async (config: InternalAxiosRequestConfig) => {
    throw new AxiosError('Request failed with status code 401', undefined, config, undefined, {
      data: { code: 10201, message: '登录已过期，请重新登录' },
      status: 401,
      statusText: 'Unauthorized',
      headers: {},
      config,
    } as never)
  }
  // jsdom 的 location.href 赋值会打 Not implemented 噪音，置于 /login 同径跳过重定向
  window.history.replaceState({}, '', '/login')
})

/** race 出超时哨兵：修复前死锁时返回 'timeout'，用例即红 */
async function settledOrTimeout<T>(p: Promise<T>, ms = 500): Promise<'settled' | 'timeout'> {
  return Promise.race([p.then(() => 'settled' as const, () => 'settled' as const), sleep(ms).then(() => 'timeout' as const)])
}

describe('http.ts — 401 refresh 死锁回归（存量失效 refresh token）', () => {
  it('启动路径：refresh 请求自身 401 必须落定（修复前：await 自己永久死锁）', async () => {
    localStorage.setItem('gw4j_refresh', 'stale.refresh.token')
    localStorage.setItem('gw4j_token', 'stale.access.token')

    const p = doRefresh('stale.refresh.token')
    const outcome = await settledOrTimeout(p)
    // 死锁回归哨兵：先证明 promise 会落定，再证明 reject 形态
    expect(outcome).toBe('settled')
    await expect(p).rejects.toBeInstanceOf(BusinessError)
  })

  it('会话路径：业务请求 401 + 失效 refresh token 必须落定并清 token（修复前：同样死锁）', async () => {
    localStorage.setItem('gw4j_refresh', 'stale.refresh.token')
    localStorage.setItem('gw4j_token', 'stale.access.token')
    installStoreMirrorCallback()

    const p = http.get('/v1/routes')
    const outcome = await settledOrTimeout(p)
    expect(outcome).toBe('settled')
    await expect(p).rejects.toThrow()
    // 兜底链走到头：access token 已被清，交由守卫重定向登录页
    expect(localStorage.getItem('gw4j_token')).toBeNull()
  })

  it('refresh 端点路径契约：修复依赖 /v1/auth/refresh 精确匹配', async () => {
    // 守护 REFRESH_PATH 与 api/auth.ts 的实际路径一致 —— 若有人改路径而忘改
    // REFRESH_PATH，死锁会回归，此用例用两处源码对齐兜底
    const { refreshToken } = await import('./auth')
    const p = refreshToken('anything')
    expect(await settledOrTimeout(p)).toBe('settled')
  })
})
