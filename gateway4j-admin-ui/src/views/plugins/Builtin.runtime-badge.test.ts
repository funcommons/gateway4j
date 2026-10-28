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
  default: { name: 'FcTag', props: ['color', 'size'], template: '<span class="tag-stub" :data-color="color"><slot /></span>' }
}))
vi.mock('@/components/overlay/FcTooltip.vue', () => ({
  default: {
    name: 'FcTooltip',
    props: ['content', 'placement'],
    template: '<span class="tooltip-stub" :data-content="content"><slot /></span>'
  }
}))
vi.mock('@/components/PluginDynamicForm.vue', () => ({
  default: {
    name: 'PluginDynamicForm',
    props: ['pluginId', 'modelValue'],
    emits: ['update:modelValue'],
    template: '<div class="pdf-stub" />'
  }
}))

import Builtin from '@/views/plugins/Builtin.vue'

const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  messages: {
    'zh-CN': {
      common: { cancel: '取消', save: '保存', enable: '启用', disable: '禁用', search: '搜索', empty: '暂无数据', enabled: '已启用', disabled: '已禁用' },
      plugin: {
        configForm: '插件配置',
        phasePre: '前置',
        phasePost: '后置',
        runtimeWired: '已接线',
        runtimeUnwired: '未接线',
        runtimeUnsupported: '暂不支持',
        runtimeUnwiredTip: '数据面暂未注册该插件实例，绑定后不会实际执行'
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

function badge(wrapper: ReturnType<typeof factory>) {
  return wrapper.find('[data-testid="runtime-badge"]')
}

beforeEach(() => {
  mocks.listBuiltinTypes.mockReset().mockResolvedValue([makeType()])
  mocks.updatePlugin.mockReset().mockResolvedValue({})
  mocks.enablePlugin.mockReset().mockResolvedValue({})
  mocks.disablePlugin.mockReset().mockResolvedValue({})
  mocks.validateConfig.mockReset().mockResolvedValue({ is_valid: true })
  mocks.getRuntimeStatus.mockReset().mockResolvedValue({ available: true, items: [] })
})

describe('Builtin.vue — 数据面接线徽标', () => {
  it('registered=true 显示「已接线」success 徽标', async () => {
    mocks.getRuntimeStatus.mockResolvedValue({
      available: true,
      items: [{ plugin_id: 'security', phase: 'PRE', registered: true, updated_at: 1719512345678 }]
    })
    const wrapper = factory()
    await flushPromises()
    expect((wrapper.vm as any).runtimeAvailable).toBe(true)
    expect(badge(wrapper).exists()).toBe(true)
    expect(badge(wrapper).text()).toContain('已接线')
    expect(badge(wrapper).attributes('data-color')).toBe('success')
    expect((wrapper.vm as any).runtimeBadge(makeType())).toBe('wired')
  })

  it('registered=false 显示「未接线」warning 徽标 + tooltip 提示不会实际执行', async () => {
    mocks.getRuntimeStatus.mockResolvedValue({
      available: true,
      items: [{ plugin_id: 'security', phase: 'PRE', registered: false, updated_at: 1719512345678 }]
    })
    const wrapper = factory()
    await flushPromises()
    expect(badge(wrapper).exists()).toBe(true)
    expect(badge(wrapper).text()).toContain('未接线')
    expect(badge(wrapper).attributes('data-color')).toBe('warning')
    const tooltip = wrapper.find('.tooltip-stub')
    expect(tooltip.exists()).toBe(true)
    expect(tooltip.attributes('data-content')).toContain('绑定后不会实际执行')
    expect((wrapper.vm as any).runtimeBadge(makeType())).toBe('unwired')
  })

  it('available=true 但 items 缺该插件 → 按未接线处理（数据面没有注册记录）', async () => {
    mocks.getRuntimeStatus.mockResolvedValue({
      available: true,
      items: [{ plugin_id: 'cache', phase: 'PRE', registered: true, updated_at: 1 }]
    })
    const wrapper = factory()
    await flushPromises()
    expect((wrapper.vm as any).runtimeAvailable).toBe(true)
    expect(badge(wrapper).text()).toContain('未接线')
  })

  it('接口不可用（available=false）→ 不显示徽标，静默降级', async () => {
    mocks.getRuntimeStatus.mockResolvedValue({ available: false, items: [] })
    const wrapper = factory()
    await flushPromises()
    expect(badge(wrapper).exists()).toBe(false)
    expect(wrapper.text()).not.toContain('已接线')
    expect(wrapper.text()).not.toContain('未接线')
    expect((wrapper.vm as any).runtimeBadge(makeType())).toBe('none')
  })

  it('接口异常（reject）同样静默降级，不影响插件列表加载', async () => {
    mocks.getRuntimeStatus.mockRejectedValue(new Error('redis down'))
    const wrapper = factory()
    await flushPromises()
    expect(badge(wrapper).exists()).toBe(false)
    expect((wrapper.vm as any).runtimeAvailable).toBe(false)
    expect((wrapper.vm as any).types.length).toBe(1)
  })

  it('JAR/GROOVY 类型固定显示「暂不支持」灰徽标，与接线状态无关', async () => {
    mocks.getRuntimeStatus.mockResolvedValue({
      available: true,
      items: [{ plugin_id: 'my-jar', phase: 'PRE', registered: true, updated_at: 1 }]
    })
    mocks.listBuiltinTypes.mockResolvedValue([
      makeType({ plugin_id: 'my-jar', plugin_type: 'JAR' }),
      makeType({ plugin_id: 'my-script', plugin_type: 'GROOVY' })
    ])
    const wrapper = factory()
    await flushPromises()
    expect((wrapper.vm as any).runtimeBadge({ plugin_id: 'my-jar', plugin_type: 'JAR' })).toBe('unsupported')
    expect((wrapper.vm as any).runtimeBadge({ plugin_id: 'my-script', plugin_type: 'GROOVY' })).toBe('unsupported')
    expect(wrapper.text()).toContain('暂不支持')
    const badges = wrapper.findAll('[data-testid="runtime-badge"]')
    expect(badges.length).toBe(2)
    for (const b of badges) {
      expect(b.attributes('data-color')).toBe('gray')
      expect(b.text()).toContain('暂不支持')
    }
  })

  it('挂载时与刷新（load）时都拉取 runtime-status', async () => {
    const wrapper = factory()
    await flushPromises()
    expect(mocks.getRuntimeStatus).toHaveBeenCalledTimes(1)
    await (wrapper.vm as any).load()
    await flushPromises()
    expect(mocks.getRuntimeStatus).toHaveBeenCalledTimes(2)
  })
})
