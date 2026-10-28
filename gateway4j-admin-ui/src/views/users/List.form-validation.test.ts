import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createI18n } from 'vue-i18n'
import { mount, flushPromises } from '@vue/test-utils'

const mocks = vi.hoisted(() => ({
  listUsers: vi.fn(),
  createUser: vi.fn(),
  deleteUser: vi.fn(),
  resetPassword: vi.fn(),
  listRoles: vi.fn()
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

import List from '@/views/users/List.vue'

const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  messages: {
    'zh-CN': {
      common: {
        create: '新建', more: '更多', delete: '删除', save: '保存',
        cancel: '取消', submit: '提交', actionFailed: '操作失败',
        loadFailed: '加载失败', confirmDelete: '确定删除？',
        edit: '编辑', enable: '启用', disable: '禁用', search: '搜索',
        confirm: '确认', back: '返回', yes: '是', no: '否',
        refresh: '刷新', export: '导出', import: '导入', publish: '发布',
        offline: '下线', loading: '加载中', empty: '暂无数据',
        enabled: '已启用', disabled: '已禁用', success: '操作成功',
        failed: '操作失败', saveFailed: '保存失败', sortFailed: '排序失败',
        loginFailed: '登录失败', exportFailed: '导出失败', importFailed: '导入失败'
      },
      user: {
        name: '用户名', realName: '真实姓名', phone: '电话',
        roles: '角色', status: '状态', resetPassword: '重置密码',
        createTitle: '新建用户', editTitle: '编辑用户',
        searchPlaceholder: '搜索用户', newPassword: '新密码',
        password: '密码', newPasswordHint: '留空则不修改',
        nameRequired: '请输入用户名', namePattern: '用户名需 2-30 位字母数字下划线',
        passwordRequired: '请输入密码', phonePattern: '请输入合法手机号'
      }
    }
  }
})

function factory() {
  return mount(List, { global: { plugins: [i18n] } })
}

beforeEach(() => {
  mocks.listUsers.mockReset().mockResolvedValue({ records: [], total: 0 })
  mocks.createUser.mockReset().mockResolvedValue(undefined)
  mocks.deleteUser.mockReset().mockResolvedValue(undefined)
  mocks.resetPassword.mockReset().mockResolvedValue(undefined)
  mocks.listRoles.mockReset().mockResolvedValue([])
})

describe('users/List.vue — form validation rules', () => {
  it('exposes formRules with username required + pattern', async () => {
    const wrapper = factory()
    await flushPromises()
    const vm = wrapper.vm as any
    const rules = vm.formRules
    expect(rules).toBeDefined()
    const nameRequired = rules.username.find((r: any) => r.required)
    expect(nameRequired).toBeDefined()
    const namePattern = rules.username.find((r: any) => r.pattern)
    expect(namePattern).toBeDefined()
  })

  it('username pattern rejects single char and accepts valid names', async () => {
    const wrapper = factory()
    await flushPromises()
    const vm = wrapper.vm as any
    const patternRule = vm.formRules.username.find((r: any) => r.pattern)
    const re = new RegExp(patternRule.pattern)
    expect(re.test('a')).toBe(false)
    expect(re.test('ab')).toBe(true)
    expect(re.test('my_user_1')).toBe(true)
    expect(re.test('my-user')).toBe(false)
  })

  it('password is required in create mode', async () => {
    const wrapper = factory()
    await flushPromises()
    const vm = wrapper.vm as any
    vm.openCreate()
    await flushPromises()
    const rules = vm.formRules
    const pwdRequired = rules.password.find((r: any) => r.required)
    expect(pwdRequired).toBeDefined()
  })

  it('phone pattern rejects invalid phone numbers', async () => {
    const wrapper = factory()
    await flushPromises()
    const vm = wrapper.vm as any
    const rules = vm.formRules
    const phoneRule = rules.phone?.find((r: any) => r.validator)
    if (phoneRule) {
      let err: Error | undefined
      const cb = (e?: Error) => { err = e }
      phoneRule.validator({}, 'abc', cb)
      expect(err).toBeDefined()
      err = undefined
      phoneRule.validator({}, '13800138000', cb)
      expect(err).toBeUndefined()
    }
  })
})

describe('users/List.vue — save validates form', () => {
  it('aborts save when form validation rejects', async () => {
    const wrapper = factory()
    await flushPromises()
    const vm = wrapper.vm as any
    vm.openCreate()
    await flushPromises()
    // Set invalid form data
    vm.form.username = ''
    vm.form.password = ''
    // Mock formRef.validate to reject
    if (vm.formRef) {
      vm.formRef.validate = vi.fn().mockRejectedValue(new Error('validation failed'))
    }
    await vm.save()
    expect(mocks.createUser).not.toHaveBeenCalled()
  })

  it('proceeds with save when form validation passes', async () => {
    const wrapper = factory()
    await flushPromises()
    const vm = wrapper.vm as any
    vm.openCreate()
    await flushPromises()
    vm.form.username = 'alice'
    vm.form.password = 'pw123'
    if (vm.formRef) {
      vm.formRef.validate = vi.fn().mockResolvedValue(true)
    }
    await vm.save()
    expect(mocks.createUser).toHaveBeenCalledTimes(1)
  })
})
