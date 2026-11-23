/**
 * S12-4：K8s Ingress 风格路由创建单页的【纯模型层】（无副作用、无框架依赖）。
 *
 * 分层理由（与 src/views-v2/routes/routePathMapping.ts 的先例一致）：
 * - 纯逻辑（路径翻译 / 上游合成 / 载荷构造 / YAML 文档映射）单独成模块 → 可单测、可复用，
 *   且不把任何 import 白名单约束扩散到既有文件（既有 routePathMapping.ts 的白名单钉死
 *   RouteEditForm.vue 的 @/api/routes import 面，本模块不复用那个通道）。
 * - YAML 序列化（js-yaml）另立 ingressYaml.ts —— js-yaml 只在动态 chunk 里，
 *   不进主 bundle（本模块保持零重依赖）。
 *
 * 契约来源：docs/ui-v2/实施契约.md §10（S12 批）。
 * - pathType 三值：PREFIX → `/api/**`；EXACT → 原样；IMPLEMENTATION_SPECIFIC → 原样。
 * - upstream_url **不由前端合成**：后端按 §10 契约从 backend.service + backend.port 生成
 *   （后端唯一真相源，见 buildIngressPayload 头注）。
 */

import type { IngressPathType, IngressRoutePayload } from '@/api/routes'

export type { IngressPathType }

/** 一条 path 的表单模型 */
export interface IngressPathModel {
  /** 用户直填路径（PREFIX 存基路径如 `/api`；EXACT / IMPLEMENTATION_SPECIFIC 存原文） */
  path: string
  pathType: IngressPathType
  backend: { service: string; port: string }
}

/** 一条 rule 的表单模型（= 一个 host + 若干 paths） */
export interface IngressRuleModel {
  /** 可空 = 不限域名 */
  host: string
  paths: IngressPathModel[]
}

/** 插件绑定（SCG filters ↔ gateway4j 插件） */
export interface IngressPluginModel {
  plugin_id: string
  binding_config: string
}

/** 整页表单模型（= YAML 视图与 API 载荷的唯一事实源） */
export interface IngressModel {
  name: string
  environment: string
  remark: string
  tags: string
  rules: IngressRuleModel[]
  plugins: IngressPluginModel[]
  /** 路由级 SCG 谓词定义串（Host=**.example.com 形态） */
  predicates: string[]
}

/** pathType 三值（值域钉死；下拉 label 走 i18n，value 原样枚举） */
export const PATH_TYPES: IngressPathType[] = ['PREFIX', 'EXACT', 'IMPLEMENTATION_SPECIFIC']

/** 名称正则（§10：route_name 须合 ^[a-zA-Z0-9_]{2,50}$） */
export const INGRESS_NAME_RE = /^[a-zA-Z0-9_]{2,50}$/

/** 空模型（一条规则 + 一条路径，K8s 骨架） */
export function emptyIngressModel(): IngressModel {
  return {
    name: '',
    environment: 'default',
    remark: '',
    tags: '',
    rules: [{ host: '', paths: [{ path: '', pathType: 'PREFIX', backend: { service: '', port: '' } }] }],
    plugins: [],
    predicates: []
  }
}

/** 空 path 行 */
export function emptyIngressPath(): IngressPathModel {
  return { path: '', pathType: 'PREFIX', backend: { service: '', port: '' } }
}

/**
 * path 形态翻译（提交时跑）：
 * PREFIX → 摘尾 `/**`/`/*` 与尾斜杠后补 `/**`（SCG PathPattern 零段匹配）；
 * EXACT / IMPLEMENTATION_SPECIFIC → 原文不变形（正则 / PathPattern 片段可能合法含 `/**`，禁清洗）。
 */
export function translatedPath(raw: string, pathType: IngressPathType): string {
  const p = String(raw ?? '').trim()
  if (!p) return ''
  if (pathType !== 'PREFIX') return p
  const base = p.replace(/\/\*\*?$/, '').replace(/\/+$/, '')
  return `${base}/**`
}

