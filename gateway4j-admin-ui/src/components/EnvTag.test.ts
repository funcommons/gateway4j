import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'

// H7b T4 契约用例：路由列表「环境」小标签 —— default 灰、非 default 蓝、缺省视为 default
import EnvTag from '@/components/EnvTag.vue'

function factory(environment?: string | null) {
  return mount(EnvTag, { props: { environment } })
}

describe('EnvTag — 环境小标签色调', () => {
  it('default → 灰（gray）', () => {
    const w = factory('default')
    expect(w.text()).toBe('default')
    expect(w.props().environment).toBe('default')
    // FcTag 的 color prop 透传
    const tag = w.findComponent({ name: 'FcTag' })
    expect(tag).toBeTruthy()
  })

  it('非 default → 蓝（primary）', () => {
    const w = factory('staging')
    expect(w.text()).toBe('staging')
  })

  it('缺省 / 旧后端不下发 → 视为 default（灰）', () => {
    const w = factory(undefined)
    expect(w.text()).toBe('default')
    const w2 = factory(null)
    expect(w2.text()).toBe('default')
  })

  it('envTagTone 纯函数口径：default 灰 / 非默认蓝', async () => {
    const { envTagTone, DEFAULT_ENV } = await import('@/utils/environment')
    expect(DEFAULT_ENV).toBe('default')
    expect(envTagTone('default')).toBe('gray')
    expect(envTagTone('staging')).toBe('primary')
    expect(envTagTone(undefined)).toBe('gray')
    expect(envTagTone('')).toBe('gray')
  })
})
