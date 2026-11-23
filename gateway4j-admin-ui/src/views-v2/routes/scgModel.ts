/**
 * S12-7c：纯 SCG 路由列表编辑器的【纯模型层】（无副作用、无框架依赖、零重依赖）。
 *
 * 替代旧 ingressModel.ts（K8s Ingress 形态随 S12-7c 下线）。分层理由与旧文件一致：
 * 纯逻辑（载荷构造 / 校验 / YAML 文档映射）单独成模块 → 可单测、可复用；YAML 序列化
 * （js-yaml）另立 scgYaml.ts 动态 import → js-yaml 只进懒加载 chunk，不进主 bundle。
 *
 * 契约来源：后端 S12-7b POST /v1/routes/batch（RouteController.BatchCreateRequest /
 * BatchRouteRequest + RouteBatchService；契约 §19.1「SCG RouteDefinition 1:1」）。
 * 一条路由 = 一条 SCG RouteDefinition：
 *   { name, uri, predicates[], filters[], order, metadata, environment, remark, tags }
 * - name: ^[a-zA-Z0-9_]{2,50}$；uri: ^https?://\S+$（与后端 @Pattern 同口径的前端轻校验）
 * - 每条路由至多一个 Path= 谓词；Path=/a,/b 多 pattern 拒收；Path= 值以 / 开头、不含空白
 * - 谓词 / filter 定义串 ≤500（gw_route_filter / gw_route_predicate 的 VARCHAR(500)）
 * - 批内同环境重名 → 后端 10609 整单拒收（前端预检同口径）
 * - environment: ^[a-z0-9_-]{1,20}$，缺省 default（Route.DEFAULT_ENVIRONMENT；后端只认小写）
 * - metadata: JSON object → gw_route.metadata（JSONB）；前端以 JSON 文本编辑、提交时 parse
 * - UI 全局的 environment/remark/tags 应用于本批每条路由（载荷逐条携带，后端无顶层字段）
 *
 * YAML 文档形态 = SCG application.yml 原生形态（验收标准：可整段粘回 SCG 配置直接用）：
 *   spring.cloud.gateway.routes[] 每项 { id, uri, predicates[], filters[], order, metadata? }
 *   —— id 即路由名（SCG RouteDefinition.id 与批量 API 的 name 同物；YAML 键名钉死 id）。
 *   全局 environment/remark/tags 不属于 SCG RouteDefinition，不进 YAML 文档。
 */

/** 一条 SCG 路由的表单模型（= 一条 SCG RouteDefinition 的 UI 形态） */
export interface ScgRouteModel {
  /** 路由名（批量 API 字段 name；YAML 里对应 SCG RouteDefinition.id） */
  name: string
  /** 完整上游地址（scheme://host[:port]，与 SCG RouteDefinition.uri 同名同义） */
  uri: string
  /** SCG 原生谓词定义串行（`Path=/api/**`、`Host=api.example.com` 形态；行序即提交序） */
  predicates: string[]
  /** SCG 原生 filter 定义串行（`AddRequestHeader=X-Foo, bar` 形态；行序即执行序） */
  filters: string[]
  /** 与 SCG RouteDefinition.order 同名同义（整数，可负） */
  order: number
  /** metadata JSON 对象文本（编辑态为文本，提交时 parse；空串 = 无 metadata） */
  metadata: string
}

/** 整页表单模型（YAML 视图只覆盖 routes；全局三字段不进 SCG 文档） */
export interface ScgModel {
  /** 缺省 default（Route.DEFAULT_ENVIRONMENT；后端 ^[a-z0-9_-]{1,20}$ 只认小写） */
  environment: string
  remark: string
  tags: string
  routes: ScgRouteModel[]
}

/** 名称正则（后端 @Pattern 同口径：^[a-zA-Z0-9_]{2,50}$） */
export const SCG_NAME_RE = /^[a-zA-Z0-9_]{2,50}$/
/** 上游地址正则（后端 @Pattern 同口径：^https?://\S+$） */
export const SCG_URI_RE = /^https?:\/\/\S+$/
/** 环境正则（后端 Route.ENVIRONMENT_PATTERN 同口径：^[a-z0-9_-]{1,20}$） */
export const SCG_ENV_RE = /^[a-z0-9_-]{1,20}$/
/** SCG Path 谓词定义串前缀（名字大小写敏感，= SCG PathRoutePredicateFactory#name()） */
export const PATH_PREDICATE_PREFIX = 'Path='
/** 定义串最大长度（DDL VARCHAR(500) 同口径，超长入库必炸 → 前置拒收） */
export const MAX_DEFINITION_LENGTH = 500

/** 空路由行（SCG RouteDefinition 六字段骨架） */
export function emptyScgRoute(): ScgRouteModel {
  return { name: '', uri: '', predicates: [], filters: [], order: 0, metadata: '' }
}

