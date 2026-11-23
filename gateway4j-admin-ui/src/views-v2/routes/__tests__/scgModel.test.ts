/**
 * S12-7c-T：SCG 路由列表编辑器【纯模型层】测试（先红，RED 留原文）。
 *
 * 票面裁决（用户原文）：「路由创建要 100% Spring Cloud Gateway 对齐」「表单主体=纯 SCG
 * 路由列表编辑器」「YAML 输出 SCG RouteDefinition YAML（可粘回 SCG 配置用）」。
 * 落点：src/views-v2/routes/scgModel.ts（无副作用、无框架依赖、零重依赖 —— js-yaml 在
 * scgYaml.ts 动态 chunk，与旧 ingressModel/ingressYaml 分层同构）。
 *
 * 契约来源：后端 S12-7b POST /v1/routes/batch（gateway4j-admin RouteController
 * BatchCreateRequest/BatchRouteRequest + RouteBatchService，frontend 侧字段逐字对齐）：
 * - routes[] 每项 = { name, uri, predicates[], filters[], order, metadata, environment, remark, tags }
 * - name: ^[a-zA-Z0-9_]{2,50}$；uri: ^https?://\S+$（与后端 @Pattern 同口径，前端轻校验）
 * - 每条路由至多一个 Path= 谓词；Path=/a,/b 多 pattern 前端即拒（后端 10100 同口径）
 * - Path= 值须以 / 开头、不含空白；谓词/filter 定义串 ≤500（DDL VARCHAR(500)）
 * - 同环境批内重名 → 后端 10609 整单拒收（前端预检同口径）
 * - environment: ^[a-z0-9_-]{1,20}$，缺省 default（Route.DEFAULT_ENVIRONMENT）
 * - metadata: JSON object（gw_route.metadata JSONB）；前端以 JSON 文本编辑、提交时 parse
 * - 全局 environment/remark/tags 应用于本批每条路由（UI 全局一处，载荷逐条携带）
 */
import { describe, it, expect } from 'vitest'

// —— 变量路径动态导入（模块缺失 → 运行时解析失败 = 合法 RED，文件收集不炸；
//     与 ScgRoutesForm.test.ts / 旧 IngressForm.test.ts 同法）——
const MODEL_PATH = '@/views-v2/routes/scgModel'
type ScgModelModule = typeof import('@/views-v2/routes/scgModel')
async function loadModel(): Promise<ScgModelModule | null> {
  try {
    return (await import(/* @vite-ignore */ MODEL_PATH)) as ScgModelModule
  } catch {
    return null
  }
}

async function m(): Promise<ScgModelModule> {
  const mod = await loadModel()
  expect(mod, 'scgModel.ts 模块缺失（RED 预期）').toBeTruthy()
  return mod as ScgModelModule
}

/** 最小合法单条路由（可逐字段覆盖） */
function route(overrides: Partial<import('@/views-v2/routes/scgModel').ScgRouteModel> = {}) {
  return {
    name: 'my_route',
    uri: 'http://user-service:8080',
    predicates: ['Path=/api/**'],
    filters: [] as string[],
    order: 0,
    metadata: '',
    ...overrides
  }
}

/** 最小合法整页模型 */
async function validModel(
  overrides: Partial<import('@/views-v2/routes/scgModel').ScgModel> = {}
): Promise<import('@/views-v2/routes/scgModel').ScgModel> {
  await m()
  return {
    environment: 'default',
    remark: '',
    tags: '',
    routes: [route()],
    ...overrides
  }
}

describe('S12-7c — 空模型骨架', () => {
  it('emptyScgModel：一条空路由 + environment 缺省 default + 其余空', async () => {
    const { emptyScgModel } = await m()
    const model = emptyScgModel()
    expect(model.environment).toBe('default')
    expect(model.remark).toBe('')
    expect(model.tags).toBe('')
    expect(model.routes.length).toBe(1)
    expect(model.routes[0]).toStrictEqual({
      name: '',
      uri: '',
      predicates: [],
      filters: [],
      order: 0,
      metadata: ''
    })
  })

  it('emptyScgRoute：SCG RouteDefinition 六字段骨架', async () => {
    const { emptyScgRoute } = await m()
    expect(emptyScgRoute()).toStrictEqual({
      name: '',
      uri: '',
      predicates: [],
      filters: [],
      order: 0,
      metadata: ''
    })
  })
})

