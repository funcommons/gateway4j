import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createI18n } from 'vue-i18n'
import { mount, flushPromises } from '@vue/test-utils'

const mocks = vi.hoisted(() => ({
  listPlugins: vi.fn(),
  enablePlugin: vi.fn(),
  disablePlugin: vi.fn(),
  deletePlugin: vi.fn()
}))

vi.mock('@/api/plugins', () => ({
  listPlugins: mocks.listPlugins,
  enablePlugin: mocks.enablePlugin,
  disablePlugin: mocks.disablePlugin,
  deletePlugin: mocks.deletePlugin
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
  mocks.listPlugins.mockReset().mockResolvedValue({ records: [], total: 0 })
  mocks.enablePlugin.mockReset().mockResolvedValue(undefined)
  mocks.disablePlugin.mockReset().mockResolvedValue(undefined)
  mocks.deletePlugin.mockReset().mockResolvedValue(undefined)
})

describe('plugins/List.vue — reload() error feedback', () => {
  it('starts with empty loadError', async () => {
    const wrapper = await factory()
    expect((wrapper.vm as any).loadError).toBe('')
    expect(wrapper.find('[data-testid="load-error"]').exists()).toBe(false)
  })

  it('listPlugins failure sets loadError with server message', async () => {
    mocks.listPlugins.mockRejectedValue(new Error('插件列表加载失败'))
    const wrapper = await factory()
    await flushPromises()
    expect((wrapper.vm as any).loadError).toBe('插件列表加载失败')
  })

  it('listPlugins failure renders error in UI', async () => {
    mocks.listPlugins.mockRejectedValue(new Error('网络异常'))
    const wrapper = await factory()
    await flushPromises()
    const el = wrapper.find('[data-testid="load-error"]')
    expect(el.exists()).toBe(true)
    expect(el.text()).toContain('网络异常')
  })

  it('successful load clears loadError', async () => {
    mocks.listPlugins.mockResolvedValue({ records: [], total: 0 })
    const wrapper = await factory()
    await flushPromises()
    expect((wrapper.vm as any).loadError).toBe('')
    expect(wrapper.find('[data-testid="load-error"]').exists()).toBe(false)
  })

  it('failure clears stale rows to [] (no misleading old data)', async () => {
    // First load succeeds with some rows
    mocks.listPlugins.mockResolvedValueOnce({
      records: [{ id: 'p1', plugin_name: 'old-plugin' }],
      total: 1
    })
    const wrapper = await factory()
    await flushPromises()
    expect((wrapper.vm as any).rows.length).toBe(1)

    // Next load fails — should reset rows and show error
    mocks.listPlugins.mockRejectedValue(new Error('500'))
    await (wrapper.vm as any).reload()
    await flushPromises()
    expect((wrapper.vm as any).rows).toEqual([])
    expect((wrapper.vm as any).loadError).toBe('500')
  })

  it('loading flag flips back to false even on failure', async () => {
    mocks.listPlugins.mockRejectedValue(new Error('fail'))
    const wrapper = await factory()
    await flushPromises()
    expect((wrapper.vm as any).loading).toBe(false)
  })

  it('subsequent successful reload clears previous error', async () => {
    mocks.listPlugins.mockRejectedValueOnce(new Error('first'))
    mocks.listPlugins.mockResolvedValueOnce({ records: [], total: 0 })
    const wrapper = await factory()
    await flushPromises()
    expect((wrapper.vm as any).loadError).toBe('first')
    await (wrapper.vm as any).reload()
    await flushPromises()
    expect((wrapper.vm as any).loadError).toBe('')
  })
})
