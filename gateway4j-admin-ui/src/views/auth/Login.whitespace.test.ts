import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { createI18n } from 'vue-i18n'
import { createMemoryHistory, createRouter } from 'vue-router'
import { mount, flushPromises } from '@vue/test-utils'

const mocks = vi.hoisted(() => ({
  doLogin: vi.fn()
}))

vi.mock('@/store/auth', () => ({
  useAuthStore: () => ({ doLogin: mocks.doLogin })
}))

import Login from '@/views/auth/Login.vue'

const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  messages: {
    'zh-CN': {
      auth: {
        title: 'Gateway4j 后台',
        welcome: '欢迎使用',
        username: '用户名',
        password: '密码',
        submit: '登录',
        usernamePasswordRequired: '请输入用户名和密码'
      }
    }
  }
})

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/login', name: 'Login', component: { template: '<div />' } },
      { path: '/routes', name: 'Routes', component: { template: '<div />' } }
    ]
  })
}

async function factory(opts: { initialRoute?: { path: string; query?: any } } = {}) {
  const router = makeRouter()
  await router.push(opts.initialRoute ?? { path: '/login' })
  await router.isReady()
  const wrapper = mount(Login, { global: { plugins: [i18n, router] } })
  await flushPromises()
  return wrapper
}

beforeEach(() => {
  setActivePinia(createPinia())
  mocks.doLogin.mockReset()
})

describe('Login.vue — whitespace input validation', () => {
  it('rejects whitespace-only username with Chinese error', async () => {
    const wrapper = await factory()
    const vm = wrapper.vm as any
    vm.form.username = '   '
    vm.form.password = 'something'
    await vm.submit()
    expect(vm.error).toBe('请输入用户名和密码')
    expect(mocks.doLogin).not.toHaveBeenCalled()
  })

  it('rejects whitespace-only password with Chinese error', async () => {
    const wrapper = await factory()
    const vm = wrapper.vm as any
    vm.form.username = 'alice'
    vm.form.password = '   '
    await vm.submit()
    expect(vm.error).toBe('请输入用户名和密码')
    expect(mocks.doLogin).not.toHaveBeenCalled()
  })

  it('rejects tab/newline-only username', async () => {
    const wrapper = await factory()
    const vm = wrapper.vm as any
    vm.form.username = '\t\n  '
    vm.form.password = 'pw'
    await vm.submit()
    expect(mocks.doLogin).not.toHaveBeenCalled()
  })

  it('accepts username with leading/trailing whitespace if there is content', async () => {
    mocks.doLogin.mockResolvedValue(undefined)
    const wrapper = await factory()
    const vm = wrapper.vm as any
    vm.form.username = '  alice  '
    vm.form.password = 'pw'
    await vm.submit()
    // doLogin is called — but it should be called with the trimmed value
    expect(mocks.doLogin).toHaveBeenCalled()
    const [user, pass] = mocks.doLogin.mock.calls[0]
    expect(user).toBe('alice')  // trimmed
    expect(pass).toBe('pw')      // (we may not trim passwords)
  })

  it('trims the username before sending to server (but not password)', async () => {
    mocks.doLogin.mockResolvedValue(undefined)
    const wrapper = await factory()
    const vm = wrapper.vm as any
    vm.form.username = '  alice  '
    vm.form.password = '  secret123  '  // passwords may intentionally have spaces
    await vm.submit()
    expect(mocks.doLogin).toHaveBeenCalledWith('alice', '  secret123  ', true)
  })

  it('still rejects completely empty username (regression)', async () => {
    const wrapper = await factory()
    const vm = wrapper.vm as any
    vm.form.username = ''
    vm.form.password = 'pw'
    await vm.submit()
    expect(mocks.doLogin).not.toHaveBeenCalled()
  })

  it('still rejects completely empty password (regression)', async () => {
    const wrapper = await factory()
    const vm = wrapper.vm as any
    vm.form.username = 'alice'
    vm.form.password = ''
    await vm.submit()
    expect(mocks.doLogin).not.toHaveBeenCalled()
  })
})
