import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createI18n } from 'vue-i18n'
import { mount, flushPromises } from '@vue/test-utils'

vi.mock('@/components/data/FcTable.vue', () => ({
  default: { name: 'FcTable', props: ['data', 'loading', 'stripe'], template: '<table class="table-stub"><slot /></table>' }
}))
vi.mock('@/components/display/FcTag.vue', () => ({
  default: { name: 'FcTag', props: ['color', 'size'], template: '<span class="tag-stub"><slot /></span>' }
}))
vi.mock('@/components/overlay/FcTooltip.vue', () => ({
  default: { name: 'FcTooltip', props: ['content', 'placement'], template: '<span class="tooltip-stub"><slot /></span>' }
}))

import RouteConditionsTable from '@/components/RouteConditionsTable.vue'
import { parseWeight, WEIGHT_MIN, WEIGHT_MAX } from '@/utils/weight'

// 让 el-table-column 的作用域插槽以注入行渲染（单行场景），验证行级 DOM 呈现
let ctxRow: any = null
const colStub = {
  name: 'ElTableColumn',
  props: ['label', 'prop', 'width'],
  setup(_: unknown, { slots }: { slots: any }) {
    return () => (ctxRow ? slots.default?.({ row: ctxRow, $index: 0 }) : null)
  }
}

const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  messages: {
    'zh-CN': {
      route: {
        addCondition: '添加条件', condTypeLabel: '类型', operatorLabel: '运算符',
        condKeyLabel: '键', condValueLabel: '值', targetRouteLabel: '目标路由',
        priorityLabel: '优先级', actionLabel: '操作',
        condTypeHeader: 'Header', condTypePath: 'Path', condTypeQuery: 'Query',
        condTypeBody: 'Body', condTypeGroovy: 'Groovy', condTypeWeight: '权重',
        condWeightTip: '同优先级候选按权重比例分流（权重 1~100，非请求谓词）',
        condWeightTag: '权重 {n}',
        condWeightRequired: '请填写权重（1~100 的整数）',
        condWeightRange: '权重范围 {min}~{max} 的整数',
        operatorEq: '等于'
      },
      common: { delete: '删除' }
    }
  }
})

function factory(modelValue: any[] = []) {
  ctxRow = modelValue[0] ?? null
  return mount(RouteConditionsTable, {
    props: { modelValue, routeOptions: [] },
    global: {
      plugins: [i18n],
      stubs: { 'el-table-column': colStub, 'ElInputNumber': true }
    }
  })
}

