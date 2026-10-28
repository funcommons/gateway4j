import { test, expect } from '@playwright/test'

const API_BASE = 'http://localhost:9301'

test.describe('Auth API', () => {
  test('login returns token and user info', async ({ request }) => {
    const resp = await request.post(`${API_BASE}/v1/auth/login`, {
      data: { username: 'admin', password: 'admin123' },
    })
    expect(resp.status()).toBe(200)
    const body = await resp.json()
    expect(body.access_token).toBeTruthy()
    expect(body.user_id).toBeTruthy()
    expect(body.roles).toContain('ROLE_ADMIN')
  })
})

test.describe('Protected APIs', () => {
  let authToken: string

  test.beforeEach(async ({ request }) => {
    const resp = await request.post(`${API_BASE}/v1/auth/login`, {
      data: { username: 'admin', password: 'admin123' },
    })
    const body = await resp.json()
    authToken = body.access_token
  })

  test('permissions API returns list', async ({ request }) => {
    const resp = await request.get(`${API_BASE}/v1/permissions`, {
      headers: { Authorization: `Bearer ${authToken}` },
    })
    expect(resp.status()).toBe(200)
    const body = await resp.json()
    expect(Array.isArray(body)).toBeTruthy()
    expect(body.length).toBeGreaterThanOrEqual(11)
  })

  test('list routes', async ({ request }) => {
    const resp = await request.get(`${API_BASE}/v1/routes`, {
      headers: { Authorization: `Bearer ${authToken}` },
    })
    expect(resp.status()).toBe(200)
  })

  test('create and delete route', async ({ request }) => {
    const createResp = await request.post(`${API_BASE}/v1/routes`, {
      headers: { Authorization: `Bearer ${authToken}` },
      data: {
        route_name: 'api_test_route',
        route_type: 'BACKEND',
        path: '/api/test/**',
        upstream_url: 'http://httpbin.org:80',
      },
    })
    expect(createResp.status()).toBe(200)
    const created = await createResp.json()
    const routeId = created.data?.id ?? created.id
    expect(routeId).toBeTruthy()

    const delResp = await request.delete(`${API_BASE}/v1/routes/${routeId}`, {
      headers: { Authorization: `Bearer ${authToken}` },
    })
    expect(delResp.status()).toBe(200)
  })

  test('list plugins', async ({ request }) => {
    const resp = await request.get(`${API_BASE}/v1/plugins`, {
      headers: { Authorization: `Bearer ${authToken}` },
      params: { page: 1, page_size: 10 },
    })
    expect(resp.status()).toBe(200)
  })

  test('list builtin types', async ({ request }) => {
    const resp = await request.get(`${API_BASE}/v1/plugins/builtin-types`, {
      headers: { Authorization: `Bearer ${authToken}` },
    })
    expect(resp.status()).toBe(200)
  })

  test('list roles', async ({ request }) => {
    const resp = await request.get(`${API_BASE}/v1/roles`, {
      headers: { Authorization: `Bearer ${authToken}` },
    })
    expect(resp.status()).toBe(200)
  })
})
