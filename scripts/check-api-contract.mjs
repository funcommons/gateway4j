#!/usr/bin/env node
/**
 * 接口契约护栏（防 D3/D4/D19 复发：前端调用了后端不存在的 接口）。
 *
 * 前端来源（gateway4j-admin-ui/src/api/*.ts，排除 *.test.ts 测试桩）：
 *   - http.get('/v1/...') / http.post / http.put / http.patch / http.delete
 *   - 模板字符串 `${id}` 归一为 `{id}`
 *
 * 后端来源（gateway4j-admin/src/main/java 下所有 *Controller.java）：
 *   - 类级 @RequestMapping("X") + 方法级 @GetMapping/@PostMapping/@PutMapping/
 *     @PatchMapping/@DeleteMapping("Y")（注解无值视为空串），拼出 (METHOD, PATH)
 *   - 路径变量 {xxx} 统一归一为 `{id}` 后比对
 *
 * 前端调用在后端找不到「同方法 + 同路径」→ 打印缺失 → exit 1；
 * 反向（后端有、前端未调用）仅打印 info，不失败。
 * 纯 Node ESM、无三方依赖；import.meta.url 定位仓库根，不依赖 cwd。
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const UI_API_DIR = path.join(ROOT, 'gateway4j-admin-ui', 'src', 'api')
const CONTROLLER_ROOT = path.join(ROOT, 'gateway4j-admin', 'src', 'main', 'java')

/** 路径归一：${...} → {id}，{anyVar} → {id}，去尾斜杠 */
function normalize(p) {
  return p
    .replace(/\$\{[^}]*\}/g, '{id}')
    .replace(/\{[^}/]+\}/g, '{id}')
    .replace(/\/+$/, '') || '/'
}

function joinPath(a, b) {
  if (!b) return normalize(a || '/')
  if (!a) return normalize(b)
  return normalize(`${a.replace(/\/+$/, '')}/${b.replace(/^\/+/, '')}`)
}

function walk(dir, filter, out = []) {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name)
    if (statSync(full).isDirectory()) walk(full, filter, out)
    else if (filter(name, full)) out.push(full)
  }
  return out
}

// ---------------------------------------------------------------------------
// 1) 前端调用提取
// ---------------------------------------------------------------------------
const feCalls = new Map() // `${METHOD} ${path}` -> [{ file, line }]
let feCallCount = 0

function scanFrontendApi() {
  if (!existsSync(UI_API_DIR)) {
    console.error(`[check-contract] 前端 api 目录不存在: ${UI_API_DIR}`)
    process.exit(2)
  }
  const files = readdirSync(UI_API_DIR).filter(
    n => n.endsWith('.ts') && !n.endsWith('.test.ts'),
  )
  const re = /\bhttp\s*\.\s*(get|post|put|patch|delete)\s*\(\s*([`'"])([^`'"]+)\2/g
  for (const name of files) {
    const rel = path.join('gateway4j-admin-ui', 'src', 'api', name)
    const lines = readFileSync(path.join(UI_API_DIR, name), 'utf8').split('\n')
    lines.forEach((text, idx) => {
      for (const m of text.matchAll(re)) {
        const method = m[1].toUpperCase()
        const p = normalize(m[3])
        const key = `${method} ${p}`
        feCallCount++
        if (!feCalls.has(key)) feCalls.set(key, [])
        feCalls.get(key).push({ file: rel, line: idx + 1 })
      }
    })
  }
}

// ---------------------------------------------------------------------------
// 2) 后端端点提取
// ---------------------------------------------------------------------------
const beEndpoints = new Map() // `${METHOD} ${path}` -> [controllerFile]
const CLASS_RE = /@RequestMapping\s*\(\s*(?:value\s*=\s*)?"([^"]*)"/
const METHOD_RE = /@(Get|Post|Put|Patch|Delete)Mapping\s*(?:\(([^)]*)\))?/g

function scanBackendControllers() {
  if (!existsSync(CONTROLLER_ROOT)) {
    console.error(`[check-contract] 后端源码目录不存在: ${CONTROLLER_ROOT}`)
    process.exit(2)
  }
  const files = walk(CONTROLLER_ROOT, n => n.endsWith('Controller.java'))
  for (const file of files) {
    const rel = path.relative(ROOT, file)
    const src = readFileSync(file, 'utf8')
    // 取类声明之前最后一个 @RequestMapping 作为类级前缀（跳过 import/注释干扰）
    const classDecl = src.search(/\b(class|interface|enum)\s+\w+/)
    const header = classDecl === -1 ? src : src.slice(0, classDecl)
    const cm = header.match(CLASS_RE)
    const classPath = cm ? cm[1] : ''

    // 方法级注解只取类体之后、排除注解内的字符串造成误配 —— 逐行扫描足够可靠
    let mm
    METHOD_RE.lastIndex = 0
    while ((mm = METHOD_RE.exec(src)) !== null) {
      const method = mm[1].toUpperCase()
      const arg = mm[2] || ''
      const sm = arg.match(/"([^"]*)"/) // 支持 value="/x", consumes=... 形态
      const methodPath = sm ? sm[1] : ''
      const full = joinPath(classPath, methodPath)
      const key = `${method} ${full}`
      if (!beEndpoints.has(key)) beEndpoints.set(key, [])
      if (!beEndpoints.get(key).includes(rel)) beEndpoints.get(key).push(rel)
    }
  }
}

// ---------------------------------------------------------------------------
// 3) 差集判定
// ---------------------------------------------------------------------------
scanFrontendApi()
scanBackendControllers()

if (beEndpoints.size === 0) {
  console.error('[check-contract] 未从 Controller 中解析到任何端点，脚本或路径异常，按失败处理')
  process.exit(2)
}

const missing = [...feCalls.keys()].filter(k => !beEndpoints.has(k)).sort()
const uncalled = [...beEndpoints.keys()].filter(k => !feCalls.has(k)).sort()

console.log('[check-contract] 接口契约护栏（前端调用 ⊆ 后端端点，(METHOD, PATH) 归一后比对）')
console.log(`  前端 API 调用: ${feCallCount} 处（去重 ${feCalls.size} 个端点）`)
console.log(`  后端端点:      ${beEndpoints.size} 个`)

if (uncalled.length > 0) {
  console.log(`\nℹ info（后端存在、前端未调用，不作为失败项）: ${uncalled.length} 个`)
  for (const k of uncalled) {
    console.log(`    - ${k}  ← ${beEndpoints.get(k).join(', ')}`)
  }
}

if (missing.length > 0) {
  console.error(`\n✗ 契约缺失 ${missing.length} 个（前端调用了但后端无同方法同路径，D3/D4/D19 复发）:`)
  for (const k of missing) {
    console.error(`    - ${k}`)
    for (const r of feCalls.get(k)) {
      console.error(`        at ${r.file}:${r.line}`)
    }
  }
  process.exit(1)
}

console.log('\n✓ 前端全部 API 调用均能在后端 Controller 中找到同方法同路径的端点')