describe('S12-7c — buildBatchPayload：POST /v1/routes/batch 请求体逐字对齐', () => {
  it('payload 形状：routes[] 每项恰 9 键（name/uri/predicates/filters/order/metadata/environment/remark/tags）', async () => {
    const { buildBatchPayload } = await m()
    const model = await validModel({
      environment: 'prod',
      remark: 'demo',
      tags: 'core,api',
      routes: [
        route({ metadata: '{"team":"core"}', order: 3, filters: ['AddRequestHeader=X-Foo, bar'] })
      ]
    })
    const payload = buildBatchPayload(model)
    expect(Object.keys(payload).sort()).toStrictEqual(['routes'])
    expect(payload.routes.length).toBe(1)
    const entry = payload.routes[0]
    expect(Object.keys(entry).sort()).toStrictEqual(
      ['environment', 'filters', 'metadata', 'name', 'order', 'predicates', 'remark', 'tags', 'uri'].sort()
    )
    expect(entry).toStrictEqual({
      name: 'my_route',
      uri: 'http://user-service:8080',
      predicates: ['Path=/api/**'],
      filters: ['AddRequestHeader=X-Foo, bar'],
      order: 3,
      metadata: { team: 'core' },
      environment: 'prod',
      remark: 'demo',
      tags: 'core,api'
    })
  })

  it('全局 environment/remark/tags 应用于本批每条路由；缺省环境回落 default', async () => {
    const { buildBatchPayload } = await m()
    const payload = buildBatchPayload(
      await validModel({
        environment: '',
        remark: 'r',
        tags: 't',
        routes: [route({ name: 'a_one' }), route({ name: 'b_two', uri: 'http://order:9090' })]
      })
    )
    expect(payload.routes.map((r) => r.name)).toStrictEqual(['a_one', 'b_two'])
    for (const entry of payload.routes) {
      expect(entry.environment).toBe('default')
      expect(entry.remark).toBe('r')
      expect(entry.tags).toBe('t')
    }
  })

  it('name/uri/remark/tags/env trim；谓词与过滤器空行丢弃、其余 trim 原样提交', async () => {
    const { buildBatchPayload } = await m()
    const payload = buildBatchPayload(
      await validModel({
        remark: '  r  ',
        routes: [
          route({
            name: '  my_route  ',
            uri: '  http://user-service:8080  ',
            predicates: ['  Path=/api/**  ', '   ', 'Host=api.example.com'],
            filters: ['', 'StripPrefix=1']
          })
        ]
      })
    )
    const entry = payload.routes[0]
    expect(entry.name).toBe('my_route')
    expect(entry.uri).toBe('http://user-service:8080')
    expect(entry.remark).toBe('r')
    expect(entry.predicates).toStrictEqual(['Path=/api/**', 'Host=api.example.com'])
    expect(entry.filters).toStrictEqual(['StripPrefix=1'])
  })

  it('metadata：JSON 文本 parse 成对象；空文本 → {}；非法文本不出现在合法载荷里（校验前置）', async () => {
    const { buildBatchPayload, parseMetadataObject } = await m()
    expect(parseMetadataObject('{"team":"core"}')).toStrictEqual({ team: 'core' })
    expect(parseMetadataObject('')).toStrictEqual({})
    expect(parseMetadataObject('{oops')).toBeNull()
    expect(parseMetadataObject('[1,2]')).toBeNull()
    expect(parseMetadataObject('"str"')).toBeNull()
    const payload = buildBatchPayload(await validModel({ routes: [route({ metadata: '' })] }))
    expect(payload.routes[0].metadata).toStrictEqual({})
  })

  it('order：整数原样；非整数在模型里不被构造（payload 兜底 0）', async () => {
    const { buildBatchPayload } = await m()
    const payload = buildBatchPayload(await validModel({ routes: [route({ order: -5 })] }))
    expect(payload.routes[0].order).toBe(-5)
    const fallback = buildBatchPayload(await validModel({ routes: [route({ order: Number.NaN })] }))
    expect(fallback.routes[0].order).toBe(0)
  })
})

