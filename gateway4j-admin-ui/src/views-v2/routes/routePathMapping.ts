/**
 * S10-4-C：分发路由「规则卡」路径映射数据层（MSE 口径：域名 + 路径映射）。
 * 契约：docs/ui-v2/实施契约.md §8.1 + RouteEditForm.layout.test.ts 头注（T 步钉死）。
 *
 * 为何独立模块：RouteEditForm.vue 的 @/api/routes import 白名单被既有源码契约测试
 * （RouteEditForm.test.ts「API import 白名单」用例）钉死 6 成员（createRoute 不在——
 * 「组件仅编辑态」旧契约），而本票路径映射行需要 listRouteChildren / createRoute /
 * deleteRoute 三成员。抽出子路由 CRUD 通道后主组件 import 面不变（白名单用例只读
 * RouteEditForm.vue 源码），三成员经本模块进组件 import 图（两套件 @/api/routes 均
 * 模块级 vi.mock，mock 对整图生效）。
 *
 * 引擎语义对齐（layout 头注侦察结论，实现逐条照做）：
 * - RoutePathMatcher：尾 `/**` = 前缀、尾 `/*` = 单段（单段不在本票翻译表内，回显按
 *   前缀族宽容摘后缀 + 未动行不触发提交 → 往返安全，不重写未动行 path）、无通配 = 精确。
 * - 正则翻译行挂【分发路由自身 conditions】（后置路由条件引擎永不评估 = dead config）；
 *   target = 行子路由 id；condition_key 传空串（引擎 PATH 分支不消费 key，后端亦不强制）。
 * - createRoute 硬拒 BACKEND 空 path（RouteService.validateRequiredFields）→ 正则行
 *   path 列存正则原文（非空落列）。
 * - 域名翻译行窄口径：condition_type=HEADER && condition_key=Host && operator=EQ
 *   （大小写敏感精确匹配）；仅回显首条，多余 Host 行留在条件行区按普通行渲染。
 */

import { createRoute, deleteRoute, listRouteChildren } from '@/api/routes'
import type { RouteNode } from '@/api/routes'

/** 行规则值域（钉死三枚举；下拉 label 走 i18n，value 原样枚举） */
export type PathRule = 'PREFIX' | 'EXACT' | 'REGEX'

/** 条件行六字段口径（与主组件 EditCondition 同形，结构化类型互通） */
export interface ConditionRow {
  condition_type: string
  operator: string
  condition_key: string
  condition_value: string
  target_route_id: string
  priority: number | string
}

/** 路径映射行（vm 通道 pathRows：契约钉五字段 id/path/rule/service/port；
 * baseline = 回显基线（保存脏判：与基线全等 = 未动行零调用），childVersion = 子路由
 * config_version（行级乐观锁 expected_version 随行）） */
export interface PathRow {
  /** 子路由 id；新行 ''（未保存态） */
  id: string
  /** 行路径输入：PREFIX = 摘 `/**`、EXACT = 原文、REGEX = 正则原文 */
  path: string
  rule: PathRule
  /** 服务列 = upstream_url 原文直绑（scheme 往返保真，不拆 origin） */
  service: string
  /** 端口列 = URL.port 投影（无显式端口 = ''） */
  port: string
  baseline: { path: string; rule: PathRule; service: string; port: string } | null
  childVersion: string
}

/** createRoute 新行载荷（最小契约面：route_name 由 UI 合成过 NAME_RE） */
export interface ChildRoutePayload {
  route_name: string
  route_type: string
  path: string
  upstream_url: string
  parent_route_id: string
}

/* ── 翻译层纯函数 ─────────────────────────────────────────────────────────── */

/** 域名翻译行摘除（窄口径 HEADER+Host+EQ，仅首条；其余行原序保留） */
export function takeHostCondition(conditions: ConditionRow[]): { rows: ConditionRow[]; host: ConditionRow | null } {
  const idx = conditions.findIndex(
    (c) => c.condition_type === 'HEADER' && c.condition_key === 'Host' && c.operator === 'EQ'
  )
  if (idx < 0) return { rows: conditions, host: null }
  const rows = conditions.slice()
  const [host] = rows.splice(idx, 1)
  return { rows, host }
}

