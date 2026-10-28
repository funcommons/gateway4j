import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { createI18n } from 'vue-i18n'
import { createMemoryHistory, createRouter } from 'vue-router'
import { mount, flushPromises } from '@vue/test-utils'

// Mock the auth store BEFORE importing Login.
const mocks = vi.hoisted(() => ({
  doLogin: vi.fn()
}))

vi.mock('@/store/auth', () => ({
  useAuthStore: () => ({ doLogin: mocks.doLogin })
}))

// Stub the i18n-dependent FcSectionCard at the module level.
vi.mock('@/components/display/FcSectionCard.vue', () => ({
  default: { name: 'FcSectionCard', props: ['width'], template: '<div class="section-card-stub"><slot /></div>' }
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
      { path: '/routes', name: 'Routes', component: { template: '<div />' } },
      { path: '/dashboard', name: 'Dashboard', component: { template: '<div />' } }
    ]
  })
}

beforeEach(() => {
  setActivePinia(createPinia())
  mocks.doLogin.mockReset()
})

async function factory(opts: { initialRoute?: { path: string; query?: any } } = {}) {
  const router = makeRouter()
  await router.push(opts.initialRoute ?? { path: '/login' })
  await router.isReady()
  return mount(Login, {
    global: {
      plugins: [i18n, router],
      stubs: {
        'el-form': { template: '<form><slot /></form>' },
        'el-form-item': { template: '<div><slot /></div>' },
        'el-icon': { template: '<span><slot /></span>' },
        'EpIconUser': { template: '<i />' },
        'EpIconLock': { template: '<i />' }
      }
    }
  })
}

describe('Login.vue', () => {
  it('mounts without errors', async () => {
    const wrapper = await factory()
    expect(wrapper.html()).toContain('auth-page')
  })

  it('starts with empty credentials', async () => {
    const wrapper = await factory()
    const vm = wrapper.vm as any
    expect(vm.form.username).toBe('')
    expect(vm.form.password).toBe('')
  })

  it('starts with no error and not loading', async () => {
    const wrapper = await factory()
    const vm = wrapper.vm as any
    expect(vm.error).toBe('')
    expect(vm.loading).toBe(false)
  })

  it('submit() with empty username sets Chinese error', async () => {
    const wrapper = await factory()
    const vm = wrapper.vm as any
    vm.form.username = ''
    vm.form.password = 'something'
    await vm.submit()
    expect(vm.error).toBe('请输入用户名和密码')
    expect(mocks.doLogin).not.toHaveBeenCalled()
  })

  it('submit() with empty password sets error', async () => {
    const wrapper = await factory()
    const vm = wrapper.vm as any
    vm.form.username = 'u'
    vm.form.password = ''
    await vm.submit()
    expect(vm.error).toBeTruthy()
    expect(mocks.doLogin).not.toHaveBeenCalled()
  })

  it('submit() with valid credentials calls doLogin', async () => {
    mocks.doLogin.mockResolvedValue(undefined)
    const wrapper = await factory()
    const vm = wrapper.vm as any
    vm.form.username = 'alice'
    vm.form.password = 'pw'
    await vm.submit()
    expect(mocks.doLogin).toHaveBeenCalledWith('alice', 'pw', true)
  })

  it('submit() redirects to /routes by default', async () => {
    mocks.doLogin.mockResolvedValue(undefined)
    const wrapper = await factory({ initialRoute: { path: '/login' } })
    const vm = wrapper.vm as any
    vm.form.username = 'admin'
    vm.form.password = 'admin123'
    await vm.submit()
    await flushPromises()
    expect(wrapper.vm.$route.path).toBe('/routes')
  })

  it('submit() honors redirect query param', async () => {
    mocks.doLogin.mockResolvedValue(undefined)
    const wrapper = await factory({
      initialRoute: { path: '/login', query: { redirect: '/dashboard' } }
    })
    const vm = wrapper.vm as any
    vm.form.username = 'admin'
    vm.form.password = 'admin123'
    await vm.submit()
    await flushPromises()
    expect(wrapper.vm.$route.path).toBe('/dashboard')
  })

  it('submit() shows server error message on rejection', async () => {
    mocks.doLogin.mockRejectedValue(new Error('Invalid credentials'))
    const wrapper = await factory()
    const vm = wrapper.vm as any
    vm.form.username = 'admin'
    vm.form.password = 'admin123'
    await vm.submit()
    expect(vm.error).toBe('Invalid credentials')
  })

  it('submit() clears previous error on retry', async () => {
    mocks.doLogin.mockRejectedValueOnce(new Error('first'))
    mocks.doLogin.mockResolvedValueOnce(undefined)
    const wrapper = await factory()
    const vm = wrapper.vm as any
    vm.form.username = 'admin'
    vm.form.password = 'admin123'
    await vm.submit()
    expect(vm.error).toBe('first')
    await vm.submit()
    expect(vm.error).toBe('')
  })

  it('submit() flips loading on during request, off after', async () => {
    let resolveLogin: (v: any) => void = () => {}
    mocks.doLogin.mockImplementation(() => new Promise((resolve) => { resolveLogin = resolve }))
    const wrapper = await factory()
    const vm = wrapper.vm as any
    vm.form.username = 'admin'
    vm.form.password = 'admin123'
    const p = vm.submit()
    expect(vm.loading).toBe(true)
    resolveLogin(undefined)
    await p
    expect(vm.loading).toBe(false)
  })
})