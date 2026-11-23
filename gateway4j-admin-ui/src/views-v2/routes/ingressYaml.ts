/**
 * S12-4：Ingress 结构 ⇄ YAML 的序列化层（js-yaml 唯一落地口）。
 *
 * 为什么单独成文件：js-yaml 是重依赖（~130KB 未压缩），本模块被【动态 import】
 * （IngressForm 内 `import('./ingressYaml')`）→ js-yaml 只进懒加载 chunk，主 bundle 不含。
 * 纯模型层（ingressModel.ts）保持零重依赖，可静态 import。
 *
 * YAML 文档形态（K8s Ingress 风味，与表单字段一一对应）：
 *   metadata: { name, environment, remark, tags }
 *   spec:
 *     rules: [ { host, paths: [ { path, pathType, uri } ] } ]
 *     filters: [ { plugin_id, binding_config } ]
 *     predicates: [ 'Host=**.example.com' ]
 *
 * S12-6：paths[] 的后端目标为单字段 `uri`（SCG RouteDefinition.uri 同名同义 = 完整上游地址
 * `scheme://host[:port]`），取代旧的 `backend: { service, port }` 两分形态。
 */
import { dump, load } from 'js-yaml'
import { emptyIngressModel, modelToYamlDoc, yamlDocToModel, type IngressModel } from './ingressModel'

/** YAML 序列化选项：2 空格缩进（kubectl 风味）、不排序（保持 metadata 优先）、不锚点 */
const DUMP_OPTIONS = { indent: 2, lineWidth: 120, noRefs: true, sortKeys: false } as const

/** 表单模型 → YAML 文本 */
export function dumpIngressYaml(model: IngressModel): string {
  return dump(modelToYamlDoc(model), DUMP_OPTIONS)
}

/**
 * YAML 解析错误的行号（1 基）：
 * YAMLException.mark.line 是 0 基 → +1；退化匹配消息里的 "(line:col)"（js-yaml 消息即此形态）；
 * 再退化第 1 行。
 */
export function yamlErrorLine(e: unknown): number {
  if (e && typeof e === 'object') {
    const mark = (e as { mark?: { line?: unknown } }).mark
    if (mark && typeof mark.line === 'number' && Number.isFinite(mark.line)) {
      return Math.max(1, Math.trunc(mark.line) + 1)
    }
  }
  const msg = e instanceof Error ? e.message : String(e ?? '')
  const m = msg.match(/\((\d+):(\d+)\)/)
  if (m) return Math.max(1, Number(m[1]))
  return 1
}

/** YAML 文本 → 表单模型（解析失败带 1 基行号） */
export function loadIngressYaml(text: string): { ok: true; model: IngressModel } | { ok: false; line: number } {
  if (!String(text ?? '').trim()) return { ok: true, model: emptyIngressModel() }
  try {
    const doc = load(text)
    return { ok: true, model: yamlDocToModel(doc) }
  } catch (e) {
    return { ok: false, line: yamlErrorLine(e) }
  }
}
