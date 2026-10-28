#!/usr/bin/env node
/**
 * 权限码差集护栏（防 D5 复发：前端引用了 gw_permission 未声明的权限码）。
 *
 * 前端来源（gateway4j-admin-ui/src/**，排除 *.test.ts 测试桩）：
 *   - canEdit('X')            → 解析为 `X:edit`（与 usePermission.ts 行为一致）
 *   - hasPermission('X')      → X
 *   - hasAnyPermission('X','Y') → X、Y
 *   - 路由 meta permission: 'X' → X（仅接受 `seg:seg` 形态，过滤 i18n 文案）
 *
 * 后端来源（db/migration/*.sql 中 `INSERT INTO gw_permission` 的 VALUES 元组，
 * 首个字符串列即 permission_code；兼容 V1.0.0 多行 VALUES 与 V1.2.1 的
 * INSERT...SELECT...(VALUES...) 写法）。
 *
 * 差集非空 → exit 1；"后端声明了但前端未引用" 仅打印 info。
 * 纯 Node ESM、无三方依赖；用 import.meta.url 定位仓库根，不依赖 cwd。
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const UI_SRC = path.join(ROOT, 'gateway4j-admin-ui', 'src')
const MIGRATION_DIR = path.join(
  ROOT, 'gateway4j-admin-boot', 'src', 'main', 'resources', 'db', 'migration',
)

// 权限码形态：`resource:action`，段内允许小写字母/数字/连字符（如 plugin:upload-jar）
const CODE_RE = /^[a-z][a-z0-9-]*:[a-z][a-z0-9-]*$/
const EXTS = new Set(['.vue', '.ts'])

/** 递归收集待扫描文件（排除 *.test.ts / *.spec.ts） */
function collectFiles(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name)
    if (statSync(full).isDirectory()) {
      collectFiles(full, out)
    } else if (
      EXTS.has(path.extname(name)) &&
      !/\.test\.ts$/.test(name) &&
      !/\.spec\.ts$/.test(name)
    ) {
      out.push(full)
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// 1) 前端引用提取
// ---------------------------------------------------------------------------
const refs = new Map() // code -> [{ file, line }]
let dynamicCalls = 0 // 无法静态解析的调用（模板字符串/变量参数）

function addRef(code, file, line) {
  if (!CODE_RE.test(code)) return
  if (!refs.has(code)) refs.set(code, [])
  refs.get(code).push({ file, line })
}

function scanFrontend() {
  if (!existsSync(UI_SRC)) {
    console.error(`[check-permissions] 前端源码目录不存在: ${UI_SRC}`)
    process.exit(2)
  }
  for (const file of collectFiles(UI_SRC)) {
    const rel = path.relative(ROOT, file)
    // usePermission.ts 是 canEdit/hasPermission/hasAnyPermission 的实现而非调用点，
    // 其函数声明与内部模板字符串不计入"动态调用"统计
    const isComposableDef = rel === path.join('gateway4j-admin-ui', 'src', 'composables', 'usePermission.ts')
    const lines = readFileSync(file, 'utf8').split('\n')
    lines.forEach((text, idx) => {
      const line = idx + 1

      // canEdit('X') → `X:edit`
      for (const m of text.matchAll(/\bcanEdit\(\s*(['"])([^'"]+)\1\s*\)/g)) {
        addRef(`${m[2]}:edit`, rel, line)
      }
      // hasPermission('X')
      for (const m of text.matchAll(/\bhasPermission\(\s*(['"])([^'"]+)\1\s*\)/g)) {
        addRef(m[2], rel, line)
      }
      // hasAnyPermission('X', 'Y', ...)
      for (const m of text.matchAll(/\bhasAnyPermission\s*\(([^)]*)\)/g)) {
        for (const s of m[1].matchAll(/(['"])([^'"]+)\1/g)) {
          addRef(s[2], rel, line)
        }
      }
      // 路由 meta permission: 'X'（CODE_RE 过滤掉 locales 里的 i18n 文案）
      for (const m of text.matchAll(/\bpermission:\s*(['"])([^'"]+)\1/g)) {
        addRef(m[2], rel, line)
      }

      // 统计动态调用（字符串拼接/变量），提示人工确认
      if (isComposableDef) return
      for (const m of text.matchAll(/\b(canEdit|hasPermission|hasAnyPermission)\s*\(/g)) {
        const rest = text.slice(m.index + m[0].length)
        if (!/^\s*(['"`])/.test(rest)) dynamicCalls++
        else if (rest.trim().startsWith('`') && rest.includes('${')) dynamicCalls++
      }
    })
  }
}

// ---------------------------------------------------------------------------
// 2) 后端 SQL 声明提取
// ---------------------------------------------------------------------------
const declared = new Map() // code -> [sqlFile]

function scanSql() {
  if (!existsSync(MIGRATION_DIR)) {
    console.error(`[check-permissions] 迁移目录不存在: ${MIGRATION_DIR}`)
    process.exit(2)
  }
  const files = readdirSync(MIGRATION_DIR).filter(f => f.endsWith('.sql')).sort()
  for (const name of files) {
    const sql = readFileSync(path.join(MIGRATION_DIR, name), 'utf8')
    // 逐个定位 `INSERT INTO gw_permission` 语句，截到语句结束的分号
    const re = /INSERT\s+INTO\s+gw_permission\b/gi
    let m
    while ((m = re.exec(sql)) !== null) {
      const rest = sql.slice(m.index)
      const stmt = rest.slice(0, rest.indexOf(';') === -1 ? rest.length : rest.indexOf(';'))
      const valuesIdx = stmt.search(/\bVALUES\b/i)
      if (valuesIdx === -1) continue
      const valuesPart = stmt.slice(valuesIdx)
      // 每个元组的第一个字符串列即 permission_code
      for (const t of valuesPart.matchAll(/\(\s*'([^']*)'/g)) {
        const code = t[1]
        if (!CODE_RE.test(code)) continue
        if (!declared.has(code)) declared.set(code, [])
        if (!declared.get(code).includes(name)) declared.get(code).push(name)
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 3) 差集判定
// ---------------------------------------------------------------------------
scanFrontend()
scanSql()

if (declared.size === 0) {
  console.error('[check-permissions] 未从迁移 SQL 中解析到任何 gw_permission 权限码，脚本或路径异常，按失败处理')
  process.exit(2)
}

const missing = [...refs.keys()].filter(c => !declared.has(c)).sort()
const unused = [...declared.keys()].filter(c => !refs.has(c)).sort()

console.log('[check-permissions] 权限码护栏（前端引用 ⊆ SQL 声明）')
console.log(`  前端引用的权限码: ${refs.size} 个`)
console.log(`  SQL 声明的权限码: ${declared.size} 个`)

if (dynamicCalls > 0) {
  console.log(`  ⚠ 动态/非字面量权限调用 ${dynamicCalls} 处，无法静态校验（如为新增请人工确认）`)
}

if (unused.length > 0) {
  console.log(`\nℹ info（后端已声明、前端四类模式未直接引用，不作为失败项）: ${unused.length} 个`)
  for (const c of unused) {
    console.log(`    - ${c}  ← ${declared.get(c).join(', ')}`)
  }
}

if (missing.length > 0) {
  console.error(`\n✗ 缺失 ${missing.length} 个权限码（前端引用了但 gw_permission 未声明，D5 复发）:`)
  for (const c of missing) {
    console.error(`    - ${c}`)
    for (const r of refs.get(c)) {
      console.error(`        at ${r.file}:${r.line}`)
    }
  }
  process.exit(1)
}

console.log('\n✓ 差集为 0：前端引用的权限码均已在迁移 SQL 中声明')