function rowOf(wrapper: ReturnType<typeof mount>, i = 0) {
  return (wrapper.vm as any).local[i]
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('RouteConditionsTable — P2-4 WEIGHT 权重条件（T3）', () => {
  it('导出权重区间常量与 parseWeight（数字串 1~100 → number）', () => {
    expect(WEIGHT_MIN).toBe(1)
    expect(WEIGHT_MAX).toBe(100)
    expect(parseWeight('20')).toBe(20)
    expect(parseWeight('100')).toBe(100)
    expect(parseWeight('1')).toBe(1)
    expect(parseWeight('0')).toBeNull()
    expect(parseWeight('101')).toBeNull()
    expect(parseWeight('abc')).toBeNull()
    expect(parseWeight('')).toBeNull()
    expect(parseWeight('12.5')).toBeNull()
    expect(parseWeight(undefined)).toBeNull()
  })

  it('类型下拉含 WEIGHT 选项', () => {
    const wrapper = factory()
    const vm = wrapper.vm as any
    const values = vm.typeOptions.map((o: any) => o.value)
    expect(values).toContain('WEIGHT')
    const weight = vm.typeOptions.find((o: any) => o.value === 'WEIGHT')
    expect(weight.label).toBe('权重')
  })

  it('切到 WEIGHT：value 清空、operator 固定 EQ、既有数字 key 保留', async () => {
    const wrapper = factory([{ condition_type: 'HEADER', operator: 'EQ', condition_key: '30', condition_value: 'x', target_route_id: 'r1', target_route_name: 'R1', priority: 1 }])
    const vm = wrapper.vm as any
    vm.onTypeChange(rowOf(wrapper), 'WEIGHT')
    await flushPromises()
    const row = rowOf(wrapper)
    expect(row.condition_type).toBe('WEIGHT')
    expect(row.condition_key).toBe('30')
    expect(row.condition_value).toBe('')
    expect(row.operator).toBe('EQ')
    // v-model 桥接：变更同步 emit
    expect(wrapper.emitted('update:modelValue')?.length).toBeGreaterThan(0)
  })

  it('切到 WEIGHT：非法 key 置空待填', async () => {
    const wrapper = factory([{ condition_type: 'PATH', operator: 'EQ', condition_key: '/api', condition_value: '', target_route_id: '', target_route_name: '', priority: 1 }])
    const vm = wrapper.vm as any
    vm.onTypeChange(rowOf(wrapper), 'WEIGHT')
    await flushPromises()
    expect(rowOf(wrapper).condition_key).toBe('')
  })

  it('updateWeight 夹取 1~100 并写回数字字符串', async () => {
    const wrapper = factory([{ condition_type: 'WEIGHT', operator: 'EQ', condition_key: '', condition_value: '', target_route_id: 'r1', target_route_name: '', priority: 1 }])
    const vm = wrapper.vm as any
    vm.updateWeight(rowOf(wrapper), 50)
    expect(rowOf(wrapper).condition_key).toBe('50')
    vm.updateWeight(rowOf(wrapper), 0)
    expect(rowOf(wrapper).condition_key).toBe('1')
    vm.updateWeight(rowOf(wrapper), 250)
    expect(rowOf(wrapper).condition_key).toBe('100')
    vm.updateWeight(rowOf(wrapper), 7.6)
    expect(rowOf(wrapper).condition_key).toBe('8')
    vm.updateWeight(rowOf(wrapper), undefined)
    expect(rowOf(wrapper).condition_key).toBe('')
  })

  it('weightError 三态：空→必填 / 非法或越界→范围提示 / 合法→空串', async () => {
    const wrapper = factory([{ condition_type: 'WEIGHT', operator: 'EQ', condition_key: '', condition_value: '', target_route_id: '', target_route_name: '', priority: 1 }])
    const vm = wrapper.vm as any
    const row = rowOf(wrapper)
    expect(vm.weightError(row)).toBe('请填写权重（1~100 的整数）')
    row.condition_key = 'abc'
    expect(vm.weightError(row)).toBe('权重范围 1~100 的整数')
    row.condition_key = '150'
    expect(vm.weightError(row)).toBe('权重范围 1~100 的整数')
    row.condition_key = '66'
    expect(vm.weightError(row)).toBe('')
  })

  it('WEIGHT 行渲染：数字输入 + 权重标签 + 运算符/值禁用占位 + 说明 tooltip', async () => {
    const wrapper = factory([{ condition_type: 'WEIGHT', operator: 'EQ', condition_key: '80', condition_value: '', target_route_id: 'r1', target_route_name: 'R1', priority: 1 }])
    await flushPromises()
    expect(wrapper.find('[data-testid="cond-weight-input"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="weight-value-tag"]').text()).toContain('80')
    expect(wrapper.find('[data-testid="cond-operator-disabled"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="cond-value-disabled"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="cond-weight-tip"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="weight-error"]').exists()).toBe(false)
  })

  it('WEIGHT 行权重缺失 → 渲染必填错误提示', async () => {
    const wrapper = factory([{ condition_type: 'WEIGHT', operator: 'EQ', condition_key: '', condition_value: '', target_route_id: '', target_route_name: '', priority: 1 }])
    await flushPromises()
    expect(wrapper.find('[data-testid="weight-error"]').exists()).toBe(true)
  })

  it('非 WEIGHT 行不受影响：普通 key/value 输入、无权重控件', async () => {
    const wrapper = factory([{ condition_type: 'HEADER', operator: 'EQ', condition_key: 'X-Token', condition_value: 'abc', target_route_id: '', target_route_name: '', priority: 1 }])
    await flushPromises()
    expect(wrapper.find('[data-testid="cond-weight-input"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="cond-value-disabled"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="cond-weight-tip"]').exists()).toBe(false)
  })
})
