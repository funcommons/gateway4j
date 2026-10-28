import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createI18n } from 'vue-i18n'
import { createMemoryHistory, createRouter } from 'vue-router'
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
      common: {
        create: '新建', save: '保存', delete: '删除', more: '更多',
        cancel: '取消', submit: '提交', actionFailed: '操作失败',
        loadFailed: '加载失败', saveFailed: '保存失败', confirmDelete: '确定删除？',
        edit: '编辑', enable: '启用', disable: '禁用', search: '搜索',
        confirm: '确认', back: '返回', yes: '是', no: '否',
        refresh: '刷新', export: '导出', import: '导入', publish: '发布',
        offline: '下线', loading: '加载中', empty: '暂无数据',
        enabled: '已启用', disabled: '已禁用', success: '操作成功',
        failed: '操作失败', sortFailed: '排序失败', loginFailed: '登录失败',
        exportFailed: '导出失败', importFailed: '导入失败'
      },
      user: {
        name: '用户名', realName: '真实姓名', phone: '手机号',
        roles: '角色', status: '状态', createTitle: '新建用户',
        resetPassword: '重置密码', editTitle: '编辑用户',
        searchPlaceholder: '搜索用户', newPassword: '新密码',
        password: '密码', newPasswordHint: '留空则不修改',
        nameRequired: '请输入用户名', namePattern: '用户名需 2-30 位字母数字下划线',
        passwordRequired: '请输入密码', phonePattern: '请输入合法手机号'
      }
    }
  }
})

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/users', component: { template: '<div />' } }
    ]
  })
}

