import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createI18n } from 'vue-i18n'
import { mount, flushPromises } from '@vue/test-utils'

const mocks = vi.hoisted(() => ({
  getDict: vi.fn(),
  getConfig: vi.fn(),
  saveConfig: vi.fn(),
  listChanges: vi.fn()
}))

vi.mock('@/api/misc', () => ({
  getDict: mocks.getDict,
  getConfig: mocks.getConfig,
  saveConfig: mocks.saveConfig,
  listChanges: mocks.listChanges
}))

vi.mock('@/composables/usePermission', () => ({
  usePermission: () => ({ hasPermission: () => true, hasAnyPermission: () => true, canEdit: () => true })
}))

vi.mock('@/components/display/FcEmpty.vue', () => ({
  default: { name: 'FcEmpty', props: ['title', 'type', 'spanFull'], template: '<div class="empty-stub">{{ title }}</div>' }
}))
vi.mock('@/components/data/FcTable.vue', () => ({
  default: { name: 'FcTable', props: ['data', 'loading', 'stripe'], template: '<table class="table-stub" />' }
}))
vi.mock('@/components/display/FcTag.vue', () => ({
  default: { name: 'FcTag', props: ['color', 'size'], template: '<span class="tag-stub"><slot /></span>' }
}))
vi.mock('@/components/data/FcStatusBadge.vue', () => ({
  default: { name: 'FcStatusBadge', props: ['tone', 'label', 'dot'], template: '<span class="badge-stub">{{ label }}</span>' }
}))

import Settings from '@/views/Settings.vue'

const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  messages: {
    'zh-CN': {
      common: { save: '保存', refresh: '刷新', loadFailed: '加载失败', enabled: '已启用', disabled: '已禁用' },
      route: {
        statusDraft: '草稿', statusPublished: '已发布',
        statusChanging: '变更中', statusOffline: '已下线', status: '状态'
      },
      settings: {
        general: '通用设置', security: '安全设置', dict: '字典查询', theme: '主题',
        tabGeneral: '通用设置', tabSecurity: '安全设置', tabDict: '字典查询', tabTheme: '主题',
        tabChanges: '变更记录',
        changeTime: '时间', changeType: '类型', changeName: '名称', changeVersion: '版本',
        changeTypeRoute: '路由', changeTypePlugin: '插件',
        changesUnavailable: '变更记录接口暂不可用', changesEmpty: '暂无变更记录'
      }
    }
  }
})

const CHANGES = [
  { type: 'route', id: 'r1', name: 'web-gateway', status: 'PUBLISHED', config_version: 'v7', updated_at: 1730000000000 },
  { type: 'plugin', id: 'p1', name: 'JWT Auth', status: 'DISABLED', config_version: 'v2', updated_at: 1730000000001 }
]

function factory() {
  return mount(Settings, { global: { plugins: [i18n] } })
}

async function gotoChangesTab(wrapper: ReturnType<typeof mount>) {
  ;(wrapper.vm as any).tab = 'changes'
  await flushPromises()
}

beforeEach(() => {
  mocks.getDict.mockReset().mockResolvedValue([])
  mocks.getConfig.mockReset().mockResolvedValue({})
  mocks.saveConfig.mockReset().mockResolvedValue({})
  mocks.listChanges.mockReset().mockResolvedValue(CHANGES)
})

describe('Settings.vue — 变更记录 Tab (T3)', () => {
  it('fetches GET /v1/changes?limit=50 on mount with 50 as default limit', async () => {
    const wrapper = factory()
    await flushPromises()
    expect(mocks.listChanges).toHaveBeenCalledWith(50)
    expect((wrapper.vm as any).changesUnavailable).toBe(false)
  })

  it('renders grouped table rows (time/type/name/status/version) on the changes tab', async () => {
    const wrapper = factory()
    await flushPromises()
    await gotoChangesTab(wrapper)
    const table = wrapper.findComponent({ name: 'FcTable' })
    expect(table.exists()).toBe(true)
    const rows = table.props('data') as any[]
    expect(rows.length).toBe(2)
    expect(rows[0]).toMatchObject({ type: 'route', name: 'web-gateway', config_version: 'v7' })
    expect(rows[1]).toMatchObject({ type: 'plugin', name: 'JWT Auth' })
    const vm = wrapper.vm as any
    // 类型文案：路由 | 插件
    expect(vm.changeStatusLabel('PUBLISHED')).toBe('已发布')
    expect(vm.changeStatusLabel('DISABLED')).toBe('已禁用')
    expect(vm.changeStatusLabel('UNKNOWN_X')).toBe('UNKNOWN_X')
    // 状态 tone 映射：published/enabled=success、changing=processing、draft=pending、其余 neutral
    expect(vm.changeStatusTone('PUBLISHED')).toBe('success')
    expect(vm.changeStatusTone('ENABLED')).toBe('success')
    expect(vm.changeStatusTone('CHANGING')).toBe('processing')
    expect(vm.changeStatusTone('DRAFT')).toBe('pending')
    expect(vm.changeStatusTone('OFFLINE')).toBe('neutral')
    // 时间列为绝对时间 YYYY-MM-DD HH:mm（时区无关的格式断言）
    expect(vm.formatChangeTime(1730000000000)).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/)
    expect(vm.formatChangeTime('2026-01-02T03:04:05Z')).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/)
    expect(vm.formatChangeTime('')).toBe('-')
  })

  it('shows the unavailable empty state (not a crash) when the API 404s / fails', async () => {
    mocks.listChanges.mockRejectedValue(Object.assign(new Error('Request failed with status code 404'), { status: 404 }))
    const wrapper = factory()
    await flushPromises()
    await gotoChangesTab(wrapper)
    expect((wrapper.vm as any).changesUnavailable).toBe(true)
    expect(wrapper.find('[data-testid="changes-unavailable"]').exists()).toBe(true)
    expect(wrapper.html()).toContain('变更记录接口暂不可用')
  })

  it('refresh button re-fetches and recovers from the unavailable state', async () => {
    mocks.listChanges.mockRejectedValueOnce(new Error('404'))
    const wrapper = factory()
    await flushPromises()
    expect((wrapper.vm as any).changesUnavailable).toBe(true)
    await gotoChangesTab(wrapper)
    mocks.listChanges.mockResolvedValue(CHANGES)
    await wrapper.find('[data-testid="changes-refresh"]').trigger('click')
    await flushPromises()
    expect(mocks.listChanges).toHaveBeenCalledTimes(2)
    expect((wrapper.vm as any).changesUnavailable).toBe(false)
  })

  it('shows an empty state when the change list is empty', async () => {
    mocks.listChanges.mockResolvedValue([])
    const wrapper = factory()
    await flushPromises()
    await gotoChangesTab(wrapper)
    expect(wrapper.find('[data-testid="changes-empty"]').exists()).toBe(true)
  })
})
