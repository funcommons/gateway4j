import { describe, it, expect, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => {
  const get = vi.fn()
  const post = vi.fn()
  const put = vi.fn()
  const del = vi.fn()
  return { get, post, put, del }
})

vi.mock('@/api/http', () => ({
  http: { get: mocks.get, post: mocks.post, put: mocks.put, delete: mocks.del },
  envelope: <T>(p: Promise<T>) => p
}))

import * as api from '@/api/auth'

beforeEach(() => {
  mocks.get.mockReset().mockResolvedValue('GET_RESULT')
  mocks.post.mockReset().mockResolvedValue('POST_RESULT')
  mocks.put.mockReset().mockResolvedValue('PUT_RESULT')
  mocks.del.mockReset().mockResolvedValue('DELETE_RESULT')
})

describe('auth api', () => {
  it('login -> POST /v1/auth/login with { username, password }', async () => {
    await api.login('alice', 's3cret')
    expect(mocks.post).toHaveBeenCalledWith('/v1/auth/login', {
      username: 'alice',
      password: 's3cret'
    })
  })

  it('refreshToken -> POST /v1/auth/refresh with refresh_token field (snake_case per API contract)', async () => {
    await api.refreshToken('rt-abc')
    expect(mocks.post).toHaveBeenCalledWith('/v1/auth/refresh', {
      refresh_token: 'rt-abc'
    })
  })

  it('listPermissions -> GET /v1/permissions', async () => {
    await api.listPermissions()
    expect(mocks.get).toHaveBeenCalledWith('/v1/permissions')
  })

  it('listRoles -> GET /v1/roles', async () => {
    await api.listRoles()
    expect(mocks.get).toHaveBeenCalledWith('/v1/roles')
  })
})

describe('role management api (D16 — contract is fixed, paths must not change)', () => {
  it('createRole -> POST /v1/roles with { role_code, role_name, remark }', async () => {
    await api.createRole({ role_code: 'ROLE_AUDITOR', role_name: '审计', remark: '只读审计' })
    expect(mocks.post).toHaveBeenCalledWith('/v1/roles', {
      role_code: 'ROLE_AUDITOR',
      role_name: '审计',
      remark: '只读审计'
    })
  })

  it('updateRole -> PUT /v1/roles/:id with { role_name, remark }', async () => {
    await api.updateRole('r1', { role_name: '新名称', remark: '备注' })
    expect(mocks.put).toHaveBeenCalledWith('/v1/roles/r1', {
      role_name: '新名称',
      remark: '备注'
    })
  })

  it('deleteRole -> DELETE /v1/roles/:id', async () => {
    await api.deleteRole('r1')
    expect(mocks.del).toHaveBeenCalledWith('/v1/roles/r1')
  })

  it('getRolePermissions -> GET /v1/roles/:id/permissions', async () => {
    await api.getRolePermissions('r1')
    expect(mocks.get).toHaveBeenCalledWith('/v1/roles/r1/permissions')
  })

  it('updateRolePermissions -> PUT /v1/roles/:id/permissions with { permission_codes }', async () => {
    await api.updateRolePermissions('r1', ['route:edit', 'route:publish'])
    expect(mocks.put).toHaveBeenCalledWith('/v1/roles/r1/permissions', {
      permission_codes: ['route:edit', 'route:publish']
    })
  })

  it('listRoleUsers -> GET /v1/roles/:id/users', async () => {
    await api.listRoleUsers('r1')
    expect(mocks.get).toHaveBeenCalledWith('/v1/roles/r1/users')
  })

  it('updateRoleUsers -> PUT /v1/roles/:id/users with { user_ids }', async () => {
    await api.updateRoleUsers('r1', ['u1', 'u2'])
    expect(mocks.put).toHaveBeenCalledWith('/v1/roles/r1/users', {
      user_ids: ['u1', 'u2']
    })
  })
})
