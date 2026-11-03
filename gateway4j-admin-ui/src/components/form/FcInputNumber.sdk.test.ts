import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { mountFc, emittedOf } from '../__tests__/helpers/mount'
import FcInputNumber from './FcInputNumber.vue'

const SOURCE = fs.readFileSync(path.resolve(__dirname, 'FcInputNumber.vue'), 'utf-8')

describe('FcInputNumber', () => {
  it('渲染 EP 数字输入框 + 原生 input', () => {
    const w = mountFc(FcInputNumber, { props: { modelValue: 3 } })
    expect(w.find('.el-input-number').exists()).toBe(true)
    expect(w.find('input.el-input__inner').exists()).toBe(true)
  })

  it('attrs 透传：data-testid 落在根节点', () => {
    const w = mountFc(FcInputNumber, {
      props: { modelValue: 1 },
      attrs: { 'data-testid': 'edge-priority' },
    })
    expect(w.find('[data-testid="edge-priority"]').exists()).toBe(true)
  })

  it('min / max / step 下发到原生 input', () => {
    const w = mountFc(FcInputNumber, { props: { modelValue: 5, min: 1, max: 999, step: 2 } })
    const input = w.find('input.el-input__inner')
    expect(input.attributes('min')).toBe('1')
    expect(input.attributes('max')).toBe('999')
    expect(input.attributes('step')).toBe('2')
  })

  it('输入 → emit update:modelValue + input', async () => {
    const w = mountFc(FcInputNumber, { props: { modelValue: 1 } })
    const input = w.find('input.el-input__inner')
    await input.setValue('7')
    expect(emittedOf(w, 'update:modelValue')[0]).toEqual([7])
    expect(emittedOf(w, 'input')[0]).toEqual([7])
  })

  it('disabled → 根节点 is-disabled + 原生 input 禁用', () => {
    const w = mountFc(FcInputNumber, { props: { modelValue: 1, disabled: true } })
    expect(w.find('.el-input-number.is-disabled').exists()).toBe(true)
    expect(w.find('input.el-input__inner').attributes('disabled')).toBeDefined()
  })

  it('step-strictly 时只允许 step 的整数倍', () => {
    const w = mountFc(FcInputNumber, { props: { modelValue: 10, min: 1, max: 100, step: 5, stepStrictly: true } })
    expect(w.find('input.el-input__inner').attributes('step')).toBe('5')
  })

  it('controls=false → 不渲染增减按钮', () => {
    const w = mountFc(FcInputNumber, { props: { modelValue: 1, controls: false } })
    expect(w.find('.el-input-number__increase').exists()).toBe(false)
    expect(w.find('.el-input-number__decrease').exists()).toBe(false)
  })

  it('placeholder 透传', () => {
    const w = mountFc(FcInputNumber, { props: { modelValue: 1, placeholder: '请输入数量' } })
    expect(w.find('input.el-input__inner').attributes('placeholder')).toBe('请输入数量')
  })

  it('L1 契约：valueOnClear 的类型收窄到 EP 的联合类型（null | number | "min" | "max"）', () => {
    // EP 的 valueOnClear 只收 null / number / 'min' / 'max'，
    // 薄封装若声明成宽的 `string | number | null`，游离字符串会触发 EP 的 prop 校验告警。
    expect(SOURCE).toMatch(/valueOnClear\?:\s*null\s*\|\s*number\s*\|\s*'min'\s*\|\s*'max'/)
    // 旧的宽类型（裸 string）不能再来
    expect(SOURCE).not.toMatch(/valueOnClear\?:\s*string\s*\|/)
  })

  it('L1 契约：valueOnClear 原样下发到 EP（min / max / 数字）', () => {
    const w = mountFc(FcInputNumber, { props: { modelValue: 1, valueOnClear: 'min' } })
    expect(w.findComponent({ name: 'ElInputNumber' }).props('valueOnClear')).toBe('min')

    const w2 = mountFc(FcInputNumber, { props: { modelValue: 1, valueOnClear: 0 } })
    expect(w2.findComponent({ name: 'ElInputNumber' }).props('valueOnClear')).toBe(0)

    const w3 = mountFc(FcInputNumber, { props: { modelValue: 1, valueOnClear: null } })
    expect(w3.findComponent({ name: 'ElInputNumber' }).props('valueOnClear')).toBeNull()
  })
})