/**
 * 表单模型 → API 载荷（§10 POST /v1/routes/ingress 请求体，逐字对齐）。
 *
 * upstream_url 口径（S12-4 收口裁决）：**前端不合成、不携带** —— 后端按 §10 契约从
 * backend.service + backend.port 自行合成（后端是唯一真相源）。前端再带一份 = 两个真相源，
 * 合成规则一旦分叉即静默不一致。
 */
export function buildIngressPayload(model: IngressModel): IngressRoutePayload {
  return {
    name: String(model.name ?? '').trim(),
    environment: String(model.environment ?? '').trim() || 'default',
    remark: String(model.remark ?? '').trim(),
    tags: String(model.tags ?? '').trim(),
    rules: model.rules.map((rule) => ({
      host: String(rule.host ?? '').trim(),
      paths: rule.paths.map((p) => {
        const service = String(p.backend?.service ?? '').trim()
        const port = String(p.backend?.port ?? '').trim()
        return {
          path: translatedPath(p.path, p.pathType),
          pathType: p.pathType,
          backend: { service, port }
        }
      })
    })),
    plugins: model.plugins.map((p) => ({
      plugin_id: p.plugin_id,
      binding_config: p.binding_config && p.binding_config.trim() !== '' ? p.binding_config : '{}'
    })),
    predicates: model.predicates.map((p) => String(p ?? '').trim()).filter((p) => p !== '')
  }
}

/* ── YAML 文档映射（表单 ⇄ YAML 双向同步的纯映射层）───────────────────────── */

/** 表单模型 → YAML 文档对象（K8s 风格：metadata / spec.rules / spec.filters / spec.predicates） */
export function modelToYamlDoc(model: IngressModel): Record<string, unknown> {
  return {
    metadata: {
      name: model.name,
      environment: model.environment,
      remark: model.remark,
      tags: model.tags
    },
    spec: {
      rules: model.rules.map((rule) => ({
        host: rule.host,
        paths: rule.paths.map((p) => ({
          path: p.path,
          pathType: p.pathType,
          backend: { service: p.backend.service, port: p.backend.port }
        }))
      })),
      filters: model.plugins.map((p) => ({
        plugin_id: p.plugin_id,
        binding_config: p.binding_config
      })),
      predicates: [...model.predicates]
    }
  }
}

/** 宽松取串（YAML 里 port 可能是数字 → 一律转字符串） */
function str(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'string') return v
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  return ''
}

function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
}

/** pathType 值域收敛（非法值回落 PREFIX） */
function pathTypeOf(v: unknown): IngressPathType {
  const s = str(v).toUpperCase()
  return (PATH_TYPES as string[]).includes(s) ? (s as IngressPathType) : 'PREFIX'
}

/** YAML 文档对象 → 表单模型（宽容解析：缺字段回落默认，不抛） */
export function yamlDocToModel(doc: unknown): IngressModel {
  const d = obj(doc)
  const meta = obj(d.metadata)
  const spec = obj(d.spec)
  const rawRules = Array.isArray(spec.rules) ? spec.rules : []
  const rawFilters = Array.isArray(spec.filters) ? spec.filters : []
  const rawPredicates = Array.isArray(spec.predicates) ? spec.predicates : []

  const rules: IngressRuleModel[] = rawRules.map((r) => {
    const ro = obj(r)
    const rawPaths = Array.isArray(ro.paths) ? ro.paths : []
    return {
      host: str(ro.host),
      paths: rawPaths.map((p) => {
        const po = obj(p)
        const backend = obj(po.backend)
        return {
          path: str(po.path),
          pathType: pathTypeOf(po.pathType),
          backend: { service: str(backend.service), port: str(backend.port) }
        }
      })
    }
  })

  const plugins: IngressPluginModel[] = rawFilters.map((f) => {
    const fo = obj(f)
    return {
      plugin_id: str(fo.plugin_id),
      binding_config: str(fo.binding_config) || '{}'
    }
  }).filter((p) => p.plugin_id !== '')

  return {
    name: str(meta.name),
    environment: str(meta.environment) || 'default',
    remark: str(meta.remark),
    tags: str(meta.tags),
    rules: rules.length > 0 ? rules : emptyIngressModel().rules,
    plugins,
    predicates: rawPredicates.map(str).filter((p) => p !== '')
  }
}
