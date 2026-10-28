import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createI18n } from 'vue-i18n'
import { mount, flushPromises } from '@vue/test-utils'

const mocks = vi.hoisted(() => ({
  listUsers: vi.fn(),
  listRoles: vi.fn(),
  createUser: vi.fn(),
  deleteUser: vi.fn(),
  resetPassword: vi.fn()
}))

vi.mock('@/api/misc', () => ({
  listUsers: mocks.listUsers,
  createUser: mocks.createUser,
  deleteUser: mocks.deleteUser,
  resetPassword: mocks.resetPassword
}))

vi.mock('@/api/auth', () => ({
  listRoles: mocks.listRoles
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
vi.mock('@/components/overlay/FcDialog.vue', () => ({
  default: {
    name: 'FcDialog',
    props: ['open', 'title', 'width'],
    template: '<div v-if="open" class="dialog-stub"><slot /><slot name="footer" /></div>'
  }
}))

import List from '@/views/users/List.vue'

const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  messages: {
    'zh-CN': {
      common: { create: '新建', save: '保存', delete: '删除', more: '更多' },
      user: {
        name: '用户名', realName: '真实姓名', phone: '手机号',
        roles: '角色', status: '状态', createTitle: '新建用户',
        resetPassword: '重置密码'
      }
    }
  }
})

async function factory() {
  const wrapper = mount(List, { global: { plugins: [i18n] } })
  await flushPromises()
  return wrapper
}

beforeEach(() => {
  mocks.listUsers.mockReset().mockResolvedValue({ records: [], total: 0 })
  mocks.listRoles.mockReset().mockResolvedValue([])
  mocks.createUser.mockReset().mockResolvedValue({ id: 'u1' })
  mocks.deleteUser.mockReset().mockResolvedValue(undefined)
  mocks.resetPassword.mockReset().mockResolvedValue(undefined)
})

describe('users/List.vue — reload() error feedback', () => {
  it('starts with empty loadError', async () => {
    const wrapper = await factory()
    expect((wrapper.vm as any).loadError).toBe('')
    expect(wrapper.find('[data-testid="load-error"]').exists()).toBe(false)
  })

  it('listUsers failure sets loadError with server message', async () => {
    mocks.listUsers.mockRejectedValue(new Error('用户列表加载失败'))
    const wrapper = await factory()
    await flushPromises()
    expect((wrapper.vm as any).loadError).toBe('用户列表加载失败')
  })

  it('listUsers failure renders error in UI', async () => {
    mocks.listUsers.mockRejectedValue(new Error('权限不足'))
    const wrapper = await factory()
    await flushPromises()
    const el = wrapper.find('[data-testid="load-error"]')
    expect(el.exists()).toBe(true)
    expect(el.text()).toContain('权限不足')
  })

  it('successful load clears loadError', async () => {
    mocks.listUsers.mockResolvedValue({ records: [], total: 0 })
    const wrapper = await factory()
    await flushPromises()
    expect((wrapper.vm as any).loadError).toBe('')
    expect(wrapper.find('[data-testid="load-error"]').exists()).toBe(false)
  })

  it('failure clears stale rows', async () => {
    mocks.listUsers.mockResolvedValueOnce({
      records: [{ id: 'u1', username: 'old' }],
      total: 1
    })
    const wrapper = await factory()
    await flushPromises()
    expect((wrapper.vm as any).rows.length).toBe(1)

    mocks.listUsers.mockRejectedValue(new Error('500'))
    await (wrapper.vm as any).reload()
    await flushPromises()
    expect((wrapper.vm as any).rows).toEqual([])
    expect((wrapper.vm as any).loadError).toBe('500')
  })

  it('subsequent successful reload clears previous error', async () => {
    mocks.listUsers.mockRejectedValueOnce(new Error('first'))
    mocks.listUsers.mockResolvedValueOnce({ records: [], total: 0 })
    const wrapper = await factory()
    await flushPromises()
    expect((wrapper.vm as any).loadError).toBe('first')
    await (wrapper.vm as any).reload()
    await flushPromises()
    expect((wrapper.vm as any).loadError).toBe('')
  })
})
