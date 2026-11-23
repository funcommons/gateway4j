/**
 * S12-7c：SCG RouteDefinition ⇄ YAML 的序列化层（js-yaml 唯一落地口）。
 *
 * 为什么单独成文件：js-yaml 是重依赖，本模块被【动态 import】（ScgRoutesForm 内
 * `import('./scgYaml')`）→ js-yaml 只进懒加载 chunk，主 bundle 不含。纯模型层
 * （scgModel.ts）保持零重依赖，可静态 import。
 *
 * YAML 文档形态 = SCG application.yml 原生形态（验收标准：可整段粘回 SCG 配置直接用），
 * 文档对象映射见 scgModel.ts#modelToYamlDoc / #yamlDocToRoutes。
 */
import { dump, load } from 'js-yaml'
import {
  emptyScgRoute,
  modelToYamlDoc,
  yamlDocToRoutes,
  type ScgRouteModel
} from './scgModel'

/** YAML 序列化选项：2 空格缩进（SCG application.yml 风味）、不排序、不锚点 */
const DUMP_OPTIONS = { indent: 2, lineWidth: 120, noRefs: true, sortKeys: false } as const

/** 路由模型数组 → YAML 文本（spring.cloud.gateway.routes 形态） */
export function dumpScgYaml(routes: ScgRouteModel[]): string {
  return dump(modelToYamlDoc(routes), DUMP_OPTIONS)
}

/**
 * YAML 解析错误的行号（1 基）：
 * YAMLException.mark.line 是 0 基 → +1；退化匹配消息里的 "(line:col)"（js-yaml 消息即此形态）；
 * 再退化第 1 行。（与旧 ingressYaml.ts / FcYamlEditor 内部提取逻辑同口径。）
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

/** YAML 文本 → 路由模型数组（解析失败带 1 基行号；空文本 → 空清单） */
export function loadScgYaml(
  text: string
): { ok: true; routes: ScgRouteModel[] } | { ok: false; line: number } {
  if (!String(text ?? '').trim()) return { ok: true, routes: [] }
  try {
    const doc = load(text)
    const routes = yamlDocToRoutes(doc)
    return { ok: true, routes: routes.length > 0 ? routes : [] }
  } catch (e) {
    return { ok: false, line: yamlErrorLine(e) }
  }
}

/** 供组件回填空行使用（YAML 解析为空清单时保底一条可编辑行） */
export function fallbackRoute(): ScgRouteModel {
  return emptyScgRoute()
}
