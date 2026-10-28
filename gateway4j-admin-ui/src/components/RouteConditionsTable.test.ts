import { describe, it, expect } from 'vitest'
import { createI18n } from 'vue-i18n'
import { mount } from '@vue/test-utils'
import { defineComponent } from 'vue'
import RouteConditionsTable, { type RouteCondition } from '@/components/RouteConditionsTable.vue'

const elementStubs = {
  'el-table-column': defineComponent({
    name: 'el-table-column',
    props: ['label', 'prop', 'width'],
    template: '<col class="col" :data-label="label" :data-prop="prop" :data-width="width" />'
  })
}

const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  messages: {
    'zh-CN': {
      common: { delete: '删除' },
      route: {
        addCondition: '添加分发条件', condTypeLabel: '类型', operatorLabel: '运算符',
        condKeyLabel: '键', condValueLabel: '值', targetRouteLabel: '目标路由',
        priorityLabel: '优先级', actionLabel: '操作',
        operatorEq: '等于', operatorNe: '不等于', operatorContains: '包含',
        operatorRegex: '正则', operatorExists: '存在', operatorGt: '大于', operatorLt: '小于'
      }
    }
  }
})

function factory(props: { modelValue: RouteCondition[]; routeOptions?: any[] }) {
  return mount(RouteConditionsTable, {
    props,
    global: { components: elementStubs, plugins: [i18n] }
  })
}

const BASE = (): RouteCondition => ({
  condition_type: 'HEADER',
  operator: 'EQ',
  condition_key: '',
  condition_value: '',
  target_route_id: '',
  target_route_name: '',
  priority: 0
})

function lastEmit<T>(wrapper: ReturnType<typeof mount>): T[] | undefined {
  const e = wrapper.emitted('update:modelValue')
  if (!e || e.length === 0) return undefined
  return e.at(-1)![0] as T[]
}

describe('RouteConditionsTable', () => {
  it('exposes initial conditions from modelValue', () => {
    const wrapper = factory({
      modelValue: [
        { ...BASE(), condition_key: 'X-Token' },
        { ...BASE(), condition_key: 'X-User' }
      ]
    })
    const vm = wrapper.vm as any
    expect(vm.local.length).toBe(2)
    expect(vm.local[0].condition_key).toBe('X-Token')
  })

  it('emits update:modelValue with a new row when onAdd is invoked', async () => {
    const wrapper = factory({ modelValue: [] })
    const vm = wrapper.vm as any
    vm.onAdd()
    await wrapper.vm.$nextTick()
    const emitted = lastEmit<RouteCondition[]>(wrapper)
    expect(emitted).toBeTruthy()
    expect(emitted!.length).toBe(1)
    expect(emitted![0].condition_type).toBe('HEADER')
    expect(emitted![0].operator).toBe('EQ')
  })

  it('renders the 添加分发条件 button label in the toolbar', () => {
    const wrapper = factory({ modelValue: [] })
    expect(wrapper.html()).toContain('添加分发条件')
  })

  it('emits update:modelValue with a row removed when onDelete is called', async () => {
    const wrapper = factory({
      modelValue: [
        { ...BASE(), condition_key: 'k1' },
        { ...BASE(), condition_key: 'k2' }
      ]
    })
    const vm = wrapper.vm as any
    vm.onDelete(0)
    await wrapper.vm.$nextTick()
    const emitted = lastEmit<RouteCondition[]>(wrapper)
    expect(emitted).toBeTruthy()
    expect(emitted!.length).toBe(1)
    expect(emitted![0].condition_key).toBe('k2')
  })

  it('emits cloned rows (not references) so parent mutations are isolated', async () => {
    const source = { ...BASE(), condition_key: 'orig' }
    const wrapper = factory({ modelValue: [source] })
    const vm = wrapper.vm as any
    vm.local[0].condition_key = 'mutated'
    await wrapper.vm.$nextTick()
    const emitted = lastEmit<RouteCondition[]>(wrapper)!
    expect(emitted[0].condition_key).toBe('mutated')
    expect(source.condition_key).toBe('orig')
  })

  it('returns a router-accessible structure with target_route_name preserved', () => {
    const wrapper = factory({
      modelValue: [{ ...BASE(), target_route_name: 'route-A', target_route_id: 'id-1' }]
    })
    const vm = wrapper.vm as any
    expect(vm.local[0].target_route_name).toBe('route-A')
    expect(vm.local[0].target_route_id).toBe('id-1')
  })

  it('updates target_route_name from routeOptions selection', async () => {
    const wrapper = factory({
      modelValue: [{ ...BASE() }],
      routeOptions: [
        { value: 'r1', label: 'route-one' },
        { value: 'r2', label: 'route-two' }
      ]
    })
    const vm = wrapper.vm as any
    vm.updateTargetRoute(vm.local[0], 'r2')
    await wrapper.vm.$nextTick()
    expect(vm.local[0].target_route_id).toBe('r2')
    expect(vm.local[0].target_route_name).toBe('route-two')
  })
})
