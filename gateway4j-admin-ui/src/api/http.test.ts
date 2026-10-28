import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import axios from 'axios'
import { envelope, getToken, setToken } from '@/api/http'

const localStorageMock = (() => {
  const m = new Map<string, string>()
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => m.set(k, v),
    removeItem: (k: string) => m.delete(k),
    clear: () => m.clear()
  }
})()

describe('http token utils', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock, configurable: true })
    localStorageMock.clear()
  })

  it('setToken / getToken roundtrip', () => {
    setToken('abc')
    expect(getToken()).toBe('abc')
    setToken(null)
    expect(getToken()).toBeNull()
  })
})

describe('envelope', () => {
  it('returns data on code=0', async () => {
    const out = await envelope(Promise.resolve({ code: 0, data: { x: 1 } }))
    expect(out).toEqual({ x: 1 })
  })

  it('rejects on non-zero code', async () => {
    await expect(envelope(Promise.resolve({ code: 10100, message: 'bad' }))).rejects.toThrow('bad')
  })

  it('passes through plain payload (no envelope)', async () => {
    const out = await envelope(Promise.resolve([1, 2, 3]))
    expect(out).toEqual([1, 2, 3])
  })
})

describe('interceptors behaviour', () => {
  const interceptors: any = { reqs: [] as any[] }
  const setReq = axios.interceptors.request.use as unknown as vi.Mock
  const setRes = axios.interceptors.response.use as unknown as vi.Mock

  beforeEach(() => {
    interceptors.reqs = []
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('attaches Authorization header from localStorage', async () => {
    const adapter = (cfg: any) => {
      interceptors.reqs.push(cfg)
      return Promise.resolve({ status: 200, data: { code: 0, data: {} }, config: cfg, headers: {} as any })
    }
    const instance = axios.create({ adapter })
    instance.interceptors.request.use((cfg: any) => {
      const tok = getToken()
      if (tok) cfg.headers.set('Authorization', `Bearer ${tok}`)
      return cfg
    })
    setToken('tt')
    await instance.get('/x')
    expect(interceptors.reqs[0].headers.get('Authorization')).toBe('Bearer tt')
  })
})
