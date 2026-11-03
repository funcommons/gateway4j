import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { mount } from '@vue/test-utils'

/**
 * GlobalCommandPalette — 命令可见性必须与「路由守卫」同源。
 *
 * 守卫判据 (src/router/index.ts 的 beforeEach):
 *   const perm = to.meta.permission
 *   if (perm && !auth.permissions.some(p => p.permission_code === perm)) return false
 *
 * 面板若另写一套权限字符串, 就会出现「面板里看得见, 点进去被守卫弹『无权限』」的假入口.
 * 历史上就踩过: 用户组按 user:read 放行, 而 /users 路由要 system:user.
 *
 * 本文件用**真实路由表** (@/router) 断言:
 *  - ROLE_OPS (只有 user:read) 视角: 「用户列表」不可见, 「角色权限」可见;
 *  - 权限码从路由 meta.permission 推导 (路由没声明 permission → 守卫也不拦, 面板同样不拦).
 */

const mocks = vi.hoisted(() => ({ permissions: [] as string[] }))

vi.mock('@/store/auth', () => ({
  useAuthStore: () => ({
    permissions: mocks.permissions.map((permission_code) => ({ permission_code })),
    isLogin: true,
    logout: () => {},
    init: async () => {},
  }),
}))

import { router as appRouter } from '@/router'
import GlobalCommandPalette from './GlobalCommandPalette.vue'

/** 挂载面板 (open=true 才会渲染命令条目). */
function mountPalette(router: Router = appRouter) {
  return mount(GlobalCommandPalette, {
    props: { open: true },
    global: { plugins: [router] },
  })
}

/** 面板里渲染出来的命令 label (i18n 兜底为 key 本身). */
function labelsOf(wrapper: ReturnType<typeof mountPalette>): string[] {
  return wrapper.findAll('.fc-cp__item-label').map((n) => n.text())
}

describe('GlobalCommandPalette — 权限判据与路由守卫同源', () => {
  beforeEach(() => {
    mocks.permissions = []
  })

  it('ROLE_OPS (只有 user:read): 「用户列表」不可见, 「角色权限」可见', () => {
    mocks.permissions = ['user:read']
    const labels = labelsOf(mountPalette())
    // /users 路由要 system:user —— 面板不该把它露出来 (点进去只会被守卫弹「无权限」)
    expect(labels).not.toContain('sidebar.userList')
    // /roles 路由要 user:read —— 面板应当可见
    expect(labels).toContain('sidebar.rolePerm')
  })

  it('持有 system:user 时「用户列表」可见', () => {
    mocks.permissions = ['user:read', 'system:user']
    const labels = labelsOf(mountPalette())
    expect(labels).toContain('sidebar.userList')
    expect(labels).toContain('sidebar.rolePerm')
  })

  it('零权限时, 所有声明了 permission 的命令都不可见', () => {
    mocks.permissions = []
    const labels = labelsOf(mountPalette())
    expect(labels).not.toContain('sidebar.userList')
    expect(labels).not.toContain('sidebar.rolePerm')
    expect(labels).not.toContain('sidebar.dashboard')
    expect(labels).not.toContain('sidebar.routeList')
    expect(labels).not.toContain('sidebar.pluginList')
    expect(labels).not.toContain('sidebar.settings')
  })

  it('权限码来自路由 meta.permission: 路由没声明 permission → 所有人可见', () => {
    mocks.permissions = []
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', component: { template: '<div />' } },
        // 与真实路由同名, 但刻意不声明 meta.permission —— 守卫也不拦它
        { path: '/routes', name: 'Routes', component: { template: '<div />' } },
      ],
    })
    const labels = labelsOf(mountPalette(router))
    expect(labels).toContain('sidebar.routeList')
    // 路由表里根本不存在的命令不出现
    expect(labels).not.toContain('sidebar.userList')
  })

  it('真实路由表里 /users 声明的是 system:user (防止有人改回去)', () => {
    const users = appRouter.getRoutes().find((r) => r.name === 'Users')
    expect((users?.meta as { permission?: string } | undefined)?.permission).toBe('system:user')
    const roles = appRouter.getRoutes().find((r) => r.name === 'Roles')
    expect((roles?.meta as { permission?: string } | undefined)?.permission).toBe('user:read')
  })
})
