import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getSyncStatus: vi.fn()
}))

vi.mock('@/api/misc', () => ({
  getSyncStatus: mocks.getSyncStatus
}))

import { createI18n } from 'vue-i18n'
import { mount, flushPromises } from '@vue/test-utils'
import PublishSyncStatus from '@/components/PublishSyncStatus.vue'

const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  messages: {
    'zh-CN': {
      common: { refresh: '刷新' },
      route: { publishSyncPending: '发布中…', publishSynced: '已生效', publishSyncDelayed: '同步延迟' }
    }
  }
})

function factory() {
  return mount(PublishSyncStatus, { global: { plugins: [i18n] } })
}

beforeEach(() => {
  mocks.getSyncStatus.mockReset()
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('PublishSyncStatus — P1-3 发布生效状态条（行内，不弹模态）', () => {
  it('idle 时不渲染任何内容', () => {
    const wrapper = factory()
    expect(wrapper.find('[data-testid="publish-sync-polling"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="publish-sync-synced"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="publish-sync-delayed"]').exists()).toBe(false)
    expect(wrapper.text()).toBe('')
  })

  it('polling 态显示「发布中…」', async () => {
    mocks.getSyncStatus.mockImplementation(() => new Promise(() => {}))
    const wrapper = factory()
    ;(wrapper.vm as any).start()
    await flushPromises()
    const bar = wrapper.find('[data-testid="publish-sync-polling"]')
    expect(bar.exists()).toBe(true)
    expect(bar.text()).toContain('发布中…')
  })

  it('synced 终态显示「已生效 ✓」，且没有重试按钮', async () => {
    mocks.getSyncStatus.mockResolvedValue({ available: true, gateway: { version: 1, fingerprint: 'f', updated_at: 1, instance: 'g' }, db_version: 1, in_sync: true })
    const wrapper = factory()
    ;(wrapper.vm as any).start()
    await flushPromises()
    const bar = wrapper.find('[data-testid="publish-sync-synced"]')
    expect(bar.exists()).toBe(true)
    expect(bar.text()).toContain('已生效')
    expect(bar.text()).toContain('✓')
    expect(wrapper.find('[data-testid="publish-sync-retry"]').exists()).toBe(false)
  })

  it('delayed 态显示「同步延迟」warning + 「刷新」重试按钮，点击后重新轮询', async () => {
    // 首轮：接口不可用 → delayed；重试：请求挂起 → 停留在 polling 可断言
    mocks.getSyncStatus.mockRejectedValueOnce(new Error('404'))
    mocks.getSyncStatus.mockImplementation(() => new Promise(() => {}))
    const wrapper = factory()
    ;(wrapper.vm as any).start()
    await flushPromises()
    const bar = wrapper.find('[data-testid="publish-sync-delayed"]')
    expect(bar.exists()).toBe(true)
    expect(bar.text()).toContain('同步延迟')
    const retryBtn = wrapper.find('[data-testid="publish-sync-retry"]')
    expect(retryBtn.exists()).toBe(true)
    expect(retryBtn.text()).toContain('刷新')
    expect(mocks.getSyncStatus).toHaveBeenCalledTimes(1)
    await retryBtn.trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="publish-sync-polling"]').exists()).toBe(true)
    expect(mocks.getSyncStatus).toHaveBeenCalledTimes(2)
  })

  it('同一时刻只有一个轮询实例状态（组件复用 start 幂等重启）', async () => {
    mocks.getSyncStatus.mockImplementation(() => new Promise(() => {}))
    const wrapper = factory()
    ;(wrapper.vm as any).start()
    ;(wrapper.vm as any).start()
    await flushPromises()
    // 重启会放弃旧 epoch：仍只有一个 polling 状态条
    expect(wrapper.findAll('[data-testid="publish-sync-polling"]').length).toBe(1)
    ;(wrapper.vm as any).retry()
    expect(wrapper.vm.phase).toBe('polling')
  })
})
