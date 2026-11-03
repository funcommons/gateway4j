import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { mountFc, emittedOf } from '../__tests__/helpers/mount'
import FcDatePicker from './FcDatePicker.vue'

const SOURCE = fs.readFileSync(path.resolve(__dirname, 'FcDatePicker.vue'), 'utf-8')

describe('FcDatePicker', () => {
  it('渲染 EP 日期选择器 + 原生 input', () => {
    const w = mountFc(FcDatePicker, { props: { modelValue: '2026-01-01', valueFormat: 'YYYY-MM-DD' } })
    expect(w.find('.el-date-editor').exists()).toBe(true)
    expect(w.find('input').exists()).toBe(true)
  })

  it('class 透传：调用方的 class 落在根节点（EP 只透传 class/style）', () => {
    const w = mountFc(FcDatePicker, {
      props: { modelValue: null },
      attrs: { class: 'audit-range' },
    })
    expect(w.find('.audit-range').exists()).toBe(true)
    // 内置 class 与调用方 class 共存
    expect(w.find('.fc-date-picker').exists()).toBe(true)
  })

  it('popper-class 合并内置的 fc-date-picker-popper（弹层接主题）', () => {
    const w = mountFc(FcDatePicker, {
      props: { modelValue: null, popperClass: 'my-popper' },
    })
    const cls = w.findComponent({ name: 'ElDatePicker' }).props('popperClass') as string
    expect(cls).toContain('fc-date-picker-popper')
    expect(cls).toContain('my-popper')
  })

  it('未传 popperClass 时也带内置类', () => {
    const w = mountFc(FcDatePicker, { props: { modelValue: null } })
    const cls = w.findComponent({ name: 'ElDatePicker' }).props('popperClass') as string
    expect(cls).toBe('fc-date-picker-popper')
  })

  it('type / value-format / 占位符下发到 EP 组件', () => {
    const w = mountFc(FcDatePicker, {
      props: {
        modelValue: null,
        type: 'datetimerange',
        valueFormat: 'YYYY-MM-DDTHH:mm:ss',
        startPlaceholder: '开始',
        endPlaceholder: '结束',
      },
    })
    const dp = w.findComponent({ name: 'ElDatePicker' })
    expect(dp.props('type')).toBe('datetimerange')
    expect(dp.props('valueFormat')).toBe('YYYY-MM-DDTHH:mm:ss')
    expect(dp.props('startPlaceholder')).toBe('开始')
    expect(dp.props('endPlaceholder')).toBe('结束')
  })

  it('clearable 默认开启，可关', () => {
    const w = mountFc(FcDatePicker, { props: { modelValue: null } })
    expect(w.findComponent({ name: 'ElDatePicker' }).props('clearable')).toBe(true)
    const w2 = mountFc(FcDatePicker, { props: { modelValue: null, clearable: false } })
    expect(w2.findComponent({ name: 'ElDatePicker' }).props('clearable')).toBe(false)
  })

  it('emit 出口：底层 change / update:modelValue 透传到 FcDatePicker', () => {
    const w = mountFc(FcDatePicker, { props: { modelValue: null } })
    const picker = w.findComponent({ name: 'Picker' })
    picker.vm.$emit('change', '2026-01-02')
    picker.vm.$emit('update:modelValue', '2026-01-02')
    expect(emittedOf(w, 'change')[0]).toEqual(['2026-01-02'])
    expect(emittedOf(w, 'update:modelValue')[0]).toEqual(['2026-01-02'])
  })

  it('L2 契约：disabled → 根节点 is-disabled + 原生 input 禁用（禁用三通道之一）', () => {
    const w = mountFc(FcDatePicker, { props: { modelValue: null, disabled: true } })
    expect(w.find('.fc-date-picker.is-disabled').exists()).toBe(true)
    expect(w.find('input').attributes('disabled')).toBeDefined()
  })

  it('L2 契约：内层原生 input 有 :focus-visible 焦点环（26a，瞬时出现）', () => {
    expect(SOURCE).toMatch(/:focus-visible/)
    // 焦点环走 --app-focus-ring token，且**不**带 transition（gate 15：瞬时出现，不渐显）
    expect(SOURCE).toMatch(/outline:\s*2px solid var\(--app-focus-ring\)/)
    const focusRule = SOURCE.slice(SOURCE.indexOf(':focus-visible'))
    const rule = focusRule.slice(0, focusRule.indexOf('}'))
    expect(rule).not.toMatch(/transition/)
  })

  it('L2 契约：禁用态三通道 —— 透明度 + cursor:not-allowed（39a，不只靠 opacity）', () => {
    expect(SOURCE).toMatch(/&\.is-disabled/)
    expect(SOURCE).toMatch(/cursor:\s*not-allowed/)
    expect(SOURCE).toMatch(/opacity:\s*0\.\d+/)
  })
})
