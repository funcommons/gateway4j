import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { createI18n } from 'vue-i18n'
import { mount } from '@vue/test-utils'

// H7b T1 契约用例：顶栏环境切换器（404 降级隐藏 / 多环境渲染 / 切换持久化）
const mocks = vi.hoisted(() => ({
  listEnvironments: vi.fn()
}))

vi.mock('@/api/environment', () => ({
  listEnvironments: mocks.listEnvironments
}))

import EnvironmentSwitcher from '@/components/EnvironmentSwitcher.vue'
import { useEnvironments } from '@/store/environment'
import { ENV_STORAGE_KEY } from '@/utils/environment'
import { installMemoryStorage } from '@/test-utils/memory-storage'

const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  messages: {
    'zh-CN': {
      env: { switcherLabel: '环境', switcherTip: '管理面视图过滤与归属选择' }
    }
  }
})

async function factory() {
  const env = useEnvironments()
  const wrapper = mount(EnvironmentSwitcher, { global: { plugins: [i18n] } })
  await env.ensureLoaded()
  return wrapper
}

beforeEach(() => {
  setActivePinia(createPinia())
  installMemoryStorage()
  mocks.listEnvironments.mockReset()
})

describe('EnvironmentSwitcher — 降级契约（404 → 整体不渲染）', () => {
  it('GET /v1/environments 404 → 切换器不渲染', async () => {
    mocks.listEnvironments.mockRejectedValue(new Error('Request failed with status 404'))
    const wrapper = await factory()
    expect(wrapper.find('[data-testid="env-switcher"]').exists()).toBe(false)
  })

  it('仅一个环境（default）→ 无可切换项，不渲染', async () => {
    mocks.listEnvironments.mockResolvedValue({ environments: ['default'] })
    const wrapper = await factory()
    expect(wrapper.find('[data-testid="env-switcher"]').exists()).toBe(false)
  })
})

describe('EnvironmentSwitcher — 正常路径', () => {
  it('多环境 → 渲染切换器并带 tooltip 定位说明（管理面口径）', async () => {
    mocks.listEnvironments.mockResolvedValue({ environments: ['default', 'staging'] })
    const wrapper = await factory()
    expect(wrapper.find('[data-testid="env-switcher"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="env-switcher-select"]').exists()).toBe(true)
    // tooltip 内容挂在包裹层上（FcTooltip），断言定位口径文案存在
    expect(wrapper.html()).toContain('管理面视图过滤与归属选择')
  })

  it('切换环境 → 写 Pinia + localStorage(gw4j_env)', async () => {
    mocks.listEnvironments.mockResolvedValue({ environments: ['default', 'staging'] })
    const wrapper = await factory()
    const env = useEnvironments()
    // FcSelect → el-select（测试环境未注册 ElementPlus），直接驱动 change 回调
    wrapper.vm.$.setupState.onChange('staging')
    expect(env.current).toBe('staging')
    expect(localStorage.getItem(ENV_STORAGE_KEY)).toBe('staging')
  })
})
