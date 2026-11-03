import { describe, it, expect, vi } from 'vitest'
import { h } from 'vue'
import { ElForm } from 'element-plus'
import { mount } from '@vue/test-utils'
import FcInput from './FcInput.vue'
import FcSwitch from './FcSwitch.vue'
import FcRadioGroup from './FcRadioGroup.vue'
import FcRadio from './FcRadio.vue'
import FcRadioButton from './FcRadioButton.vue'
import FcButton from './FcButton.vue'

/**
 * Fc* 组件的 el-form 继承契约。
 *
 * 背景：Vue 的 `normalizePropsOptions` 会给 Boolean 型 prop 设 `shouldCast`，
 * `resolvePropValue` 里 `isAbsent && !hasDefault -> false`。
 * 所以「不把 disabled 写进 withDefaults」并不够 —— 缺省 Boolean prop 会被 cast 成 false，
 * 等于把「继承 el-form disabled」的语义压死。
 * 必须**显式**写 `disabled: undefined`（编译成 `default: undefined`）→ prop 才真保持 undefined。
 * （size 是 String，不被 cast，但写死 `size: 'default'` 同样压死继承。）
 *
 * 本文件锁定两件事：
 *  1. 继承生效 —— `<el-form disabled>` / `<el-form size="small">` 对 Fc* 生效；
 *  2. 默认不变 —— 没传 disabled 时控件可用，size 仍走 EP 默认档位。
 */

/** 在 el-form 里挂一个组件. */
function inForm(formProps: Record<string, unknown>, renderChild: () => unknown) {
  return mount({
    render: () => h(ElForm, formProps, { default: () => renderChild() as any }),
  })
}

const RADIO_OPTIONS = [
  { label: 'A', value: 'a' },
  { label: 'B', value: 'b' },
]

describe('FcInput — el-form 继承', () => {
  it('继承 el-form disabled: 原生 input 带 disabled 属性', () => {
    const w = inForm({ disabled: true }, () => h(FcInput, { modelValue: '' }))
    expect(w.find('input').attributes('disabled')).toBeDefined()
    expect(w.find('.el-input.is-disabled').exists()).toBe(true)
  })

  it('继承 el-form size: small', () => {
    const w = inForm({ size: 'small' }, () => h(FcInput, { modelValue: '' }))
    expect(w.find('.el-input--small').exists()).toBe(true)
    expect(w.find('.fc-input').classes()).toContain('size-small')
  })

  it('默认: 未传 disabled 时可用, size 走 default 档位', () => {
    const w = mount({ render: () => h(FcInput, { modelValue: '' }) })
    expect(w.find('input').attributes('disabled')).toBeUndefined()
    expect(w.find('.el-input.is-disabled').exists()).toBe(false)
    expect(w.find('.fc-input').classes()).toContain('size-default')
    expect(w.find('.el-input--small').exists()).toBe(false)
    expect(w.find('.el-input--large').exists()).toBe(false)
  })

  it('显式 disabled=false 时仍然禁用 (prop 优先级高于继承)', () => {
    const w = inForm({ disabled: true }, () => h(FcInput, { modelValue: '', disabled: false }))
    expect(w.find('input').attributes('disabled')).toBeUndefined()
  })
})

describe('FcSwitch — el-form 继承', () => {
  it('继承 el-form disabled: 原生 button 带 disabled 属性', () => {
    const w = inForm({ disabled: true }, () => h(FcSwitch, { modelValue: false }))
    const btn = w.find('button.fc-switch')
    expect(btn.attributes('disabled')).toBeDefined()
    expect(btn.classes()).toContain('is-disabled')
  })

  it('继承 el-form size: small', () => {
    const w = inForm({ size: 'small' }, () => h(FcSwitch, { modelValue: false }))
    expect(w.find('button.fc-switch').classes()).toContain('size-small')
  })

  it('默认: 未传 disabled 时可用, size 走 default 档位', async () => {
    const w = mount({ render: () => h(FcSwitch, { modelValue: false, 'onUpdate:modelValue': () => {} }) })
    const btn = w.find('button.fc-switch')
    expect(btn.attributes('disabled')).toBeUndefined()
    expect(btn.classes()).toContain('size-default')
    await btn.trigger('click')
    expect(w.findComponent(FcSwitch).emitted('update:modelValue')).toBeTruthy()
  })
})

describe('FcRadioGroup / FcRadio / FcRadioButton — el-form 继承', () => {
  it('继承 el-form disabled: 分组与子项都禁用, 点击不发 update:modelValue', async () => {
    const w = inForm({ disabled: true }, () =>
      h(FcRadioGroup, { modelValue: 'a', options: RADIO_OPTIONS }),
    )
    expect(w.find('.fc-radio-group').classes()).toContain('size-default')
    const radios = w.findAllComponents(FcRadio)
    expect(radios.length).toBe(2)
    expect(radios[0]!.classes()).toContain('is-disabled')
    expect(radios[1]!.classes()).toContain('is-disabled')
    await radios[1]!.find('.fc-radio__input').trigger('click')
    expect(w.findComponent(FcRadioGroup).emitted('update:modelValue')).toBeFalsy()
  })

  it('继承 el-form size: small (group 与子项同步)', () => {
    const w = inForm({ size: 'small' }, () =>
      h(FcRadioGroup, { modelValue: 'a', options: RADIO_OPTIONS }),
    )
    expect(w.find('.fc-radio-group').classes()).toContain('size-small')
    expect(w.findAllComponents(FcRadio)[0]!.classes()).toContain('size-small')
  })

  it('FcRadioButton 也继承 el-form disabled', () => {
    const w = inForm({ disabled: true }, () =>
      h(FcRadioGroup, { modelValue: 'a', variant: 'button', options: RADIO_OPTIONS }),
    )
    const btns = w.findAllComponents(FcRadioButton)
    expect(btns.length).toBe(2)
    expect(btns[0]!.find('button').attributes('disabled')).toBeDefined()
  })

  it('默认: 未传 disabled 时可选, size 走 default 档位', async () => {
    const w = mount({
      render: () => h(FcRadioGroup, { modelValue: 'a', options: RADIO_OPTIONS }),
    })
    expect(w.find('.fc-radio-group').classes()).toContain('size-default')
    const radios = w.findAllComponents(FcRadio)
    expect(radios[0]!.classes()).not.toContain('is-disabled')
    await radios[1]!.find('.fc-radio__input').trigger('click')
    expect(w.findComponent(FcRadioGroup).emitted('update:modelValue')?.[0]).toEqual(['b'])
  })
})

describe('FcButton — el-form 继承', () => {
  it('继承 el-form disabled: 原生 button 带 disabled 属性', () => {
    const w = inForm({ disabled: true }, () => h(FcButton, {}, { default: () => '保存' }))
    const btn = w.find('button.el-button')
    expect(btn.attributes('disabled')).toBeDefined()
    expect(btn.classes()).toContain('is-disabled')
  })

  it('默认: 未传 disabled 时可用', async () => {
    const onClick = vi.fn()
    const w = mount({
      render: () => h(FcButton, { onClick }, { default: () => '保存' }),
    })
    const btn = w.find('button.el-button')
    expect(btn.attributes('disabled')).toBeUndefined()
    await btn.trigger('click')
    expect(onClick).toHaveBeenCalled()
  })
})