describe('S12-7c — validateScgModel：与后端 10100/10609 同口径的前端轻校验', () => {
  it('合法模型 → 零错误', async () => {
    const { validateScgModel } = await m()
    expect(validateScgModel(await validModel())).toStrictEqual([])
  })

  it('name 缺失 → nameRequired；非法（a! / 1 位 / 51 位）→ nameInvalid；带路由定位参数', async () => {
    const { validateScgModel } = await m()
    expect(validateScgModel(await validModel({ routes: [route({ name: '' })] }))).toStrictEqual([
      { key: 'nameRequired', params: { route: '#1' } }
    ])
    for (const bad of ['a!', 'a', 'x'.repeat(51)]) {
      const errs = validateScgModel(await validModel({ routes: [route({ name: bad })] }))
      expect(errs.some((e) => e.key === 'nameInvalid'), `name=${bad} 应报 nameInvalid`).toBe(true)
      expect(errs.find((e) => e.key === 'nameInvalid')!.params!.route).toBe(bad)
    }
  })

  it('uri 缺失 → uriRequired；缺 scheme / ftp / 含空白 → uriInvalid', async () => {
    const { validateScgModel } = await m()
    const cases: string[] = ['', 'user-service:8080', 'ftp://user-service:8080', 'http://user service:8080']
    for (const bad of cases) {
      const errs = validateScgModel(await validModel({ routes: [route({ uri: bad })] }))
      expect(
        errs.some((e) => e.key === (bad === '' ? 'uriRequired' : 'uriInvalid')),
        `uri=${bad} 应报错`
      ).toBe(true)
    }
  })

  it('每条路由至多一个 Path= 谓词 → pathMulti（含两个冲突定义串参数）', async () => {
    const { validateScgModel } = await m()
    const errs = validateScgModel(
      await validModel({ routes: [route({ predicates: ['Path=/a', 'Path=/b/**'] })] })
    )
    const hit = errs.find((e) => e.key === 'pathMulti')
    expect(hit, '双 Path= 必须报 pathMulti').toBeDefined()
    expect(hit!.params!.a).toBe('Path=/a')
    expect(hit!.params!.b).toBe('Path=/b/**')
  })

  it('Path=/a,/b 多 pattern → pathMultiPattern（前端即拒，与后端 10100 同口径）', async () => {
    const { validateScgModel } = await m()
    const errs = validateScgModel(await validModel({ routes: [route({ predicates: ['Path=/a,/b'] })] }))
    const hit = errs.find((e) => e.key === 'pathMultiPattern')
    expect(hit, '多 pattern 必须报 pathMultiPattern').toBeDefined()
    expect(hit!.params!.value).toBe('Path=/a,/b')
  })

  it('Path= 值非法：空 → pathEmpty；不以 / 开头 / 含空白 → pathInvalid', async () => {
    const { validateScgModel } = await m()
    expect(
      validateScgModel(await validModel({ routes: [route({ predicates: ['Path='] })] })).some(
        (e) => e.key === 'pathEmpty'
      )
    ).toBe(true)
    expect(
      validateScgModel(await validModel({ routes: [route({ predicates: ['Path=abc'] })] })).some(
        (e) => e.key === 'pathInvalid'
      )
    ).toBe(true)
    expect(
      validateScgModel(await validModel({ routes: [route({ predicates: ['Path=/a b'] })] })).some(
        (e) => e.key === 'pathInvalid'
      )
    ).toBe(true)
  })

  it('定义串 >500（谓词 / 过滤器）→ defTooLong（DDL VARCHAR(500) 同口径）', async () => {
    const { validateScgModel } = await m()
    const long = 'Header=X,' + 'y'.repeat(500)
    expect(
      validateScgModel(await validModel({ routes: [route({ predicates: [long] })] })).some(
        (e) => e.key === 'defTooLong'
      )
    ).toBe(true)
    expect(
      validateScgModel(await validModel({ routes: [route({ filters: [long] })] })).some(
        (e) => e.key === 'defTooLong'
      )
    ).toBe(true)
  })

  it('order 非整数（NaN / 1.5）→ orderInvalid；负整数合法', async () => {
    const { validateScgModel } = await m()
    expect(
      validateScgModel(await validModel({ routes: [route({ order: Number.NaN })] })).some(
        (e) => e.key === 'orderInvalid'
      )
    ).toBe(true)
    expect(
      validateScgModel(await validModel({ routes: [route({ order: 1.5 })] })).some(
        (e) => e.key === 'orderInvalid'
      )
    ).toBe(true)
    expect(validateScgModel(await validModel({ routes: [route({ order: -2 })] }))).toStrictEqual([])
  })

  it('metadata 非法 JSON / 非对象 → metadataInvalid', async () => {
    const { validateScgModel } = await m()
    for (const bad of ['{oops', '[1,2]', '"str"']) {
      const errs = validateScgModel(await validModel({ routes: [route({ metadata: bad })] }))
      expect(errs.some((e) => e.key === 'metadataInvalid'), `metadata=${bad} 应报 metadataInvalid`).toBe(true)
    }
  })

  it('批内同环境重名 → dupName（后端 10609 整单拒收的预检）；不同名不报', async () => {
    const { validateScgModel } = await m()
    const errs = validateScgModel(
      await validModel({ routes: [route({ name: 'dup' }), route({ name: 'dup', uri: 'http://b:2' })] })
    )
    const hit = errs.find((e) => e.key === 'dupName')
    expect(hit, '批内重名必须报 dupName').toBeDefined()
    expect(String(hit!.params!.names)).toContain('dup')
    expect(
      validateScgModel(
        await validModel({ routes: [route({ name: 'a_one' }), route({ name: 'b_two', uri: 'http://b:2' })] })
      )
    ).toStrictEqual([])
  })

  it('environment 非法（大写 / 超长 / 空白）→ envInvalid；空串回落 default 不报', async () => {
    const { validateScgModel } = await m()
    for (const bad of ['DEFAULT', 'a'.repeat(21), 'de faul']) {
      const errs = validateScgModel(await validModel({ environment: bad }))
      expect(errs.some((e) => e.key === 'envInvalid'), `environment=${bad} 应报 envInvalid`).toBe(true)
    }
    expect(validateScgModel(await validModel({ environment: '' }))).toStrictEqual([])
  })

  it('多条路由各自的错误互不遮蔽（逐条定位）', async () => {
    const { validateScgModel } = await m()
    const errs = validateScgModel(
      await validModel({ routes: [route({ name: 'bad name' }), route({ name: 'ok_two', uri: '' })] })
    )
    expect(errs.some((e) => e.key === 'nameInvalid' && e.params!.route === 'bad name')).toBe(true)
    expect(errs.some((e) => e.key === 'uriRequired' && e.params!.route === 'ok_two')).toBe(true)
  })
})

