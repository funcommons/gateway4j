import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createI18n } from 'vue-i18n'
import { mount, flushPromises } from '@vue/test-utils'

const mocks = vi.hoisted(() => ({
  listBuiltinTypes: vi.fn(),
  updatePlugin: vi.fn(),
  enablePlugin: vi.fn(),
  disablePlugin: vi.fn(),
  validateConfig: vi.fn(),
  getRuntimeStatus: vi.fn()
}))

vi.mock('@/api/plugins', () => ({
  listBuiltinTypes: mocks.listBuiltinTypes,
  updatePlugin: mocks.updatePlugin,
  enablePlugin: mocks.enablePlugin,
  disablePlugin: mocks.disablePlugin,
  validateConfig: mocks.validateConfig,
  getRuntimeStatus: mocks.getRuntimeStatus
}))

vi.mock('@/composables/usePermission', () => ({
  usePermission: () => ({ hasPermission: () => true, hasAnyPermission: () => true, canEdit: () => true })
}))

vi.mock('@/components/display/FcEmpty.vue', () => ({
  default: { name: 'FcEmpty', props: ['title'], template: '<div class="empty-stub" />' }
}))
vi.mock('@/components/display/FcTag.vue', () => ({
  default: { name: 'FcTag', props: ['color', 'size'], template: '<span class="tag-stub"><slot /></span>' }
}))
vi.mock('@/components/overlay/FcTooltip.vue', () => ({
  default: {
    name: 'FcTooltip',
    props: ['content', 'placement'],
    template: '<span class="tooltip-stub" :data-content="content"><slot /></span>'
  }
}))
vi.mock('@/components/PluginDynamicForm.vue', () => ({
  default: { name: 'PluginDynamicForm', props: ['pluginId', 'modelValue'], emits: ['update:modelValue'], template: '<div class="pdf-stub" />' }
}))

import Builtin from '@/views/plugins/Builtin.vue'

const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  messages: {
    'zh-CN': {
      common: { cancel: '取消', save: '保存', enable: '启用', disable: '禁用', search: '搜索', empty: '暂无数据', enabled: '已启用', disabled: '已禁用' },
      plugin: {
        configForm: '插件配置', phasePre: '前置', phasePost: '后置',
        runtimeWired: '已接线', runtimeUnwired: '未接线', runtimeUnsupported: '暂不支持',
        runtimeUnwiredTip: '数据面暂未注册该插件实例，绑定后不会实际执行',
        statsSinceLoad: '自装载以来：执行 {executed} / 跳过 {skipped} / 异常 {error}'
      }
    }
  }
})

function makeType(over: Partial<any> = {}) {
  return {
    plugin_id: 'security', plugin_name: '安全', plugin_phase: 'PRE',
    description: '安全插件', config_schema: {}, ...over
  }
}

function factory() {
  return mount(Builtin, { global: { plugins: [i18n] } })
}

beforeEach(() => {
  mocks.listBuiltinTypes.mockReset().mockResolvedValue([makeType()])
  mocks.updatePlugin.mockReset().mockResolvedValue({})
  mocks.enablePlugin.mockReset().mockResolvedValue({})
  mocks.disablePlugin.mockReset().mockResolvedValue({})
  mocks.validateConfig.mockReset().mockResolvedValue({ is_valid: true })
  mocks.getRuntimeStatus.mockReset().mockResolvedValue({ available: true, items: [] })
})

describe('Builtin.vue — P1-2 插件执行统计展示（stats 缺省兼容）', () => {
  it('stats 存在 → 展示「执行 N / 跳过 N / 异常 N」（自装载以来）', async () => {
    mocks.getRuntimeStatus.mockResolvedValue({
      available: true,
      items: [{ plugin_id: 'security', phase: 'PRE', registered: true, updated_at: 1, stats: { executed: 12, skipped: 3, error: 1 } }]
    })
    const wrapper = factory()
    await flushPromises()
    const stats = wrapper.find('[data-testid="plugin-stats"]')
    expect(stats.exists()).toBe(true)
    expect(stats.text()).toContain('执行 12 / 跳过 3 / 异常 1')
    const tooltip = wrapper.find('.tooltip-stub')
    expect(tooltip.exists()).toBe(true)
    expect(tooltip.attributes('data-content')).toContain('自装载以来：执行 12 / 跳过 3 / 异常 1')
  })

  it('stats 缺省（旧版引擎未上报）→ 不展示，兼容不报错', async () => {
    mocks.getRuntimeStatus.mockResolvedValue({
      available: true,
      items: [{ plugin_id: 'security', phase: 'PRE', registered: true, updated_at: 1 }]
    })
    const wrapper = factory()
    await flushPromises()
    expect(wrapper.find('[data-testid="plugin-stats"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('自装载以来')
  })

  it('available=false（状态未知）→ 不展示统计', async () => {
    mocks.getRuntimeStatus.mockResolvedValue({ available: false, items: [] })
    const wrapper = factory()
    await flushPromises()
    expect(wrapper.find('[data-testid="plugin-stats"]').exists()).toBe(false)
  })

  it('Long→String 契约下计数以字符串到达 → Number 化后正常展示', async () => {
    mocks.getRuntimeStatus.mockResolvedValue({
      available: true,
      items: [{ plugin_id: 'security', phase: 'PRE', registered: true, updated_at: 1, stats: { executed: '120', skipped: '7', error: '0' } as any }]
    })
    const wrapper = factory()
    await flushPromises()
    expect(wrapper.find('[data-testid="plugin-stats"]').text()).toContain('执行 120 / 跳过 7 / 异常 0')
  })

  it('stats 全为非法值 → 视为未上报，不展示', async () => {
    mocks.getRuntimeStatus.mockResolvedValue({
      available: true,
      items: [{ plugin_id: 'security', phase: 'PRE', registered: true, updated_at: 1, stats: { executed: NaN, skipped: undefined as any, error: null as any } }]
    })
    const wrapper = factory()
    await flushPromises()
    expect(wrapper.find('[data-testid="plugin-stats"]').exists()).toBe(false)
  })
})
