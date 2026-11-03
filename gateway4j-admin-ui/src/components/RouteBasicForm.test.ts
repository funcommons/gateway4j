import { describe, it, expect } from 'vitest'
import { createI18n } from 'vue-i18n'
import { mount } from '@vue/test-utils'
import { defineComponent } from 'vue'
import RouteBasicForm from '@/components/RouteBasicForm.vue'

// Provide minimal stubs for the SDK components and element-plus atoms.
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
  'el-form-item': defineComponent({ name: 'el-form-item', props: ['label', 'prop'], template: '<div class="el-form-item"><slot /></div>' }),
  'el-input': defineComponent({
    name: 'el-input',
    props: ['modelValue', 'type', 'rows', 'maxlength'],
    template: '<textarea v-if="type === \'textarea\'" :value="modelValue" :maxlength="maxlength" @input="$emit(\'update:modelValue\', $event.target.value)" /><input v-else :type="type || \'text\'" :value="modelValue" :maxlength="maxlength" @input="$emit(\'update:modelValue\', $event.target.value)" />'
  }),
  'ElInputNumber': defineComponent({
    name: 'ElInputNumber',
    props: ['modelValue', 'min', 'max'],
    emits: ['update:modelValue'],
    template: '<input type="number" :value="modelValue" @input="$emit(\'update:modelValue\', Number($event.target.value))" />'
  })
}

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

describe('RouteBasicForm', () => {
  it('renders all fields for a BACKEND route with provided values', () => {
    const wrapper = factory({
      modelValue: {
        ...BASE_FORM(),
        route_name: 'my-route',
        path: '/api/x',
        upstream_url: 'http://b:8080',
        sort_order: 5,
        remark: 'a note'
      }
    })
    expect(wrapper.find('input').element.value).toBe('my-route')
    const all = wrapper.findAll('input')
    // route_name, path, upstream_url, sort_order, tags → 5 inputs
    expect(all.length).toBe(5)
  })

  it('emits update:modelValue with merged change when route_name is edited', async () => {
    const wrapper = factory({ modelValue: BASE_FORM() })
    await wrapper.find('input').setValue('new-name')
    const emitted = wrapper.emitted('update:modelValue')
    expect(emitted).toBeTruthy()
    const last = emitted!.at(-1)![0] as Basic
    expect(last.route_name).toBe('new-name')
    expect(last.route_type).toBe('BACKEND') // untouched fields preserved
  })

  it('hides backend-only fields when route_type is DISPATCH', () => {
    const wrapper = factory({
      modelValue: { ...BASE_FORM(), route_type: 'DISPATCH' }
    })
    // only route_name + sort_order + tags visible (path/upstream hidden)
    expect(wrapper.findAll('input').length).toBe(3)
  })

  it('exposes backend fields when route_type is BACKEND', () => {
    const wrapper = factory({
      modelValue: { ...BASE_FORM(), route_type: 'BACKEND' }
    })
    expect(wrapper.findAll('input').length).toBe(5)
  })

  it('emits update:modelValue with route_type=DISPATCH when segmented switched', async () => {
    const wrapper = factory({
      modelValue: { ...BASE_FORM(), route_type: 'BACKEND' }
    })
    const buttons = wrapper.findAll('button')
    // buttons: BACKEND (index 0) + DISPATCH (index 1)
    expect(buttons.length).toBe(2)
    await buttons[1].trigger('click')
    const emitted = wrapper.emitted('update:modelValue')
    expect(emitted).toBeTruthy()
    expect((emitted!.at(-1)![0] as Basic).route_type).toBe('DISPATCH')
  })
})
