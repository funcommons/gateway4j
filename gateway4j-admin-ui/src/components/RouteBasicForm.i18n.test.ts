import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createI18n } from 'vue-i18n'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent } from 'vue'

const stubs: Record<string, any> = {
  FcInput: defineComponent({
    name: 'FcInput',
    props: ['modelValue', 'type', 'maxlength', 'placeholder'],
    emits: ['update:modelValue'],
    template: '<input :type="type || \'text\'" :value="modelValue" :maxlength="maxlength" @input="$emit(\'update:modelValue\', $event.target.value)" />'
  }),
  FcSegmented: defineComponent({
    name: 'FcSegmented',
    props: ['modelValue', 'options'],
    emits: ['update:modelValue'],
    template: '<div class="seg"><button v-for="o in options" :key="o.value" @click="$emit(\'update:modelValue\', o.value)">{{ o.label }}</button></div>'
  }),
  'el-form': defineComponent({ name: 'el-form', props: ['model', 'rules'], template: '<div class="el-form"><slot /></div>' }),
  'el-form-item': defineComponent({ name: 'el-form-item', props: ['label', 'prop'], template: '<div class="el-form-item"><span class="label">{{ label }}</span><slot /></div>' }),
  'el-input': defineComponent({
    name: 'el-input',
    props: ['modelValue', 'type', 'rows', 'maxlength'],
    template: '<textarea v-if="type === \'textarea\'" :value="modelValue" :maxlength="maxlength" @input="$emit(\'update:modelValue\', $event.target.value)" /><input v-else :type="type || \'text\'" :value="modelValue" :maxlength="maxlength" @input="$emit(\'update:modelValue\', $event.target.value)" />'
  })
}

import RouteBasicForm from '@/components/RouteBasicForm.vue'

const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  messages: {
    'zh-CN': {
      route: {
        name: '路由名称', type: '路由类型', path: '匹配路径', upstream: '后端地址',
        sort: '排序', remark: '描述', typeBackend: '后置路由', typeDispatch: '分发路由',
        nameRequired: '请输入路由名称', namePattern: '路由名称需 2-50 位字母数字下划线',
        pathRequired: '请输入匹配路径', pathPattern: '请输入合法路径',
        upstreamRequired: '请输入后端地址', upstreamPattern: '请输入合法后端地址',
        remarkMaxLength: '描述不超过 200 字'
      }
    }
  }
})

interface Basic {
  route_name: string
  route_type: 'BACKEND' | 'DISPATCH'
  path: string
  upstream_url: string
  sort_order: number
  remark: string
}
const BASE_FORM = (): Basic => ({
  route_name: '',
  route_type: 'BACKEND',
  path: '',
  upstream_url: '',
  sort_order: 0,
  remark: ''
})

function factory(props: { modelValue: Basic }) {
  return mount(RouteBasicForm, {
    props,
    global: { components: stubs, plugins: [i18n] }
  })
}

describe('RouteBasicForm — i18n', () => {
  it('uses i18n for form labels', async () => {
    const wrapper = factory({ modelValue: BASE_FORM() })
    await flushPromises()
    const labels = wrapper.findAll('.el-form-item').map(el => el.text())
    expect(labels.some(l => l.includes('路由名称'))).toBe(true)
    expect(labels.some(l => l.includes('路由类型'))).toBe(true)
  })

  it('uses i18n for type options', async () => {
    const wrapper = factory({ modelValue: BASE_FORM() })
    await flushPromises()
    const vm = wrapper.vm as any
    const labels = vm.typeOptions.map((o: any) => o.label)
    expect(labels).toContain('后置路由')
    expect(labels).toContain('分发路由')
  })
})

describe('RouteBasicForm — validation rules', () => {
  it('exposes validation rules with i18n messages', async () => {
    const wrapper = factory({ modelValue: BASE_FORM() })
    await flushPromises()
    const vm = wrapper.vm as any
    const rules = vm.formRules
    expect(rules.route_name).toBeDefined()
    expect(rules.route_name.length).toBeGreaterThanOrEqual(2)
    const requiredRule = rules.route_name.find((r: any) => r.required)
    expect(requiredRule).toBeDefined()
    const patternRule = rules.route_name.find((r: any) => r.pattern)
    expect(patternRule).toBeDefined()
  })

  it('route_name pattern rejects single character', async () => {
    const wrapper = factory({ modelValue: BASE_FORM() })
    await flushPromises()
    const vm = wrapper.vm as any
    const patternRule = vm.formRules.route_name.find((r: any) => r.pattern)
    const re = new RegExp(patternRule.pattern)
    expect(re.test('a')).toBe(false)
  })

  it('route_name pattern accepts valid name', async () => {
    const wrapper = factory({ modelValue: BASE_FORM() })
    await flushPromises()
    const vm = wrapper.vm as any
    const patternRule = vm.formRules.route_name.find((r: any) => r.pattern)
    const re = new RegExp(patternRule.pattern)
    expect(re.test('my_route_1')).toBe(true)
  })

  it('route_name pattern rejects special characters', async () => {
    const wrapper = factory({ modelValue: BASE_FORM() })
    await flushPromises()
    const vm = wrapper.vm as any
    const patternRule = vm.formRules.route_name.find((r: any) => r.pattern)
    const re = new RegExp(patternRule.pattern)
    expect(re.test('my-route')).toBe(false)
  })

  it('path validation requires / prefix for BACKEND', async () => {
    const wrapper = factory({ modelValue: { ...BASE_FORM(), route_type: 'BACKEND' } })
    await flushPromises()
    const vm = wrapper.vm as any
    const rules = vm.formRules
    expect(rules.path).toBeDefined()
    const patternRule = rules.path.find((r: any) => r.pattern)
    expect(patternRule).toBeDefined()
    const re = new RegExp(patternRule.pattern)
    expect(re.test('/api/test')).toBe(true)
    expect(re.test('api/test')).toBe(false)
  })

  it('upstream_url validation requires HTTP(S)', async () => {
    const wrapper = factory({ modelValue: { ...BASE_FORM(), route_type: 'BACKEND' } })
    await flushPromises()
    const vm = wrapper.vm as any
    const rules = vm.formRules
    expect(rules.upstream_url).toBeDefined()
    const patternRule = rules.upstream_url.find((r: any) => r.pattern)
    expect(patternRule).toBeDefined()
    const re = new RegExp(patternRule.pattern)
    expect(re.test('http://backend:8080')).toBe(true)
    expect(re.test('https://api.example.com')).toBe(true)
    expect(re.test('ftp://bad')).toBe(false)
  })
})