/** 正则翻译行摘除（PATH+REGEX 且 target 命中已装载子路由 id；未命中行原样保留渲染） */
export function takeRegexConditions(
  conditions: ConditionRow[],
  childIds: Set<string>
): { rows: ConditionRow[]; byTarget: Map<string, ConditionRow> } {
  const rest: ConditionRow[] = []
  const byTarget = new Map<string, ConditionRow>()
  for (const c of conditions) {
    const tid = String(c.target_route_id ?? '')
    if (c.condition_type === 'PATH' && c.operator === 'REGEX' && childIds.has(tid)) {
      byTarget.set(tid, c)
    } else {
      rest.push(c)
    }
  }
  return { rows: rest, byTarget }
}

/** path 形态反向翻译（回显）：尾 `/**` = 前缀（摘后缀）、尾 `/*` = 单段（前缀族宽容摘后缀）、无通配 = 精确 */
export function echoRuleOf(path: string): { rule: PathRule; display: string } {
  const p = String(path ?? '')
  if (p.endsWith('/**')) return { rule: 'PREFIX', display: p.slice(0, -3) }
  if (p.endsWith('/*')) return { rule: 'PREFIX', display: p.slice(0, -2) }
  return { rule: 'EXACT', display: p }
}

/** upstream_url → 端口投影（无显式端口 / 解析失败 = ''） */
export function portOfUpstream(raw: string): string {
  try {
    return new URL(String(raw ?? '')).port
  } catch {
    return ''
  }
}

/** 服务原文 + 端口 → upstream_url 回写（同 origin 换端口；写空 = 去端口；scheme/路径保真）。
 * 字符串手术而非 URL 重序列化：URL.toString() 会给裸 origin 补尾 `/`，破坏原文往返。 */
export function mergeUpstream(service: string, port: string): string {
  const raw = String(service ?? '').trim()
  const m = raw.match(/^(https?:\/\/[^/?#]+)(.*)$/i)
  if (!m) return raw
  let authority = m[1].replace(/:\d+$/, '')
  if (port !== '') authority += `:${port}`
  return authority + (m[2] ?? '')
}

/** 匹配规则 → 子路由 path 翻译（保存时按行状态重跑）：PREFIX = 去尾斜杠/通配补 `/**`、
 * EXACT = 去通配、REGEX = 正则原文不变形（正则文可能合法含 `/**`，禁清洗） */
export function translatedPath(input: string, rule: PathRule): string {
  const raw = String(input ?? '')
  if (rule === 'REGEX') return raw
  const base = raw.replace(/\/\*\*?$/, '').replace(/\/+$/, '')
  return rule === 'PREFIX' ? `${base}/**` : base
}

/** 新行 route_name 合成（须过 NAME_RE ^[a-zA-Z0-9_]{2,50}$；值不钉，禁空即可） */
export function synthesizeRowName(seq: number, path: string): string {
  const san = String(path ?? '')
    .replace(/[^a-zA-Z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40)
  return (san ? `p_${seq}_${san}` : `p_${seq}`).slice(0, 50)
}

/** 子路由 + 命中正则翻译行 → 行模型（回显；baseline 定桩供保存脏判） */
export function buildPathRow(child: RouteNode, regex: ConditionRow | null): PathRow {
  const rawPath = String(child.path ?? '')
  const echoed = echoRuleOf(rawPath)
  const rule: PathRule = regex ? 'REGEX' : echoed.rule
  const display = regex ? String(regex.condition_value ?? '') : echoed.display
  const service = String(child.upstream_url ?? '')
  const port = portOfUpstream(service)
  return {
    id: String(child.id ?? ''),
    path: display,
    rule,
    service,
    port,
    baseline: { path: display, rule, service, port },
    childVersion: String(child.config_version ?? '')
  }
}

/* ── 子路由 CRUD 通道（独立模块的根本理由，见头注）───────────────────────────
 * 全部 async 包一层：旧测试文件 mock 工厂缺成员（import 绑定 undefined）时，同步
 * TypeError 在 async 边界转为 rejected promise → 调用方 await + try/catch 一律吞掉
 * （旧套件共存铁律：RouteEditForm.test.ts 的 mock 工厂只有 6 成员）。 */

export async function fetchRouteChildren(routeId: string): Promise<RouteNode[]> {
  const list = await listRouteChildren(routeId)
  return (Array.isArray(list) ? list : []) as RouteNode[]
}

export async function createChildRoute(payload: ChildRoutePayload): Promise<{ id?: string } | undefined> {
  const created = await createRoute(payload)
  return created as { id?: string } | undefined
}

export async function removeChildRoute(id: string): Promise<void> {
  await deleteRoute(id)
}