/** 空模型（一条空路由 + environment 缺省 default） */
export function emptyScgModel(): ScgModel {
  return { environment: 'default', remark: '', tags: '', routes: [emptyScgRoute()] }
}

/* ── metadata JSON 文本 ⇄ 对象 ──────────────────────────────────────────── */

/**
 * metadata JSON 文本 → 对象：合法 JSON object → 对象；空/纯空白 → {}（无 metadata）；
 * 其余（语法错 / 数组 / 标量）→ null（校验报 metadataInvalid，载荷不携带）。
 */
export function parseMetadataObject(text: string): Record<string, unknown> | null {
  const raw = String(text ?? '').trim()
  if (raw === '') return {}
  try {
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
    return null
  } catch {
    return null
  }
}

/* ── 定义串清洗（后端 RouteBatchService#sanitizeDefinitions 同口径）────────── */

/** trim → 丢弃空串；其余原样（SCG 原生定义串不做语义清洗） */
export function sanitizeDefinitions(list: string[]): string[] {
  return (list ?? [])
    .map((d) => String(d ?? '').trim())
    .filter((d) => d !== '')
}

/* ── 校验（与后端 10100/10609 同口径的前端轻校验）────────────────────────── */

/** 一条校验错误：i18n key + 插值参数（组件层负责 t() 翻译） */
export interface ScgValidationError {
  key: string
  params?: Record<string, unknown>
}

/** 路由定位标签（错误文案前缀）：有名用名，无名用 #序号 */
export function routeLabel(route: ScgRouteModel, index: number): string {
  const name = String(route?.name ?? '').trim()
  return name !== '' ? name : `#${index + 1}`
}

/** Path= 谓词值（定义串 `Path=` 之后的部分，trim 后） */
function pathValueOf(definition: string): string {
  return definition.slice(PATH_PREDICATE_PREFIX.length).trim()
}

/** 单条路由的校验（字段级 + Path= 结构级，与 RouteBatchService#buildPlan 同口径） */
function validateRoute(route: ScgRouteModel, index: number): ScgValidationError[] {
  const errs: ScgValidationError[] = []
  const where = { route: routeLabel(route, index) }
  const name = String(route.name ?? '').trim()
  if (name === '') errs.push({ key: 'nameRequired', params: where })
  else if (!SCG_NAME_RE.test(name)) errs.push({ key: 'nameInvalid', params: where })

  const uri = String(route.uri ?? '').trim()
  if (uri === '') errs.push({ key: 'uriRequired', params: where })
  else if (!SCG_URI_RE.test(uri)) errs.push({ key: 'uriInvalid', params: where })

  if (!Number.isInteger(route.order)) errs.push({ key: 'orderInvalid', params: where })

  const metaText = String(route.metadata ?? '').trim()
  if (metaText !== '' && parseMetadataObject(metaText) === null) {
    errs.push({ key: 'metadataInvalid', params: where })
  }

  const predicates = sanitizeDefinitions(route.predicates)
  const pathDefs = predicates.filter((d) => d.startsWith(PATH_PREDICATE_PREFIX))
  if (pathDefs.length > 1) {
    errs.push({ key: 'pathMulti', params: { ...where, a: pathDefs[0], b: pathDefs[1] } })
  }
  for (const definition of pathDefs) {
    const value = pathValueOf(definition)
    if (value === '') errs.push({ key: 'pathEmpty', params: { ...where, value: definition } })
    else if (value.includes(',')) {
      errs.push({ key: 'pathMultiPattern', params: { ...where, value: definition } })
    } else if (/\s/.test(value) || !value.startsWith('/')) {
      errs.push({ key: 'pathInvalid', params: { ...where, value: definition } })
    }
  }
  for (const definition of predicates) {
    if (definition.length > MAX_DEFINITION_LENGTH) {
      errs.push({ key: 'defTooLong', params: { ...where, value: definition } })
    }
  }
  for (const definition of sanitizeDefinitions(route.filters)) {
    if (definition.length > MAX_DEFINITION_LENGTH) {
      errs.push({ key: 'defTooLong', params: { ...where, value: definition } })
    }
  }
  return errs
}

/** 整页校验：逐条路由 + environment + 批内同环境重名（10609 预检） */
export function validateScgModel(model: ScgModel): ScgValidationError[] {
  const errs: ScgValidationError[] = []
  const environment = String(model.environment ?? '').trim()
  if (environment !== '' && !SCG_ENV_RE.test(environment)) {
    errs.push({ key: 'envInvalid' })
  }
  model.routes.forEach((route, index) => errs.push(...validateRoute(route, index)))

  // 批内重名预检（后端 uk_route_environment_name：同环境内同名即冲突，整单拒收）
  const seen = new Map<string, number>()
  const dups = new Set<string>()
  for (const route of model.routes) {
    const name = String(route.name ?? '').trim()
    if (name === '') continue
    const n = seen.get(name) ?? 0
    if (n >= 1) dups.add(name)
    seen.set(name, n + 1)
  }
  if (dups.size > 0) {
    errs.push({ key: 'dupName', params: { names: [...dups].join(', ') } })
  }
  return errs
}