describe('S12-7c — YAML 文档映射：SCG RouteDefinition 形态（id/uri/predicates/filters/order/metadata）', () => {
  it('modelToYamlDoc：spring.cloud.gateway.routes 包裹 + id 键（非 name）+ metadata 对象', async () => {
    const { modelToYamlDoc } = await m()
    const doc = modelToYamlDoc([
      route({ metadata: '{"team":"core"}', filters: ['AddRequestHeader=X-Foo, bar'], order: 2 })
    ])
    const routes = (doc as any).spring.cloud.gateway.routes
    expect(Array.isArray(routes)).toBe(true)
    expect(routes[0]).toStrictEqual({
      id: 'my_route',
      uri: 'http://user-service:8080',
      predicates: ['Path=/api/**'],
      filters: ['AddRequestHeader=X-Foo, bar'],
      order: 2,
      metadata: { team: 'core' }
    })
  })

  it('modelToYamlDoc：空 metadata 不产出 metadata 键（粘回 SCG 更干净）', async () => {
    const { modelToYamlDoc } = await m()
    const doc = modelToYamlDoc([route({ metadata: '' })])
    expect((doc as any).spring.cloud.gateway.routes[0]).not.toHaveProperty('metadata')
  })

  it('yamlDocToRoutes：票面 YAML 例文逐字段回填（id→name / metadata 对象→JSON 文本）', async () => {
    const { yamlDocToRoutes } = await m()
    const routes = yamlDocToRoutes({
      spring: {
        cloud: {
          gateway: {
            routes: [
              {
                id: 'my_route',
                uri: 'http://user-service:8080',
                predicates: ['Path=/api/**', 'Host=api.example.com'],
                filters: ['AddRequestHeader=X-Foo, bar'],
                order: 0,
                metadata: { team: 'core' }
              }
            ]
          }
        }
      }
    })
    expect(routes.length).toBe(1)
    expect(routes[0].name).toBe('my_route')
    expect(routes[0].uri).toBe('http://user-service:8080')
    expect(routes[0].predicates).toStrictEqual(['Path=/api/**', 'Host=api.example.com'])
    expect(routes[0].filters).toStrictEqual(['AddRequestHeader=X-Foo, bar'])
    expect(routes[0].order).toBe(0)
    expect(JSON.parse(routes[0].metadata)).toStrictEqual({ team: 'core' })
  })

  it('yamlDocToRoutes：宽容解析 —— 顶层 routes 兜底 / 非串谓词项丢弃 / 缺字段回落 / 空文档 → []', async () => {
    const { yamlDocToRoutes } = await m()
    // 顶层 routes（局部粘贴形态）
    const top = yamlDocToRoutes({ routes: [{ id: 't1', uri: 'http://t:1' }] })
    expect(top.length).toBe(1)
    expect(top[0].name).toBe('t1')
    // 缺字段回落 + 非串谓词项丢弃
    const loose = yamlDocToRoutes({
      spring: { cloud: { gateway: { routes: [{ id: 'l', predicates: ['Path=/a', { name: 'Host' }, 42] }] } } }
    })
    expect(loose[0].predicates).toStrictEqual(['Path=/a'])
    expect(loose[0].uri).toBe('')
    expect(loose[0].order).toBe(0)
    // 空文档 / 结构缺失
    expect(yamlDocToRoutes({})).toStrictEqual([])
    expect(yamlDocToRoutes(null)).toStrictEqual([])
  })
})