async function factory() {
  const router = makeRouter()
  await router.push('/users')
  await router.isReady()
  const wrapper = mount(List, { global: { plugins: [i18n, router] } })
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

describe('users/List.vue — save() error UX (createUser)', () => {
  it('starts with empty actionError', async () => {
    const wrapper = await factory()
    expect((wrapper.vm as any).actionError).toBe('')
  })

  it('createUser failure sets actionError with server message', async () => {
    mocks.createUser.mockRejectedValue(new Error('用户名已存在'))
    const wrapper = await factory()
    const vm = wrapper.vm as any
    vm.open = true
    vm.form.username = 'dup'
    if (vm.formRef) vm.formRef.validate = () => Promise.resolve()
    await vm.save()
    expect(vm.actionError).toBe('用户名已存在')
  })

  it('createUser failure keeps dialog open (so user can retry)', async () => {
    mocks.createUser.mockRejectedValue(new Error('用户名已存在'))
    const wrapper = await factory()
    const vm = wrapper.vm as any
    vm.open = true
    vm.form.username = 'dup'
    if (vm.formRef) vm.formRef.validate = () => Promise.resolve()
    await vm.save()
    expect(vm.open).toBe(true)
  })

  it('createUser failure renders error in dialog body', async () => {
    mocks.createUser.mockRejectedValue(new Error('用户名已存在'))
    const wrapper = await factory()
    const vm = wrapper.vm as any
    vm.open = true
    vm.form.username = 'dup'
    if (vm.formRef) vm.formRef.validate = () => Promise.resolve()
    await vm.save()
    await flushPromises()
    const dialog = wrapper.find('.dialog-stub')
    expect(dialog.exists()).toBe(true)
    expect(dialog.text()).toContain('用户名已存在')
  })

  it('createUser success clears actionError and closes dialog', async () => {
    mocks.createUser.mockResolvedValue({ id: 'u1' })
    const wrapper = await factory()
    const vm = wrapper.vm as any
    vm.open = true
    vm.form.username = 'newuser'
    if (vm.formRef) vm.formRef.validate = () => Promise.resolve()
    await vm.save()
    await flushPromises()
    expect(vm.actionError).toBe('')
    expect(vm.open).toBe(false)
  })

  it('actionError is cleared before each save attempt', async () => {
    mocks.createUser.mockRejectedValueOnce(new Error('first'))
    mocks.createUser.mockResolvedValueOnce({ id: 'u2' })
    const wrapper = await factory()
    const vm = wrapper.vm as any
    vm.open = true
    vm.form.username = 'u2'
    if (vm.formRef) vm.formRef.validate = () => Promise.resolve()
    await vm.save()
    expect(vm.actionError).toBe('first')
    vm.form.username = 'u3'
    if (vm.formRef) vm.formRef.validate = () => Promise.resolve()
    await vm.save()
    await flushPromises()
    expect(vm.actionError).toBe('')
  })
})

describe('users/List.vue — del() error UX (deleteUser)', () => {
  it('deleteUser failure sets actionError at page level', async () => {
    mocks.deleteUser.mockRejectedValue(new Error('用户存在未完成任务'))
    const wrapper = await factory()
    const vm = wrapper.vm as any
    await vm.del({ id: 'u1' })
    expect(vm.actionError).toBe('用户存在未完成任务')
  })

  it('deleteUser failure renders error in page (data-testid)', async () => {
    mocks.deleteUser.mockRejectedValue(new Error('用户存在未完成任务'))
    const wrapper = await factory()
    const vm = wrapper.vm as any
    await vm.del({ id: 'u1' })
    await flushPromises()
    const el = wrapper.find('[data-testid="action-error"]')
    expect(el.exists()).toBe(true)
    expect(el.text()).toBe('用户存在未完成任务')
  })

  it('deleteUser success leaves actionError empty', async () => {
    mocks.deleteUser.mockResolvedValue(undefined)
    const wrapper = await factory()
    const vm = wrapper.vm as any
    await vm.del({ id: 'u1' })
    await flushPromises()
    expect(vm.actionError).toBe('')
    expect(wrapper.find('[data-testid="action-error"]').exists()).toBe(false)
  })

  it('deleteUser failure does not reload list', async () => {
    mocks.deleteUser.mockRejectedValue(new Error('500'))
    const wrapper = await factory()
    const vm = wrapper.vm as any
    const beforeCalls = mocks.listUsers.mock.calls.length
    await vm.del({ id: 'u1' })
    await flushPromises()
    // reload should NOT be called on delete failure
    expect(mocks.listUsers.mock.calls.length).toBe(beforeCalls)
  })
})

describe('users/List.vue — doReset() error UX (resetPassword)', () => {
  it('resetPassword failure sets actionError with server message', async () => {
    mocks.resetPassword.mockRejectedValue(new Error('密码强度不够'))
    const wrapper = await factory()
    const vm = wrapper.vm as any
    vm.openReset({ id: 'u1', username: 'u1' })
    vm.newPwd = 'weak'
    await vm.doReset()
    expect(vm.actionError).toBe('密码强度不够')
  })

  it('resetPassword failure keeps dialog open (so user can retry)', async () => {
    mocks.resetPassword.mockRejectedValue(new Error('密码强度不够'))
    const wrapper = await factory()
    const vm = wrapper.vm as any
    vm.openReset({ id: 'u1', username: 'u1' })
    vm.newPwd = 'weak'
    await vm.doReset()
    expect(vm.resetOpen).toBe(true)
  })

  it('resetPassword failure renders error in dialog body', async () => {
    mocks.resetPassword.mockRejectedValue(new Error('密码强度不够'))
    const wrapper = await factory()
    const vm = wrapper.vm as any
    vm.openReset({ id: 'u1', username: 'u1' })
    vm.newPwd = 'weak'
    await vm.doReset()
    await flushPromises()
    const dialog = wrapper.find('.dialog-stub')
    expect(dialog.exists()).toBe(true)
    expect(dialog.text()).toContain('密码强度不够')
  })

  it('resetPassword success clears actionError and closes dialog', async () => {
    mocks.resetPassword.mockResolvedValue(undefined)
    const wrapper = await factory()
    const vm = wrapper.vm as any
    vm.openReset({ id: 'u1', username: 'u1' })
    vm.newPwd = 'newpassword123'
    await vm.doReset()
    await flushPromises()
    expect(vm.actionError).toBe('')
    expect(vm.resetOpen).toBe(false)
  })
})
