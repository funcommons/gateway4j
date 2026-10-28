import { describe, it, expect } from 'vitest'
import { envelope, normalizePagination } from '@/api/http'

// D18: 后端 Long 统一序列化为字符串, 分页元数据 total/size/current/pages 以 "11" 到达;
// el-pagination 对 :total 做数字类型校验, 字符串会让整个分页控件不渲染.
// 契约: envelope()/normalizePagination() 必须把分页元数据归一为 number.

describe('normalizePagination — paginated payload metadata coercion', () => {
  it('coerces string total/size/current/pages to numbers', () => {
    const out: any = normalizePagination({
      records: [{ id: '1' }],
      total: '11',
      size: '20',
      current: '1',
      pages: '1'
    })
    expect(out.total).toBe(11)
    expect(out.size).toBe(20)
    expect(out.current).toBe(1)
    expect(out.pages).toBe(1)
  })

  it('keeps numeric metadata as-is (idempotent)', () => {
    const payload = { records: [], total: 0, size: 20, current: 1, pages: 0 }
    expect(normalizePagination(payload)).toEqual(payload)
  })

  it('passes through non-paginated payloads untouched', () => {
    expect(normalizePagination([1, 2, 3])).toEqual([1, 2, 3])
    expect(normalizePagination({ id: 1, name: 'x' })).toEqual({ id: 1, name: 'x' })
    expect(normalizePagination(null)).toBeNull()
  })

  it('keeps non-numeric string values (no NaN corruption)', () => {
    const out: any = normalizePagination({ records: [], total: 'abc' })
    expect(out.total).toBe('abc')
  })

  it('keeps null metadata as null', () => {
    const out: any = normalizePagination({ records: [], total: null })
    expect(out.total).toBeNull()
  })
})

describe('envelope() — pagination normalization on both shapes', () => {
  it('normalizes paginated payload inside data', async () => {
    const out: any = await envelope(
      Promise.resolve({ code: 0, data: { records: [{ id: '1' }], total: '11', size: '20', current: '1', pages: '1' } })
    )
    expect(out.total).toBe(11)
    expect(out.size).toBe(20)
    expect(out.current).toBe(1)
    expect(out.pages).toBe(1)
    expect(out.records).toEqual([{ id: '1' }])
  })

  it('normalizes paginated payload at the root (no envelope)', async () => {
    const out: any = await envelope(Promise.resolve({ records: [], total: '5' }))
    expect(out.total).toBe(5)
  })
})
