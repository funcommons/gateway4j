/**
 * S12-7c-T：SCG RouteDefinition YAML 序列化层测试（先红，RED 留原文）。
 *
 * 落点：src/views-v2/routes/scgYaml.ts（js-yaml 唯一落地口，动态 import 进懒加载
 * chunk —— 与旧 ingressYaml.ts 分层同构；纯模型层 scgModel.ts 保持零重依赖）。
 *
 * 验收标准（用户裁决）：「YAML 输出 SCG RouteDefinition YAML（可粘回 SCG 配置用）」——
 * 文档形态必须与 Spring Cloud Gateway application.yml 完全一致：
 *
 *   spring:
 *     cloud:
 *       gateway:
 *         routes:
 *           - id: my_route
 *             uri: http://user-service:8080
 *             predicates:
 *               - Path=/api/**
 *               - Host=api.example.com
 *             filters:
 *               - AddRequestHeader=X-Foo, bar
 *             order: 0
 *             metadata:
 *               team: core
 *
 * YAML→表单回填双向解析（解析失败行内报错不崩，带 1 基行号）。
 */
import { describe, it, expect } from 'vitest'

const YAML_PATH = '@/views-v2/routes/scgYaml'
type ScgYamlModule = typeof import('@/views-v2/routes/scgYaml')
async function loadYaml(): Promise<ScgYamlModule | null> {
  try {
    return (await import(/* @vite-ignore */ YAML_PATH)) as ScgYamlModule
  } catch {
    return null
  }
}

async function m(): Promise<ScgYamlModule> {
  const mod = await loadYaml()
  expect(mod, 'scgYaml.ts 模块缺失（RED 预期）').toBeTruthy()
  return mod as ScgYamlModule
}

/** 票面验收例文（逐字） */
const TICKET_EXAMPLE = [
  'spring:',
  '  cloud:',
  '    gateway:',
  '      routes:',
  '        - id: my_route',
  '          uri: http://user-service:8080',
  '          predicates:',
  '            - Path=/api/**',
  '            - Host=api.example.com',
  '          filters:',
  '            - AddRequestHeader=X-Foo, bar',
  '          order: 0',
  '          metadata:',
  '            team: core',
  ''
].join('\n')

function sampleRoutes(): import('@/views-v2/routes/scgModel').ScgRouteModel[] {
  return [
    {
      name: 'my_route',
      uri: 'http://user-service:8080',
      predicates: ['Path=/api/**', 'Host=api.example.com'],
      filters: ['AddRequestHeader=X-Foo, bar'],
      order: 0,
      metadata: '{\n  "team": "core"\n}'
    }
  ]
}

describe('S12-7c — dumpScgYaml：可粘回 SCG application.yml 的 RouteDefinition 形态', () => {
  it('票面例文逐要素出现（spring/cloud/gateway/routes + id/uri/predicates/filters/order/metadata）', async () => {
    const { dumpScgYaml } = await m()
    const text = dumpScgYaml(sampleRoutes())
    expect(text).toContain('spring:')
    expect(text).toContain('cloud:')
    expect(text).toContain('gateway:')
    expect(text).toContain('routes:')
    expect(text).toContain('- id: my_route')
    expect(text).toContain('uri: http://user-service:8080')
    expect(text).toContain('- Path=/api/**')
    expect(text).toContain('- Host=api.example.com')
    expect(text).toContain('- AddRequestHeader=X-Foo, bar')
    expect(text).toContain('order: 0')
    expect(text).toContain('metadata:')
    expect(text).toContain('team: core')
    // 旧 K8s Ingress 形态键不得再出现
    expect(text).not.toMatch(/^\s*spec:/m)
    expect(text).not.toMatch(/pathType:/m)
    expect(text).not.toMatch(/host:/m)
  })

  it('多路由逐条展开且保持顺序', async () => {
    const { dumpScgYaml } = await m()
    const routes = sampleRoutes()
    routes.push({ ...routes[0], name: 'second_route', uri: 'http://order-service:9090', metadata: '' })
    const text = dumpScgYaml(routes)
    expect(text.indexOf('id: my_route')).toBeGreaterThan(-1)
    expect(text.indexOf('id: second_route')).toBeGreaterThan(text.indexOf('id: my_route'))
    expect(text).toContain('uri: http://order-service:9090')
    // 空 metadata 不产出 metadata 键（模型层契约）
    const second = text.slice(text.indexOf('id: second_route'))
    expect(second).not.toContain('metadata:')
  })

  it('往返恒等：dump → load 回同一组路由（含 metadata 对象）', async () => {
    const { dumpScgYaml, loadScgYaml } = await m()
    const res = loadScgYaml(dumpScgYaml(sampleRoutes()))
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.routes).toStrictEqual(sampleRoutes())
  })
})

describe('S12-7c — loadScgYaml：YAML → 表单回填（宽容解析 + 行内报错）', () => {
  it('票面例文（逐字）回填成单条 SCG 路由', async () => {
    const { loadScgYaml } = await m()
    const res = loadScgYaml(TICKET_EXAMPLE)
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.routes.length).toBe(1)
    expect(res.routes[0].name).toBe('my_route')
    expect(res.routes[0].uri).toBe('http://user-service:8080')
    expect(res.routes[0].predicates).toStrictEqual(['Path=/api/**', 'Host=api.example.com'])
    expect(res.routes[0].filters).toStrictEqual(['AddRequestHeader=X-Foo, bar'])
    expect(res.routes[0].order).toBe(0)
    expect(JSON.parse(res.routes[0].metadata)).toStrictEqual({ team: 'core' })
  })

  it('空文本 / 纯空白 → ok 且空路由清单', async () => {
    const { loadScgYaml } = await m()
    for (const text of ['', '   \n  ']) {
      const res = loadScgYaml(text)
      expect(res.ok).toBe(true)
      if (res.ok) expect(res.routes).toStrictEqual([])
    }
  })

  it('非法 YAML → ok:false + 1 基行号（第 3 行错 → 3），不抛不崩', async () => {
    const { loadScgYaml } = await m()
    // 缩进错位（第 3 行多一格缩进）—— js-yaml mark 精确指向该行（旧 IngressForm 套件同款输入）
    const res = loadScgYaml('routes:\n  - id: x\n   bad: 1\n')
    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.line).toBe(3)
    // 未闭合流序列：mark 可能指向输入末尾，只要求 ok:false + 行号 ≥1（不崩）
    const res2 = loadScgYaml('a: b\n  c: [d\n')
    expect(res2.ok).toBe(false)
    if (!res2.ok) expect(res2.line).toBeGreaterThanOrEqual(1)
  })

  it('非映射根（数组 / 标量）→ 视为无路由，不崩', async () => {
    const { loadScgYaml } = await m()
    for (const text of ['- a\n- b\n', '42\n', 'just text\n']) {
      const res = loadScgYaml(text)
      expect(res.ok, `text=${JSON.stringify(text)} 应可解析`).toBe(true)
      if (res.ok) expect(res.routes).toStrictEqual([])
    }
  })
})
