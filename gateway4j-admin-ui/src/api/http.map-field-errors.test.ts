import { describe, it, expect } from 'vitest'
import { mapFieldErrors, BusinessError, ERR_VALIDATION } from '@/api/http'

describe('mapFieldErrors — convert BusinessError.errors to el-form format', () => {
  it('maps error[] to Record<string, string>', () => {
    // el-form validateField / setFieldError expects field → message mapping
    const err = new BusinessError(ERR_VALIDATION, '参数校验失败', undefined, [
      { field: 'route_name', code: 'REQUIRED_MISSING', message: '路由名称不能为空', value: null },
      { field: 'path', code: 'INVALID_FORMAT', message: '请输入合法路径', value: 'invalid' }
    ])
    const mapped = mapFieldErrors(err)
    expect(mapped).toEqual({
      route_name: '路由名称不能为空',
      path: '请输入合法路径'
    })
  })

  it('returns empty object when BusinessError has no errors', () => {
    const err = new BusinessError(10500, 'rate limited')
    const mapped = mapFieldErrors(err)
    expect(mapped).toEqual({})
  })

  it('returns empty object for non-BusinessError', () => {
    const err = new Error('generic')
    const mapped = mapFieldErrors(err)
    expect(mapped).toEqual({})
  })

  it('skips error entries without a field', () => {
    const err = new BusinessError(ERR_VALIDATION, 'validation', undefined, [
      { field: 'route_name', code: 'REQUIRED', message: 'required', value: null },
      { field: '', code: 'GLOBAL', message: 'global error', value: null }
    ] as any)
    const mapped = mapFieldErrors(err)
    expect(Object.keys(mapped)).toEqual(['route_name'])
  })
})
