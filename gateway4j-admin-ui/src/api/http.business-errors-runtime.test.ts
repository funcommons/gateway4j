import { describe, it, expect } from 'vitest'
import { envelope, BusinessError, ERR_PERMISSION_DENIED, ERR_RATE_LIMITED, ERR_DUPLICATE_SUBMIT } from '@/api/http'

describe('envelope() — business error code runtime behavior', () => {
  it('throws BusinessError with code 10300 for permission denied', async () => {
    const p = Promise.resolve({ code: 10300, message: '权限不足' })
    try {
      await envelope(p)
      expect.unreachable('should have thrown')
    } catch (e: any) {
      expect(e).toBeInstanceOf(BusinessError)
      expect(e.code).toBe(ERR_PERMISSION_DENIED)
      expect(e.message).toBe('权限不足')
    }
  })

  it('throws BusinessError with code 10500 for rate limited', async () => {
    const p = Promise.resolve({ code: 10500, message: '请求过于频繁', retry_after: 30 })
    try {
      await envelope(p)
      expect.unreachable('should have thrown')
    } catch (e: any) {
      expect(e).toBeInstanceOf(BusinessError)
      expect(e.code).toBe(ERR_RATE_LIMITED)
      expect(e.retryAfter).toBe(30)
    }
  })

  it('throws BusinessError with code 10501 for duplicate submit', async () => {
    const p = Promise.resolve({ code: 10501, message: '请勿重复操作' })
    try {
      await envelope(p)
      expect.unreachable('should have thrown')
    } catch (e: any) {
      expect(e).toBeInstanceOf(BusinessError)
      expect(e.code).toBe(ERR_DUPLICATE_SUBMIT)
      expect(e.message).toBe('请勿重复操作')
    }
  })

  it('unwraps data on code 0 (success)', async () => {
    const p = Promise.resolve({ code: 0, data: { id: 1, name: 'test' } })
    const result = await envelope<{ id: number; name: string }>(p)
    expect(result).toEqual({ id: 1, name: 'test' })
  })

  it('returns raw value when response has no code field', async () => {
    const p = Promise.resolve({ id: 1, name: 'test' })
    const result = await envelope<{ id: number; name: string }>(p)
    expect(result).toEqual({ id: 1, name: 'test' })
  })

  it('throws BusinessError for any non-zero code', async () => {
    const p = Promise.resolve({ code: 10100, message: '参数校验失败' })
    try {
      await envelope(p)
      expect.unreachable('should have thrown')
    } catch (e: any) {
      expect(e).toBeInstanceOf(BusinessError)
      expect(e.code).toBe(10100)
    }
  })

  it('BusinessError without retryAfter defaults to undefined', async () => {
    const p = Promise.resolve({ code: 10500, message: 'rate limited' })
    try {
      await envelope(p)
      expect.unreachable('should have thrown')
    } catch (e: any) {
      expect(e).toBeInstanceOf(BusinessError)
      expect(e.retryAfter).toBeUndefined()
    }
  })
})
