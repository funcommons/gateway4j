#!/usr/bin/env node
/**
 * 写操作护栏静态检查（P1-8）。
 *
 * 四类高危写端点的方法上必须存在 @RateLimit（或幂等注解 IdempotencyKey，预留）：
 *   1. 导入类   POST /v1/routes/import, /import/validate, /import/snapshot, /import/rollback
 *   2. 批量类   POST /v1/routes/bulk-publish, /bulk-offline, /bulk-delete
 *   3. JAR 上传 POST /v1/plugins/upload-jar
 *   4. Groovy 校验 POST /v1/plugins/validate-groovy
 *
 * 另检查这些路径已列入 framework4j.rate-limit.path-patterns（E1 坑：framework4j
 * 的 path-patterns 同时是拦截器注册范围，路径不在 patterns 内时注解限流不生效）。
 *
 * 纯 Node ESM、无三方依赖；import.meta.url 定位仓库根，不依赖 cwd。
 * 失败 exit 1（CI 可挂：node scripts/check-write-guardrails.mjs）。
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const CONTROLLER_ROOT = path.join(ROOT, 'gateway4j-admin', 'src', 'main', 'java')
const BOOT_YML = path.join(ROOT, 'gateway4j-admin-boot', 'src', 'main', 'resources', 'application.yml')

/** 护栏覆盖的 (METHOD, PATH 前缀) 清单 —— 与 P1-8 任务口径逐字对齐 */
const GUARDED = [
  { method: 'POST', path: '/v1/routes/import' },
  { method: 'POST', path: '/v1/routes/import/validate' },
  { method: 'POST', path: '/v1/routes/import/snapshot' },
  { method: 'POST', path: '/v1/routes/import/rollback' },
  { method: 'POST', path: '/v1/routes/bulk-publish' },
  { method: 'POST', path: '/v1/routes/bulk-offline' },
  { method: 'POST', path: '/v1/routes/bulk-delete' },
  { method: 'POST', path: '/v1/plugins/upload-jar' },
  { method: 'POST', path: '/v1/plugins/validate-groovy' },
]

/** 这些路径必须出现在 framework4j.rate-limit.path-patterns（前缀匹配即可） */
const REQUIRED_PATTERNS = [
  '/v1/routes/import/**',
  '/v1/routes/bulk-',
  '/v1/plugins/upload-jar',
  '/v1/plugins/validate-groovy',
]

function walk(dir, filter, out = []) {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name)
    if (statSync(full).isDirectory()) walk(full, filter, out)
    else if (filter(name, full)) out.push(full)
  }
  return out
}

function joinPath(a, b) {
  if (!b) return a || '/'
  if (!a) return b
  return `${a.replace(/\/+$/, '')}/${b.replace(/^\/+/, '')}`
}

// ---------------------------------------------------------------------------
// 1) 提取 Controller 端点与方法片段（自 @*Mapping 起到下一个 @*Mapping/类尾）
// ---------------------------------------------------------------------------
const endpoints = [] // { method, path, file, segment }

function scanControllers() {
  if (!existsSync(CONTROLLER_ROOT)) {
    console.error(`[write-guardrails] 后端源码目录不存在: ${CONTROLLER_ROOT}`)
    process.exit(2)
  }
  const files = walk(CONTROLLER_ROOT, n => n.endsWith('Controller.java'))
  const MAP_RE = /@(Get|Post|Put|Patch|Delete)Mapping\s*(?:\(([^)]*)\))?/g
  const CLASS_RE = /@RequestMapping\s*\(\s*(?:value\s*=\s*)?"([^"]*)"/

  for (const file of files) {
    const rel = path.relative(ROOT, file)
    const src = readFileSync(file, 'utf8')
    const classDecl = src.search(/\b(class|interface|enum)\s+\w+/)
    const header = classDecl === -1 ? src : src.slice(0, classDecl)
    const cm = header.match(CLASS_RE)
    const classPath = cm ? cm[1] : ''

    MAP_RE.lastIndex = 0
    let m
    const marks = []
    while ((m = MAP_RE.exec(src)) !== null) {
      const arg = m[2] || ''
      const sm = arg.match(/"([^"]*)"/)
      marks.push({
        method: m[1].toUpperCase(),
        path: joinPath(classPath, sm ? sm[1] : ''),
        index: m.index,
      })
    }
    for (let i = 0; i < marks.length; i++) {
      const end = i + 1 < marks.length ? marks[i + 1].index : src.length
      endpoints.push({ ...marks[i], file: rel, segment: src.slice(marks[i].index, end) })
    }
  }
}

// ---------------------------------------------------------------------------
// 2) 逐个护栏端点检查注解
// ---------------------------------------------------------------------------
scanControllers()

const problems = []
const found = []

for (const g of GUARDED) {
  const hit = endpoints.find(e => e.method === g.method && e.path === g.path)
  if (!hit) {
    problems.push(`护栏端点不存在（后端找不到 ${g.method} ${g.path}）——端点被改名/删除？`)
    continue
  }
  const hasGuard = /@RateLimit\b/.test(hit.segment) || /@IdempotencyKey\b/.test(hit.segment)
  if (!hasGuard) {
    problems.push(`${g.method} ${g.path}（${hit.file}）缺 @RateLimit / @IdempotencyKey 护栏注解`)
  } else {
    const limit = hit.segment.match(/@RateLimit\s*\(([^)]*)\)/)
    found.push(`${g.method} ${g.path} ← ${limit ? limit[1].replace(/\s+/g, ' ').trim() : 'IdempotencyKey'}`)
  }
}

// ---------------------------------------------------------------------------
// 3) path-patterns 注册范围检查（注解限流只在 patterns 内路径生效）
// ---------------------------------------------------------------------------
let patternsText = ''
if (existsSync(BOOT_YML)) {
  const yml = readFileSync(BOOT_YML, 'utf8')
  const block = yml.match(/rate-limit:([\s\S]*?)(?=\n  [a-z]|\ngateway4j:|$)/)
  patternsText = block ? block[1] : ''
  for (const p of REQUIRED_PATTERNS) {
    if (!patternsText.includes(p)) {
      problems.push(`framework4j.rate-limit.path-patterns 未包含 "${p}" —— 注解限流在该路径不生效（E1 坑）`)
    }
  }
} else {
  problems.push(`未找到 ${path.relative(ROOT, BOOT_YML)}`)
}

console.log('[write-guardrails] 写操作护栏静态检查（P1-8：import/bulk/upload-jar/validate-groovy）')
for (const f of found) {
  console.log(`  ✓ ${f}`)
}

if (found.length === 0 && endpoints.length === 0) {
  console.error('[write-guardrails] 未解析到任何 Controller 端点，脚本或路径异常，按失败处理')
  process.exit(2)
}

if (problems.length > 0) {
  console.error(`\n✗ 护栏缺失 ${problems.length} 项:`)
  for (const p of problems) {
    console.error(`    - ${p}`)
  }
  process.exit(1)
}

console.log(`\n✓ ${GUARDED.length} 个写端点全部带 @RateLimit/幂等护栏，且拦截路径已在 path-patterns 注册`)
