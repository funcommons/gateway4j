import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createI18n } from 'vue-i18n'
import { mount, flushPromises } from '@vue/test-utils'

const mocks = vi.hoisted(() => ({
  listPlugins: vi.fn(),
  enablePlugin: vi.fn(),
  disablePlugin: vi.fn(),
  deletePlugin: vi.fn(),
  fcConfirm: vi.fn().mockResolvedValue(true)
}))

vi.mock('@/api/plugins', () => ({
  listPlugins: mocks.listPlugins,
  enablePlugin: mocks.enablePlugin,
  disablePlugin: mocks.disablePlugin,
  deletePlugin: mocks.deletePlugin
}))

vi.mock('@/composables/useFcConfirm', () => ({
  useFcConfirm: () => ({ confirm: mocks.fcConfirm })
}))

vi.mock('@/composables/usePermission', () => ({
  usePermission: () => ({ hasPermission: () => true, hasAnyPermission: () => true, canEdit: () => true })
}))

vi.mock('@/components/display/FcEmpty.vue', () => ({
  default: { name: 'FcEmpty', props: ['title'], template: '<div class="empty-stub" />' }
}))
vi.mock('@/components/data/FcTable.vue', () => ({
  default: { name: 'FcTable', props: ['data', 'loading', 'stripe'], template: '<table class="table-stub" />' }
}))

import List from '@/views/plugins/List.vue'

const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  messages: {
    'zh-CN': {
      common: { enable: '启用', disable: '禁用', delete: '删除', more: '更多' },
      plugin: { name: '插件名', id: '插件标识', type: '类型', phase: '阶段', scope: '作用域', status: '状态' }
    }
  }
})

async function factory() {
  const wrapper = mount(List, { global: { plugins: [i18n] } })
  await flushPromises()
  return wrapper
}

beforeEach(() => {
  mocks.fcConfirm.mockReset().mockResolvedValue(true)
  mocks.listPlugins.mockReset().mockResolvedValue({ records: [], total: 0 })
  mocks.enablePlugin.mockReset().mockResolvedValue(undefined)
  mocks.disablePlugin.mockReset().mockResolvedValue(undefined)
  mocks.deletePlugin.mockReset().mockResolvedValue(undefined)
})

describe('plugins/List.vue — enable() error UX', () => {
  it('starts with empty actionError', async () => {
    const wrapper = await factory()
    expect((wrapper.vm as any).actionError).toBe('')
    expect(wrapper.find('[data-testid="action-error"]').exists()).toBe(false)
  })

  it('enablePlugin failure sets actionError with server message', async () => {
    mocks.enablePlugin.mockRejectedValue(new Error('插件有未完成绑定'))
    const wrapper = await factory()
    const vm = wrapper.vm as any
    await vm.enable({ id: 'p1' })
    expect(vm.actionError).toBe('插件有未完成绑定')
  })

  it('enablePlugin failure renders error in UI', async () => {
    mocks.enablePlugin.mockRejectedValue(new Error('插件有未完成绑定'))
    const wrapper = await factory()
    const vm = wrapper.vm as any
    await vm.enable({ id: 'p1' })
    await flushPromises()
    const el = wrapper.find('[data-testid="action-error"]')
    expect(el.exists()).toBe(true)
    expect(el.text()).toBe('插件有未完成绑定')
  })

  it('enable success leaves actionError empty', async () => {
    mocks.enablePlugin.mockResolvedValue(undefined)
    const wrapper = await factory()
    const vm = wrapper.vm as any
    await vm.enable({ id: 'p1' })
    await flushPromises()
    expect(vm.actionError).toBe('')
  })

  it('enable failure does not throw (no unhandled rejection)', async () => {
    mocks.enablePlugin.mockRejectedValue(new Error('500'))
    const wrapper = await factory()
    const vm = wrapper.vm as any
    let threw = false
    try {
      await vm.enable({ id: 'p1' })
    } catch {
      threw = true
    }
    expect(threw).toBe(false)
  })
})

describe('plugins/List.vue — disable() error UX', () => {
  it('disablePlugin failure sets actionError', async () => {
    mocks.disablePlugin.mockRejectedValue(new Error('插件正在被路由使用'))
    const wrapper = await factory()
    const vm = wrapper.vm as any
    await vm.disable({ id: 'p1' })
    expect(vm.actionError).toBe('插件正在被路由使用')
  })

  it('disablePlugin failure renders error in UI', async () => {
    mocks.disablePlugin.mockRejectedValue(new Error('插件正在被路由使用'))
    const wrapper = await factory()
    const vm = wrapper.vm as any
    await vm.disable({ id: 'p1' })
    await flushPromises()
    const el = wrapper.find('[data-testid="action-error"]')
    expect(el.exists()).toBe(true)
    expect(el.text()).toBe('插件正在被路由使用')
  })

  it('disable success leaves actionError empty', async () => {
    mocks.disablePlugin.mockResolvedValue(undefined)
    const wrapper = await factory()
    const vm = wrapper.vm as any
    await vm.disable({ id: 'p1' })
    await flushPromises()
    expect(vm.actionError).toBe('')
  })
})

describe('plugins/List.vue — del() error UX', () => {
  it('deletePlugin failure sets actionError', async () => {
    mocks.deletePlugin.mockRejectedValue(new Error('插件有依赖关系'))
    const wrapper = await factory()
    const vm = wrapper.vm as any
    await vm.del({ id: 'p1' })
    expect(vm.actionError).toBe('插件有依赖关系')
  })

  it('deletePlugin failure renders error in UI', async () => {
    mocks.deletePlugin.mockRejectedValue(new Error('插件有依赖关系'))
    const wrapper = await factory()
    const vm = wrapper.vm as any
    await vm.del({ id: 'p1' })
    await flushPromises()
    const el = wrapper.find('[data-testid="action-error"]')
    expect(el.exists()).toBe(true)
    expect(el.text()).toBe('插件有依赖关系')
  })

  it('delete success leaves actionError empty', async () => {
    mocks.deletePlugin.mockResolvedValue(undefined)
    const wrapper = await factory()
    const vm = wrapper.vm as any
    await vm.del({ id: 'p1' })
    await flushPromises()
    expect(vm.actionError).toBe('')
  })
})

describe('plugins/List.vue — actionError lifecycle', () => {
  it('actionError is cleared before each new action', async () => {
    mocks.enablePlugin.mockRejectedValueOnce(new Error('first'))
    mocks.enablePlugin.mockResolvedValueOnce(undefined)
    const wrapper = await factory()
    const vm = wrapper.vm as any
    const r = { id: 'p1' }
    await vm.enable(r)
    expect(vm.actionError).toBe('first')
    await vm.enable(r)
    await flushPromises()
    expect(vm.actionError).toBe('')
  })

  it('actionError survives across different action types', async () => {
    mocks.enablePlugin.mockRejectedValueOnce(new Error('enable fail'))
    mocks.deletePlugin.mockRejectedValueOnce(new Error('delete fail'))
    const wrapper = await factory()
    const vm = wrapper.vm as any
    await vm.enable({ id: 'p1' })
    expect(vm.actionError).toBe('enable fail')
    await vm.del({ id: 'p1' })
    expect(vm.actionError).toBe('delete fail')
  })
})
