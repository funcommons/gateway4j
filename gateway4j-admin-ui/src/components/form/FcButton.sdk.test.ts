import { describe, it, expect } from 'vitest'
import { mountFc, emittedOf } from '../__tests__/helpers/mount'
import FcButton from './FcButton.vue'

describe('FcButton', () => {
  it('渲染默认 variant=primary + size=md', () => {
    const w = mountFc(FcButton, { slots: { default: '保存' } })
    const el = w.find('.fc-button')
    expect(el.exists()).toBe(true)
    expect(el.classes()).toContain('variant-primary')
    expect(el.classes()).toContain('size-md')
    expect(el.classes()).not.toContain('is-block')
    expect(w.text()).toBe('保存')
  })

  it('variant=danger 输出 fc-button.variant-danger', () => {
    const w = mountFc(FcButton, { props: { variant: 'danger' }, slots: { default: '删' } })
    expect(w.find('.fc-button.variant-danger').exists()).toBe(true)
  })

  it('P3E: variant=danger + disabled 命中禁用灰选择器 (.variant-danger.is-disabled) 且透传 disabled', () => {
    const w = mountFc(FcButton, { props: { variant: 'danger', disabled: true }, slots: { default: '删' } })
    // 样式在 jsdom 不参与计算, 断言锚定 CSS 选择器的两个 class 挂钩:
    // .variant-danger.is-disabled 同时在位 → 禁用灰覆盖规则生效路径成立。
    const disabled = w.find('.fc-button.variant-danger.is-disabled')
    expect(disabled.exists()).toBe(true)
    expect(disabled.attributes('disabled')).toBeDefined()
  })

  it('P3-k: variant=primary + disabled 命中禁用灰选择器 (.variant-primary.is-disabled) 且透传 disabled (与 danger 对称)', () => {
    const w = mountFc(FcButton, { props: { variant: 'primary', disabled: true }, slots: { default: '存' } })
    // 同 danger 契约钉: .variant-primary.is-disabled 同时在位 → primary 禁用灰
    // (muted/border/tertiary 三通道, FcButton.vue 顶层兄弟规则) 生效路径成立。
    const disabled = w.find('.fc-button.variant-primary.is-disabled')
    expect(disabled.exists()).toBe(true)
    expect(disabled.attributes('disabled')).toBeDefined()
  })

  it('size=sm 输出 size-sm class', () => {
    const w = mountFc(FcButton, { props: { size: 'sm' }, slots: { default: 'x' } })
    expect(w.find('.fc-button.size-sm').exists()).toBe(true)
  })

  it('显式 type 覆盖 variant', () => {
    const w = mountFc(FcButton, { props: { variant: 'primary', type: 'warning' } })
    // el-button 渲染 warning 类型 (EP 用 el-button--warning, 不是 is-warning)
    expect(w.find('.fc-button.variant-primary').exists()).toBe(true)
    expect(w.find('.el-button.el-button--warning').exists()).toBe(true)
  })

  it('block 时加 is-block class', () => {
    const w = mountFc(FcButton, { props: { block: true } })
    expect(w.find('.fc-button.is-block').exists()).toBe(true)
  })

  it('点击触发 click 事件', async () => {
    const w = mountFc(FcButton, { slots: { default: 'go' } })
    await w.trigger('click')
    expect(emittedOf(w, 'click').length).toBe(1)
  })

  it('disabled 时点击不 emit click', async () => {
    const w = mountFc(FcButton, { props: { disabled: true } })
    await w.trigger('click')
    expect(emittedOf(w, 'click').length).toBe(0)
  })

  it('loading 时点击不 emit click', async () => {
    const w = mountFc(FcButton, { props: { loading: true } })
    await w.trigger('click')
    expect(emittedOf(w, 'click').length).toBe(0)
  })

  it('variant=text 时加 is-text-like class', () => {
    const w = mountFc(FcButton, { props: { variant: 'text' } })
    expect(w.find('.fc-button.is-text-like').exists()).toBe(true)
  })
})
