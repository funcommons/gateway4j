import { describe, it, expect } from 'vitest'
import { mountFc, emittedOf } from '../__tests__/helpers/mount'
import FcCheckbox from './FcCheckbox.vue'
import FcCheckboxGroup from './FcCheckboxGroup.vue'

describe('FcCheckbox', () => {
  it('渲染 EP 勾选框 + 原生 input（DOM 结构不变，e2e 定位不受影响）', () => {
    const w = mountFc(FcCheckbox, { props: { modelValue: false } })
    expect(w.find('.el-checkbox').exists()).toBe(true)
    expect(w.find('input.el-checkbox__original').exists()).toBe(true)
  })

  it('label prop 渲染勾选框右侧文案', () => {
    const w = mountFc(FcCheckbox, { props: { modelValue: false, label: '记住我' } })
    expect(w.text()).toContain('记住我')
  })

  it('attrs 透传：data-testid 落在根节点', () => {
    const w = mountFc(FcCheckbox, {
      props: { modelValue: false },
      attrs: { 'data-testid': 'remember-me' },
    })
    expect(w.find('[data-testid="remember-me"]').exists()).toBe(true)
  })

  it('点击 → emit update:modelValue + change', async () => {
    const w = mountFc(FcCheckbox, { props: { modelValue: false } })
    await w.find('input.el-checkbox__original').setValue(true)
    expect(emittedOf(w, 'update:modelValue')[0]).toEqual([true])
    // change 与 EP 对齐: (value, event) —— 第二个 payload 是原生事件
    const change = emittedOf(w, 'change')[0] as unknown[]
    expect(change[0]).toBe(true)
    expect(change[1]).toBeInstanceOf(Event)
  })

  it('M2 契约：change 的第二个 payload 是原生 Event（EP 发的是 change(value, event)）', async () => {
    const w = mountFc(FcCheckbox, { props: { modelValue: false } })
    await w.find('input.el-checkbox__original').setValue(true)
    const payload = emittedOf(w, 'change')[0] as unknown[]
    expect(payload.length).toBe(2)
    expect(payload[0]).toBe(true)
    expect(payload[1]).toBeInstanceOf(Event)
  })

  it('disabled → 原生 input 禁用', () => {
    const w = mountFc(FcCheckbox, { props: { modelValue: false, disabled: true } })
    expect(w.find('input.el-checkbox__original').attributes('disabled')).toBeDefined()
  })

  it('indeterminate → 根节点带 is-indeterminate', () => {
    const w = mountFc(FcCheckbox, { props: { modelValue: false, indeterminate: true } })
    expect(w.find('.el-checkbox__input.is-indeterminate').exists()).toBe(true)
  })

  it('不传 modelValue（非受控）→ 点击能勾上（不被误判成受控）', async () => {
    const w = mountFc(FcCheckbox)
    const input = w.find('input.el-checkbox__original')
    expect((input.element as HTMLInputElement).checked).toBe(false)
    await input.setValue(true)
    expect((w.find('input.el-checkbox__original').element as HTMLInputElement).checked).toBe(true)
  })

  it('默认插槽内容优先于 label 文案', () => {
    const w = mountFc(FcCheckbox, {
      props: { modelValue: false, label: 'label 文案' },
      slots: { default: '<span class="custom">自定义</span>' },
    })
    expect(w.find('.custom').exists()).toBe(true)
    expect(w.text()).not.toContain('label 文案')
  })
})

describe('FcCheckboxGroup', () => {
  it('根节点就是 EP 分组元素（业务布局 class 仍落在同一元素）', () => {
    const w = mountFc(FcCheckboxGroup, {
      props: { modelValue: [] },
      attrs: { class: 'grant-group-items' },
    })
    expect(w.find('.el-checkbox-group').exists()).toBe(true)
    expect(w.find('.grant-group-items').exists()).toBe(true)
  })

  it('子项 FcCheckbox 参与分组：勾选后分组的 modelValue 更新', async () => {
    const w = mountFc(FcCheckboxGroup, {
      props: { modelValue: [] },
      slots: {
        default: '<FcCheckbox value="route:read">读取</FcCheckbox>',
      },
      global: { components: { FcCheckbox } },
    })
    await w.find('input.el-checkbox__original').setValue(true)
    expect(emittedOf(w, 'update:modelValue')[0]).toEqual([['route:read']])
  })

  it('max 限制：已选满 max 后再点不再加入', async () => {
    const w = mountFc(FcCheckboxGroup, {
      props: { modelValue: ['a'], max: 1 },
      slots: {
        default: '<FcCheckbox value="a">A</FcCheckbox><FcCheckbox value="b">B</FcCheckbox>',
      },
      global: { components: { FcCheckbox } },
    })
    const inputs = w.findAll('input.el-checkbox__original')
    expect(inputs.length).toBe(2)
    await inputs[1]!.setValue(true)
    expect(emittedOf(w, 'update:modelValue').length).toBe(0)
  })

  it('M1 契约：不传默认插槽 → EP 的 options 生效（EP 自己渲染 fallback）', () => {
    const w = mountFc(FcCheckboxGroup, {
      props: {
        modelValue: [],
        options: [
          { label: '甲', value: 'a' },
          { label: '乙', value: 'b' },
        ],
      },
    })
    expect(w.findAll('.el-checkbox').length).toBe(2)
    expect(w.text()).toContain('甲')
    expect(w.text()).toContain('乙')
  })

  it('M1 契约：传默认插槽 → 槽内容优先，options 不再生效（与 EP 语义一致）', () => {
    const w = mountFc(FcCheckboxGroup, {
      props: { modelValue: [], options: [{ label: '甲', value: 'a' }] },
      slots: { default: '<span class="mine">自定义</span>' },
    })
    expect(w.find('.mine').exists()).toBe(true)
    expect(w.findAll('.el-checkbox').length).toBe(0)
    expect(w.text()).not.toContain('甲')
  })

  it('M1 契约：type=button → EP 按按钮样式渲染 options（optionComponent 生效）', () => {
    const w = mountFc(FcCheckboxGroup, {
      props: {
        modelValue: [],
        options: [{ label: '甲', value: 'a' }],
        type: 'button',
      },
    })
    expect(w.find('.el-checkbox-button').exists()).toBe(true)
    expect(w.find('.el-checkbox-button__inner').text()).toBe('甲')
  })
})
