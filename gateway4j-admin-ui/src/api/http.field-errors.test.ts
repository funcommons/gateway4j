import { describe, it, expect } from 'vitest'
import { BusinessError, ERR_VALIDATION } from '@/api/http'

describe('BusinessError — field-level error support', () => {
  it('carries errors array from server response', () => {
    // API contract: when code=10100, the envelope includes an error[] array:
    //   { code: 10100, message: "参数校验失败", error: [
    //     { field: "route_name", code: "REQUIRED_MISSING", message: "路由名称不能为空", value: null }
    //   ]}
    const errs = [
      { field: 'route_name', code: 'REQUIRED_MISSING', message: '路由名称不能为空', value: null },
      { field: 'path', code: 'INVALID_FORMAT', message: '请输入合法路径', value: 'invalid' }
    ]
    const err = new BusinessError(ERR_VALIDATION, '参数校验失败', undefined, errs)
    expect(err.errors).toEqual(errs)
    expect(err.errors!.length).toBe(2)
    expect(err.errors![0].field).toBe('route_name')
  })

  it('errors defaults to undefined when not provided', () => {
    const err = new BusinessError(10500, 'rate limited')
    expect(err.errors).toBeUndefined()
  })

  it('ERR_VALIDATION constant equals 10100', () => {
    expect(ERR_VALIDATION).toBe(10100)
  })
})
