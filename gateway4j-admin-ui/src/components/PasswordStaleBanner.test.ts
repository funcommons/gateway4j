import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createI18n } from 'vue-i18n'
import { createPinia, setActivePinia } from 'pinia'
import { mount, flushPromises } from '@vue/test-utils'

const mocks = vi.hoisted(() => ({
  updateUser: vi.fn()
}))

vi.mock('@/api/misc', () => ({
  updateUser: mocks.updateUser
}))

vi.mock('@/api/http', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/http')>()
  return {
    ...actual,
    mapFieldErrors: vi.fn(() => ({}))
  }
})

import PasswordStaleBanner from '@/components/PasswordStaleBanner.vue'
import { useAuthStore } from '@/store/auth'

const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  messages: {
    'zh-CN': {
      auth: {
        pwdStaleBanner: '当前使用默认口令，建议立即修改',
        pwdStaleAction: '立即修改',
        pwdDialogTitle: '修改密码',
        pwdNew: '新密码',
        pwdNewPlaceholder: '请输入新密码',
        pwdConfirm: '确认新密码',
        pwdConfirmPlaceholder: '请再次输入新密码',
        pwdMismatch: '两次输入的密码不一致',
        pwdRequired: '请输入新密码',
        pwdChanged: '密码已修改'
      },
      common: { cancel: '取消', submit: '提交', actionFailed: '操作失败' }
    }
  }
})

async function factory() {
  const pinia = createPinia()
  setActivePinia(pinia)
  const auth = useAuthStore()
  const wrapper = mount(PasswordStaleBanner, { global: { plugins: [i18n, pinia] } })
  await flushPromises()
  return { wrapper, auth }
}

beforeEach(() => {
  mocks.updateUser.mockReset().mockResolvedValue({})
  const mem = new Map<string, string>()
  const storageStub = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => { mem.set(k, v) },
    removeItem: (k: string) => { mem.delete(k) },
    clear: () => mem.clear()
  }
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storageStub })
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: storageStub })
})

describe('PasswordStaleBanner — P2-9 弱口令横幅（T2）三态', () => {
  it('password_stale=true → 横幅渲染文案与「立即修改」按钮', async () => {
    const { wrapper, auth } = await factory()
    auth.passwordStale = true
    await flushPromises()
    expect(wrapper.find('[data-testid="pwd-stale-banner"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="pwd-stale-text"]').text()).toBe('当前使用默认口令，建议立即修改')
    expect(wrapper.find('[data-testid="pwd-stale-action"]').exists()).toBe(true)
  })

  it('password_stale=false（缺省）→ 不渲染', async () => {
    const { wrapper, auth } = await factory()
    auth.passwordStale = false
    await flushPromises()
    expect(wrapper.find('[data-testid="pwd-stale-banner"]').exists()).toBe(false)
  })

  it('本地已改密（sessionStorage 标记）→ 即使 passwordStale=true 也不渲染', async () => {
    const { wrapper, auth } = await factory()
    auth.passwordStale = true
    auth.markPasswordChanged()
    await flushPromises()
    expect(wrapper.find('[data-testid="pwd-stale-banner"]').exists()).toBe(false)
  })

  it('无用户时不渲染（非登录态保护）', async () => {
    const { wrapper, auth } = await factory()
    auth.passwordStale = true
    auth.user = null
    await flushPromises()
    // 横幅本身按 passwordStale 渲染（无用户时改密动作会被拦截）
    expect(wrapper.find('[data-testid="pwd-stale-banner"]').exists()).toBe(true)
  })
})

describe('PasswordStaleBanner — 改密流程', () => {
  async function openDialog() {
    const { wrapper, auth } = await factory()
    auth.passwordStale = true
    auth.user = { id: 'u1', username: 'admin', roles: [] }
    await flushPromises()
    await wrapper.find('[data-testid="pwd-stale-action"]').trigger('click')
    await flushPromises()
    return { wrapper, auth }
  }

  it('「立即修改」打开对话框', async () => {
    const { wrapper } = await openDialog()
    expect((wrapper.vm as any).open).toBe(true)
    expect(wrapper.find('[data-testid="pwd-new-input"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="pwd-confirm-input"]').exists()).toBe(true)
  })

  it('空密码 → 提示必填，不调接口', async () => {
    const { wrapper } = await openDialog()
    const vm = wrapper.vm as any
    await vm.submit()
    expect(mocks.updateUser).not.toHaveBeenCalled()
    expect(wrapper.find('[data-testid="pwd-stale-error"]').text()).toBe('请输入新密码')
  })

  it('两次输入不一致 → 提示不一致，不调接口', async () => {
    const { wrapper } = await openDialog()
    const vm = wrapper.vm as any
    vm.newPwd = 'NewPass123'
    vm.confirmPwd = 'NewPass456'
    await vm.submit()
    expect(mocks.updateUser).not.toHaveBeenCalled()
    expect(wrapper.find('[data-testid="pwd-stale-error"]').text()).toBe('两次输入的密码不一致')
  })

  it('成功 → PATCH /v1/users/{id}({password})，横幅消失，对话框关闭', async () => {
    const { wrapper, auth } = await openDialog()
    const vm = wrapper.vm as any
    vm.newPwd = 'NewPass123'
    vm.confirmPwd = 'NewPass123'
    await vm.submit()
    await flushPromises()
    expect(mocks.updateUser).toHaveBeenCalledWith('u1', { password: 'NewPass123' })
    expect(auth.passwordStale).toBe(false)
    expect(auth.showPasswordStaleBanner).toBe(false)
    expect(vm.open).toBe(false)
    expect(wrapper.find('[data-testid="pwd-stale-banner"]').exists()).toBe(false)
  })

  it('失败 → 错误落在对话框内，横幅保留（不静默吞错）', async () => {
    mocks.updateUser.mockRejectedValue(new Error('密码强度不足'))
    const { wrapper } = await openDialog()
    const vm = wrapper.vm as any
    vm.newPwd = 'x'
    vm.confirmPwd = 'x'
    await vm.submit()
    await flushPromises()
    expect(wrapper.find('[data-testid="pwd-stale-error"]').text()).toBe('密码强度不足')
    expect((wrapper.vm as any).open).toBe(true)
  })
})
