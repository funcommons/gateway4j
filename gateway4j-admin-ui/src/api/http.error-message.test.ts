import { describe, it, expect } from 'vitest'
import { envelope, BusinessError, toDisplayMessage, GENERIC_ERROR_MESSAGE, ERR_PERMISSION_DENIED, ERR_RATE_LIMITED } from '@/api/http'

// D13: 后端原始错误报文不得透出到页面展示层.
// 契约:
//  - 服务器返回了真实业务文案 (如「权限不足」「route_name 已存在」) → 原样透传;
//  - message 为空或命中原始报文特征 (「系统繁忙」/trace_id/Exception...) → 按已知业务码映射友好中文;
//  - 未知码 / 5xx → 兜底「操作失败，请稍后重试」.
// 字段级错误 (BusinessError.errors → mapFieldErrors) 不受影响, 保持服务器逐字段文案.

describe('toDisplayMessage — friendly message mapping', () => {
  it('passes through real business messages', () => {
    expect(toDisplayMessage(10300, '权限不足', GENERIC_ERROR_MESSAGE)).toBe('权限不足')
    expect(toDisplayMessage(10601, 'route_name 已存在', GENERIC_ERROR_MESSAGE)).toBe('route_name 已存在')
  })

  it('maps known codes when message is empty', () => {
    expect(toDisplayMessage(ERR_PERMISSION_DENIED, '', GENERIC_ERROR_MESSAGE)).toBe('权限不足')
    expect(toDisplayMessage(ERR_RATE_LIMITED, undefined, GENERIC_ERROR_MESSAGE)).toBe('请求过于频繁，请稍后重试')
  })

  it('replaces raw payloads (系统繁忙 / trace_id) with mapped or fallback text', () => {
    expect(toDisplayMessage(10300, '系统繁忙 (trace_id: abc)', GENERIC_ERROR_MESSAGE)).toBe('权限不足')
    expect(toDisplayMessage(99999, '系统繁忙 (trace_id: abc)', GENERIC_ERROR_MESSAGE)).toBe(GENERIC_ERROR_MESSAGE)
    expect(toDisplayMessage(undefined, 'Internal Server Error', GENERIC_ERROR_MESSAGE)).toBe(GENERIC_ERROR_MESSAGE)
  })
})

describe('envelope() — error message normalization', () => {
  it('throws BusinessError with fallback text for unknown code with empty message', async () => {
    try {
      await envelope(Promise.resolve({ code: 99999, message: '' }))
      expect.unreachable('should have thrown')
    } catch (e: any) {
      expect(e).toBeInstanceOf(BusinessError)
      expect(e.message).toBe(GENERIC_ERROR_MESSAGE)
    }
  })

  it('never leaks raw 系统繁忙/trace_id text in BusinessError.message', async () => {
    try {
      await envelope(Promise.resolve({ code: 500, message: '系统繁忙，请稍后重试 (trace_id: c0a80101)' }))
      expect.unreachable('should have thrown')
    } catch (e: any) {
      expect(e.message).toBe(GENERIC_ERROR_MESSAGE)
      expect(e.message).not.toMatch(/trace_id/)
    }
  })

  it('still passes real business messages through', async () => {
    try {
      await envelope(Promise.resolve({ code: 10601, message: 'route_name 已存在' }))
      expect.unreachable('should have thrown')
    } catch (e: any) {
      expect(e.message).toBe('route_name 已存在')
    }
  })
})