/* ── API 载荷（POST /v1/routes/batch 请求体，逐字对齐 BatchRouteRequest）────── */

/** 批量建路由请求体里的单条路由（键名与后端 @JsonProperty 逐字一致） */
export interface ScgBatchRoutePayload {
  name: string
  uri: string
  predicates: string[]
  filters: string[]
  order: number
  metadata: Record<string, unknown>
  environment: string
  remark: string
  tags: string
}

/** 批量建路由请求体 */
export interface ScgBatchPayload {
  routes: ScgBatchRoutePayload[]
}

/**
 * 表单模型 → API 载荷。全局 environment/remark/tags 应用于本批每条路由；
 * metadata 非法时兜底 {}（合法走 validateScgModel 前置拦截，此处只为不抛）。
 */
export function buildBatchPayload(model: ScgModel): ScgBatchPayload {
  const environment = String(model.environment ?? '').trim() || 'default'
  const remark = String(model.remark ?? '').trim()
  const tags = String(model.tags ?? '').trim()
  return {
    routes: model.routes.map((route) => ({
      name: String(route.name ?? '').trim(),
      uri: String(route.uri ?? '').trim(),
      predicates: sanitizeDefinitions(route.predicates),
      filters: sanitizeDefinitions(route.filters),
      order: Number.isInteger(route.order) ? route.order : 0,
      metadata: parseMetadataObject(route.metadata) ?? {},
      environment,
      remark,
      tags
    }))
  }
}

/* ── YAML 文档映射（表单 ⇄ SCG RouteDefinition YAML 双向同步的纯映射层）──────── */

/**
 * 路由模型数组 → YAML 文档对象（SCG application.yml 原生形态）：
 *   { spring: { cloud: { gateway: { routes: [...] } } } }
 * 每项 { id, uri, predicates, filters, order, metadata? } —— id 即路由名；
 * metadata 仅在解析为非空对象时产出（粘回 SCG 更干净）；空 metadata 不产出键。
 */
export function modelToYamlDoc(routes: ScgRouteModel[]): Record<string, unknown> {
  const list = routes.map((route) => {
    const def: Record<string, unknown> = {
      id: String(route.name ?? '').trim(),
      uri: String(route.uri ?? '').trim(),
      predicates: sanitizeDefinitions(route.predicates),
      filters: sanitizeDefinitions(route.filters),
      order: Number.isInteger(route.order) ? route.order : 0
    }
    const meta = parseMetadataObject(route.metadata)
    if (meta !== null && Object.keys(meta).length > 0) def.metadata = meta
    return def
  })
  return { spring: { cloud: { gateway: { routes: list } } } }
}

/** 宽松取串（YAML 里 uri/id 可能是数字等非串值 → 转字符串；其余回落空串） */
function str(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'string') return v
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  return ''
}

function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
}

/**
 * YAML 文档对象 → 路由模型数组（宽容解析：缺字段回落默认，不抛）。
 * - 文档形态优先 `spring.cloud.gateway.routes`（完整 SCG 配置整段粘贴），
 *   退化顶层 `routes`（只粘 routes 列表的局部形态）；
 * - 谓词 / 过滤器只收字符串项（SCG 对象形态 `{name, args}` 不在本票范围，丢弃不崩）；
 * - metadata 对象 → 两空格缩进 JSON 文本回填编辑框；无/非法 → 空串。
 */
export function yamlDocToRoutes(doc: unknown): ScgRouteModel[] {
  const d = obj(doc)
  const gateway = obj(obj(obj(d.spring).cloud).gateway)
  const rawRoutes = Array.isArray(gateway.routes)
    ? gateway.routes
    : Array.isArray(d.routes)
      ? d.routes
      : []
  return rawRoutes.map((r) => {
    const ro = obj(r)
    const strList = (v: unknown): string[] =>
      (Array.isArray(v) ? v : []).filter((x) => typeof x === 'string').map((x) => String(x))
    let metadata = ''
    const meta = ro.metadata
    if (meta !== null && meta !== undefined && typeof meta === 'object' && !Array.isArray(meta)) {
      metadata = JSON.stringify(meta, null, 2)
    }
    const rawOrder = ro.order
    const order =
      typeof rawOrder === 'number' && Number.isFinite(rawOrder) ? Math.trunc(rawOrder) : 0
    return {
      name: str(ro.id),
      uri: str(ro.uri),
      predicates: strList(ro.predicates),
      filters: strList(ro.filters),
      order,
      metadata
    }
  })
}
