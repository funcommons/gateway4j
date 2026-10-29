/**
 * gateway4j 安全/容错插件数据面行为验证（P0-3）——黑盒，纯 HTTP request 上下文，不依赖浏览器
 *
 * 目标：发现「安全插件在链路上没拦人」。当前 8 个安全/容错插件实例已在网关注册
 * （gateway4j-gateway-boot ServerAutoConfiguration#pluginInstanceRegistry：
 *   key-auth / basic-auth / jwt / sign / waf / oauth2 / circuit-breaker / sentinel），
 * 但库里没有它们的 gw_plugin 行 —— 没有任何自动化手段能证明「绑定了安全插件的路由真的在拦」。
 *
 * 本 spec 为每个插件创建 gwtest_ 前缀的 gw_plugin 行（plugin_id 必须等于内置常量
 * BuiltinPluginConstants 的 id，例如 "key-auth"，运行时实例按 plugin_id 单例查找），绑定到
 * gwtest_ 路由并发布，随后对 9300 打正反流量：正=合法凭据放行，反=无/错凭据拦截。
 *
 * ───────────────────────── 源码核实的插件语义（断言全部以此为准，不臆造） ─────────────────────────
 *
 * key-auth   KeyAuthPluginConfig {keyName, key}；凭据取 header 或 query 参数（同名字段）；
 *            常量时间比较；未命中 → 401 空体。keyName/key 缺失或空白 → 放行（fail-open）。
 * basic-auth BasicAuthPluginConfig {accounts: Map<用户名,明文口令>} —— 口令是明文，无需预编码；
 *            Authorization: Basic base64(user:pass)；无/错 → 401（无凭据时附 WWW-Authenticate）；
 *            accounts 空 → 放行（fail-open）。通过后插件链内注入 X-User。
 *            ⚠ 插件 mutate 出的新 exchange 不会传给 SCG 转发（转发用原始 exchange），因此
 *              X-User 等身份头实际到不了上游 —— 现状缺口，仅观测不断言。
 * jwt        JwtPluginConfig {algorithm, secretKey(HS 共享密钥/RS·ES 私钥), publicKey, tokenHeader,
 *            converter}；默认 Authorization（可退 "token" 头），Bearer 前缀可省；auth0 java-jwt 校验
 *            签名与 exp/iat/nbf（存在即校验）；失败 → 401。注意：HS 算法但 secretKey 为空 → 401
 *            （fail-CLOSED，不参与场景 9 的 fail-open 契约）。
 * sign       SignPluginConfig {appKey, appSecret, delayMinutes(默认5), algorithm(默认HmacSHA256),
 *            appKeyHeader/timestampHeader/signHeader(默认 appKey/timestamp/sign)}；
 *            sign = hex(HmacSHA256(appSecret, appKey + timestamp + path[?query]))；
 *            缺头/appKey 不符/时间戳超窗/签名不符 → 401。
 *            ⚠ 插件没有 nonce/重放防护概念（配置与算法均无），「重放同 nonce → 401」不可实现，
 *              本 spec 不对此断言（窗口内重放同一请求会通过 —— 现状缺口，见回归报告）。
 * waf        WafPluginConfig {model(black|mixed), permission(reject|allow), statusCode}；
 *            ⚠ 这是「一刀切开关」，没有任何规则/内容检查引擎：permission=reject → 一切请求都被
 *              拒（默认 403）；permission=allow 或 black 无 permission → 一律放行；mixed 无
 *              permission → 一律 403。「注入样例 vs 正常文本」在实现上不可区分（payload 无关），
 *              本用例按真实语义断言：reject 阶段两类请求都 403，allow 阶段两类都 200。
 * circuit-   CircuitBreakerPluginConfig {circuitEnable, failureRateThreshold(默认50),
 * breaker    minimumNumberOfCalls(默认10), slidingWindowSize(默认10), waitDurationMs(默认60000),
 *            permittedCallsInHalfOpen(默认10), limitForPeriod, limitRefreshPeriodMs, timeoutDurationMs}
 *            断路 → 503 空体（CallNotPermittedException）；限流 → 429（RequestNotPermitted）。
 *            ⚠ 架构现状（PluginExecutionFilter）：PRE 链的 continuation 是 Mono.empty()，SCG 转发
 *              发生在 PRE 链完成之后 —— 插件内 CircuitBreakerOperator 只包住「剩余 PRE 链」，
 *              上游 5xx/连接失败根本不进入熔断统计，「连续 5xx 触发熔断」在当前接线下不可达。
 *              本用例以自身限流拒绝（RequestNotPermitted 异常会经过熔断算子、被记为失败）驱动
 *              断路器 OPEN，验证其数据面契约：CLOSED 放行(200) → 限流拒绝(429) → OPEN 短路(503 空体)。
 * sentinel   SentinelPluginConfig {resourceMode(ROUTE→资源=请求路径|IP|其他→"gateway4j"),
 *            flowRules:[{resource,count,grade(默认1=QPS),limitApp}], degradeRules:[...]}；
 *            规则通过静态 FlowRuleManager/DegradeRuleManager 全 JVM 生效；BlockException → 429 空体。
 * oauth2     OAuth2PluginConfig {clientId, clientSecret, authorizationUri, tokenUri(RFC 7662
 *            introspection), redirectUri, tokenHeader, tokenQuery, userInfoUri}；
 *            无 token → 302 跳 authorizationUri（未配则 401）；introspection 返回 active!=true → 401；
 *            introspection 调用异常（网络/5xx）→ 401（fail-closed）；active=true → 放行（插件链内
 *            注入 X-User/X-Username/X-OAuth2-Scope，但同 basic-auth：头到不了上游，仅观测）。
 *            IdP 可自建：tokenUri 指向本 spec 的 echo 桩（19004 /oauth/introspect），无需外部系统
 *            —— 故 oauth2 无需降级。
 *
 * 场景清单：
 *   1  key-auth       缺 key→401 / 错 key→401 / 对 key→200 / query 传 key→200
 *   2  basic-auth     无凭据→401(+WWW-Authenticate) / 错口令→401 / 未知用户→401 / 对口令→200(+X-User)
 *   3  jwt            无 token→401 / 乱串→401 / 伪签→401 / 过期→401 / 合法(HS256 自签)→200
 *   4  sign           缺 sign→401 / 错签→401 / 错 appKey→401 / 超时戳→401 / 正确签名→200
 *   5  waf            reject：正常文本与注入样例均 403 → PATCH allow → 两类均 200（开关语义，见上）
 *   6  sentinel       同秒 10 连发：先 200 后 429；无绑定路由对照全程 200（归属证据）
 *   7  circuit-breaker 8 连发：200(闭合放行)→429(限流拒绝)→503 空体(OPEN 短路)；对照路由不 503
 *   8  oauth2         无 token→302 / introspection active:false→401 / 桩 500→401 / 合法→200(+X-User)
 *   9  fail-open 契约  绑定 key-auth+basic-auth 后把两行配置 PATCH 成 {} → 请求直通 200 而非 500/401
 *   10 管理面不可达    GET 9300/v1/users 与 /v1/routes 断言 404/401（不得 200）
 *                      ⚠ 依赖主 agent 重启后生效：当前 9300 尚未修复、此两断言会失败（现返回 200），
 *                        主 agent 统一重启后全量跑即应转绿。
 *
 * 前置（由外部环境保证，本 spec 不启动/重启任何产品进程）：
 *   - 网关 9300、管理后台 9301 已运行；PostgreSQL 容器 pg-17（gwtest_ 兜底清理，缺失时跳过）
 *   - 已知机制：网关每 30s 按「配置指纹」轮询 DB（ConfigSyncService，任何行变更即触发 reload），
 *     本 spec 用就绪轮询等待生效（≤80s），不做 publish/offline 版本体操。
 *   - plugin_id 全局唯一（uk_plugin_id + 服务层校验，且逻辑删除行也计入校验），因此同一 plugin_id
 *     的用例间切换用 PATCH 配置 + 就绪轮询，不并行造多行。
 *
 * 运行：npx playwright test --config=playwright.gateway.config.ts data-plane-security.spec.ts
 */
import { test, expect, APIRequestContext, request as pwRequest } from '@playwright/test'
import { spawn, spawnSync, ChildProcess } from 'child_process'
import crypto from 'node:crypto'
import path from 'path'
import { fileURLToPath } from 'url'

const GATEWAY = 'http://localhost:9300'
const ADMIN = 'http://localhost:9301'
// 项目 package.json 为 ESM（"type":"module"），echo 用 CommonJS 需 .cjs 后缀；不能用 __dirname
const ECHO_SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'echo-server.cjs')
const PG_CONTAINER = 'pg-17'
const ADMIN_USER = 'admin'
const ADMIN_PASS = 'admin123'

// 每次运行唯一化（gwtest_ + [a-zA-Z0-9_]{2,50}，满足路由/插件名校验）
const RUN = Date.now().toString(36)

function uid(label: string): string {
  return `gwtest_${label}_${RUN}_${Math.floor(Math.random() * 1e6).toString(36)}`
}

// ---------- echo 后端 ----------
// 19004 = 本 spec 专属（oauth 桩 + 身份头回显，必须跑新脚本）；19002 = 对照路由（旧脚本即可）
const SEC_ECHO = { port: 19004, tag: 'gw-echo-sec-19004', mode: 'oauth' }
const CTRL_ECHO = { port: 19002, tag: 'gw-echo-19002' }
const echoProcs: ChildProcess[] = []

// ---------- 凭据（每次运行随机，杜绝跨运行串扰） ----------
const KA_KEY = `gwtest-ka-key-${RUN}`
const BA_USER = 'gwtest-basic-user'
const BA_PASS = `gwtest-basic-pass-${RUN}`
const JWT_SECRET = `gwtest-jwt-secret-${RUN}`
const SIGN_APPKEY = `gwtest-sign-ak-${RUN}`
const SIGN_SECRET = `gwtest-sign-sk-${RUN}`
const OAUTH_VALID = `e2e-oauth-valid-${RUN}`
const OAUTH_INVALID = `e2e-oauth-invalid-${RUN}`
const OAUTH_SRVFAIL = `e2e-oauth-srvfail-${RUN}`

// ---------- 路由路径（归属证据之一：echo 回显 path 必须精确等于请求路径） ----------
const P = {
  ka: `/e2e/gwsec/${RUN}ka`,
  ba: `/e2e/gwsec/${RUN}ba`,
  jw: `/e2e/gwsec/${RUN}jw`,
  sg: `/e2e/gwsec/${RUN}sg`,
  wf: `/e2e/gwsec/${RUN}wf`,
  sn: `/e2e/gwsec/${RUN}sn`,
  cb: `/e2e/gwsec/${RUN}cb`,
  cc: `/e2e/gwsec/${RUN}cc`,
  oa: `/e2e/gwsec/${RUN}oa`,
  fo: `/e2e/gwsec/${RUN}fo`,
}

// ---------- 运行期状态 ----------
let admin: APIRequestContext // 带 Bearer 的管理面上下文
let gw: APIRequestContext // 匿名数据面上下文（数据面客户端本就不该有管理 token）
const routeIds = new Map<string, string>()
const pluginRowIds = new Map<string, string>()

// ---------- HTTP 工具 ----------
async function api(
  method: string,
  urlPath: string,
  data?: unknown,
): Promise<{ status: number; body: any }> {
  const res = await admin.fetch(`${ADMIN}${urlPath}`, {
    method: method as any,
    data: data === undefined ? undefined : JSON.stringify(data),
    headers: { 'content-type': 'application/json' },
  })
  let body: any = null
  try {
    body = await res.json()
  } catch {
    body = null
  }
  return { status: res.status(), body }
}

/** 数据面请求（匿名）。返回 status/headers/body（JSON 优先，非 JSON 回退文本）。 */
async function call(
  method: 'GET' | 'POST',
  urlPath: string,
  opts: { headers?: Record<string, string>; data?: unknown } = {},
): Promise<{ status: number; headers: Record<string, string>; body: any; text: string }> {
  const res = await gw.fetch(`${GATEWAY}${urlPath}`, {
    method,
    headers: opts.headers,
    data: opts.data === undefined ? undefined : JSON.stringify(opts.data),
    timeout: 15_000,
    maxRedirects: 0, // oauth2 无 token 的 302 必须原样观测，禁止自动跟随
  })
  let body: any = null
  let text = ''
  try {
    text = await res.text()
    body = text ? JSON.parse(text) : null
  } catch {
    body = null
  }
  return { status: res.status(), headers: res.headers(), body, text }
}

// ---------- DB 兜底清理（物理删除；API 删除是逻辑删除，且 plugin_id 唯一校验会连逻辑删除行一起计数） ----------
function dbPsql(sql: string): boolean {
  try {
    const r = spawnSync('docker', ['exec', PG_CONTAINER, 'psql', '-U', 'admin', '-d', 'gateway4j', '-c', sql], {
      timeout: 15_000,
    })
    return r.status === 0
  } catch {
    return false
  }
}

function dbSweepGwtest(): void {
  const ok = dbPsql(`
    DELETE FROM gw_route_plugin_binding WHERE route_id IN (SELECT id FROM gw_route WHERE route_name LIKE 'gwtest%');
    DELETE FROM gw_route_plugin_binding WHERE plugin_id IN (SELECT id FROM gw_plugin WHERE plugin_name LIKE 'gwtest%');
    DELETE FROM gw_route_condition WHERE route_id IN (SELECT id FROM gw_route WHERE route_name LIKE 'gwtest%');
    DELETE FROM gw_route WHERE route_name LIKE 'gwtest%';
    DELETE FROM gw_plugin WHERE plugin_name LIKE 'gwtest%';
  `)
  if (!ok) console.warn('[cleanup] DB sweep skipped（pg-17 不可用或 docker 不在）')
}

// ---------- echo 后端管理 ----------
async function ensureBackend(
  expect_: { port: number; tag: string; mode?: string },
  strictMode: boolean,
): Promise<void> {
  let info: any = null
  try {
    const r = await fetch(`http://127.0.0.1:${expect_.port}/__probe`, { signal: AbortSignal.timeout(1_500) })
    if (r.status === 200) info = await r.json().catch(() => null)
  } catch {
    info = null
  }
  const modeOk = !strictMode || info?.mode === expect_.mode
  if (info?.probe === true && modeOk) {
    console.log(`[echo] 复用 ${expect_.port} tag=${info.tag ?? expect_.tag} mode=${info.mode ?? 'legacy'}`)
    return
  }
  if (info && !modeOk) {
    // 端口被历史脚本占用：按端口清理后重拉
    console.warn(`[echo] ${expect_.port} 上是旧脚本(mode=${info.mode})，尝试清理后重启`)
    try {
      const pid = spawnSync('lsof', ['-ti', `tcp:${expect_.port}`], { timeout: 5_000 }).stdout?.toString().trim()
      if (pid) spawnSync('kill', ['-9', ...pid.split('\n')], { timeout: 5_000 })
      await new Promise((r) => setTimeout(r, 500))
    } catch {
      /* 尽力而为 */
    }
  }
  const p = spawn(
    'node',
    [ECHO_SCRIPT, String(expect_.port), expect_.tag, ...(expect_.mode ? [expect_.mode] : [])],
    { stdio: ['ignore', 'ignore', 'pipe'], detached: true },
  )
  p.unref()
  echoProcs.push(p)
  p.stderr?.on('data', (d) => console.warn(`[echo:${expect_.port}] ${d}`))
  await new Promise((r) => setTimeout(r, 800))
  const up = await fetch(`http://127.0.0.1:${expect_.port}/__probe`, { signal: AbortSignal.timeout(1_500) })
    .then((r) => r.status === 200)
    .catch(() => false)
  expect(up, `echo 后端 ${expect_.port} 启动失败`).toBe(true)
}

// ---------- 管理面操作 ----------
async function createRoute(payload: Record<string, unknown>): Promise<any> {
  const res = await api('POST', '/v1/routes', payload)
  const route = res.body?.id != null ? res.body : res.body?.data
  expect(
    res.status === 200 && route?.id,
    `创建路由 ${payload.route_name} 失败 http=${res.status} body=${JSON.stringify(res.body).slice(0, 300)}`,
  ).toBeTruthy()
  return route
}

async function publishRoute(routeId: string): Promise<void> {
  const res = await api('POST', `/v1/routes/${routeId}/publish`)
  expect(res.status === 200, `发布路由 ${routeId} 失败 http=${res.status} body=${JSON.stringify(res.body).slice(0, 200)}`).toBeTruthy()
}

/**
 * 创建 BUILTIN 插件行并启用。plugin_id 必须是内置常量 id（运行时按它找单例实例）；
 * plugin_name 用 gwtest_ 前缀供兜底清理。scope=ROUTE（只随绑定生效），phase=PRE。
 */
async function createEnabledPluginRow(builtinId: string, label: string, config: unknown): Promise<string> {
  const res = await api('POST', '/v1/plugins', {
    plugin_name: uid(`sec_${label}`),
    plugin_id: builtinId,
    plugin_type: 'BUILTIN',
    plugin_phase: 'PRE',
    scope: 'ROUTE',
    sort_order: 1,
    config: JSON.stringify(config),
  })
  const row = res.body?.id != null ? res.body : res.body?.data
  expect(
    res.status === 200 && row?.id,
    `创建插件行 ${builtinId}(${label}) 失败 http=${res.status} body=${JSON.stringify(res.body).slice(0, 300)}`,
  ).toBeTruthy()
  const en = await api('POST', `/v1/plugins/${row.id}/enable`)
  expect(en.status === 200, `启用插件行 ${builtinId} 失败 http=${en.status}`).toBeTruthy()
  return String(row.id)
}

async function patchPluginConfig(rowId: string, config: unknown): Promise<void> {
  const res = await api('PATCH', `/v1/plugins/${rowId}`, { config: JSON.stringify(config) })
  expect(res.status === 200, `PATCH 插件行 ${rowId} 失败 http=${res.status} body=${JSON.stringify(res.body).slice(0, 200)}`).toBeTruthy()
}

/** 就绪轮询：等待网关 30s 指纹轮询把新配置生效（probe 返回 {ready, desc}）。 */
async function waitReady(label: string, probe: () => Promise<{ ready: boolean; desc: string }>, timeoutMs = 80_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  let last = '未执行'
  while (Date.now() < deadline) {
    try {
      const r = await probe()
      last = r.desc
      if (r.ready) {
        console.log(`[setup] ${label} 已生效（${last}）`)
        return
      }
    } catch (e: any) {
      last = e?.message ?? String(e)
    }
    await new Promise((r) => setTimeout(r, 3_000))
  }
  throw new Error(`[setup] ${label} 在 ${timeoutMs}ms 内未生效，最后观测：${last}`)
}

const ownsEcho = (r: { status: number; body: any }, pathPrefix: string) =>
  r.status === 200 && r.body?.echo === true && r.body?.tag === SEC_ECHO.tag && String(r.body?.path ?? '').startsWith(pathPrefix)

// ---------- JWT / Sign 自签工具（与网关 auth0 java-jwt / SignPlugin 算法对齐） ----------
function b64urlJson(obj: object): string {
  return Buffer.from(JSON.stringify(obj)).toString('base64url')
}

function hs256Jwt(secret: string, claims: Record<string, unknown>): string {
  const head = b64urlJson({ alg: 'HS256', typ: 'JWT' })
  const payload = b64urlJson(claims)
  const sig = crypto.createHmac('sha256', secret).update(`${head}.${payload}`).digest('base64url')
  return `${head}.${payload}.${sig}`
}

function hmacHex(secret: string, data: string): string {
  return crypto.createHmac('sha256', secret).update(data).digest('hex')
}

// ---------- 生命周期 ----------
test.beforeAll(async () => {
  console.log(`[env] worker pid=${process.pid} RUN=${RUN}`)
  test.setTimeout(240_000)

  await ensureBackend(CTRL_ECHO, false)
  await ensureBackend(SEC_ECHO, true)

  dbSweepGwtest()

  // 登录（admin 单会话：若其他会话同时登录会踢掉本 token，管理面表现为 500/10001）
  const loginCtx = await pwRequest.newContext()
  const res = await loginCtx.post(`${ADMIN}/v1/auth/login`, {
    data: { username: ADMIN_USER, password: ADMIN_PASS },
  })
  expect(res.status(), `登录失败 HTTP ${res.status()}`).toBe(200)
  const loginBody = await res.json()
  expect(loginBody.access_token, '登录响应缺少 access_token').toBeTruthy()
  await loginCtx.dispose()
  admin = await pwRequest.newContext({ extraHTTPHeaders: { authorization: `Bearer ${loginBody.access_token}` } })
  gw = await pwRequest.newContext()

  // ── 1) 插件行（凭据/阈值注入点：gw_plugin.config，经网关 reload 推入运行时单例） ──
  pluginRowIds.set(
    'ka',
    await createEnabledPluginRow('key-auth', 'ka', { keyName: 'X-Api-Key', key: KA_KEY }),
  )
  pluginRowIds.set(
    'ba',
    await createEnabledPluginRow('basic-auth', 'ba', { accounts: { [BA_USER]: BA_PASS } }),
  )
  pluginRowIds.set(
    'jw',
    await createEnabledPluginRow('jwt', 'jw', { algorithm: 'HS256', secretKey: JWT_SECRET }),
  )
  pluginRowIds.set(
    'sg',
    await createEnabledPluginRow('sign', 'sg', {
      appKey: SIGN_APPKEY,
      appSecret: SIGN_SECRET,
      delayMinutes: 5,
    }),
  )
  pluginRowIds.set(
    'wf',
    await createEnabledPluginRow('waf', 'wf', { model: 'black', permission: 'reject', statusCode: 403 }),
  )
  pluginRowIds.set(
    'sn',
    await createEnabledPluginRow('sentinel', 'sn', {
      resourceMode: 'ROUTE',
      flowRules: [{ resource: `${P.sn}/ping`, count: 3, grade: 1 }],
    }),
  )
  pluginRowIds.set(
    'cb',
    await createEnabledPluginRow('circuit-breaker', 'cb', {
      circuitEnable: true,
      failureRateThreshold: 30, // 3 次记录调用中 1 次失败(33%≥30%)即 OPEN
      minimumNumberOfCalls: 3,
      slidingWindowSize: 10,
      waitDurationMs: 60_000, // OPEN 保持 60s，覆盖整个用例窗口
      permittedCallsInHalfOpen: 2,
      limitForPeriod: 2, // 每窗口 2 个许可 → 第 3 个请求被拒(429)，其异常被熔断算子记为失败
      limitRefreshPeriodMs: 600_000, // 10 分钟许可窗口：用例期间许可不补充，序列确定性不受用例间耗时影响
    }),
  )
  pluginRowIds.set(
    'oa',
    await createEnabledPluginRow('oauth2', 'oa', {
      clientId: 'gwtest-client',
      clientSecret: 'gwtest-client-secret',
      authorizationUri: 'https://dummy-idp.gwtest.invalid/oauth2/authorize',
      tokenUri: `http://127.0.0.1:${SEC_ECHO.port}/oauth/introspect`,
    }),
  )

  // ── 2) 路由 + 绑定（gw_plugin.config 是唯一配置通道；binding_config 引擎不消费） ──
  const mk = (label: string, path: string, bindings: { plugin_id: string }[]) =>
    createRoute({
      route_name: uid(`sec_${label}`),
      route_type: 'BACKEND',
      path: `${path}/**`,
      upstream_url: `http://127.0.0.1:${SEC_ECHO.port}`,
      sort_order: 1,
      bindings,
    })
  routeIds.set('ka', String((await mk('ka_route', P.ka, [{ plugin_id: pluginRowIds.get('ka')! }])).id))
  routeIds.set('ba', String((await mk('ba_route', P.ba, [{ plugin_id: pluginRowIds.get('ba')! }])).id))
  routeIds.set('jw', String((await mk('jw_route', P.jw, [{ plugin_id: pluginRowIds.get('jw')! }])).id))
  routeIds.set('sg', String((await mk('sg_route', P.sg, [{ plugin_id: pluginRowIds.get('sg')! }])).id))
  routeIds.set('wf', String((await mk('wf_route', P.wf, [{ plugin_id: pluginRowIds.get('wf')! }])).id))
  routeIds.set('sn', String((await mk('sn_route', P.sn, [{ plugin_id: pluginRowIds.get('sn')! }])).id))
  routeIds.set('cb', String((await mk('cb_route', P.cb, [{ plugin_id: pluginRowIds.get('cb')! }])).id))
  // 对照路由（无任何绑定）：熔断/sentinel 的归属证据 —— 同一网关、同一回声后端，不受被测插件影响
  routeIds.set(
    'cc',
    String(
      (
        await createRoute({
          route_name: uid('sec_cc_route'),
          route_type: 'BACKEND',
          path: `${P.cc}/**`,
          upstream_url: `http://127.0.0.1:${CTRL_ECHO.port}`,
          sort_order: 1,
        })
      ).id,
    ),
  )
  routeIds.set('oa', String((await mk('oa_route', P.oa, [{ plugin_id: pluginRowIds.get('oa')! }])).id))
  // fail-open 契约路由：绑定 ka+ba 两行（先以真实凭据配置发布，场景 9 PATCH 成 {} 后直通）
  routeIds.set(
    'fo',
    String(
      (
        await mk('fo_route', P.fo, [
          { plugin_id: pluginRowIds.get('ka')! },
          { plugin_id: pluginRowIds.get('ba')! },
        ])
      ).id,
    ),
  )

  for (const id of routeIds.values()) await publishRoute(id)
  console.log(`[setup] ${routeIds.size} 条路由已发布，等待网关指纹轮询生效…`)

  // ── 3) 就绪轮询（每条路由等到「插件已在数据面拦截/放行」的标志性信号） ──
  // fail-open 路由（fo）不在此列：它要等场景 9 PATCH 后才可达
  await Promise.all([
    waitReady('key-auth 拦截', async () => {
      const r = await call('GET', `${P.ka}/ping`)
      return { ready: r.status === 401, desc: `缺 key http=${r.status}` }
    }),
    waitReady('basic-auth 拦截', async () => {
      const r = await call('GET', `${P.ba}/ping`)
      return { ready: r.status === 401, desc: `无凭据 http=${r.status}` }
    }),
    waitReady('jwt 拦截', async () => {
      const r = await call('GET', `${P.jw}/ping`)
      return { ready: r.status === 401, desc: `无 token http=${r.status}` }
    }),
    waitReady('sign 拦截', async () => {
      const r = await call('GET', `${P.sg}/ping`)
      return { ready: r.status === 401, desc: `缺签名头 http=${r.status}` }
    }),
    waitReady('waf 拦截', async () => {
      const r = await call('GET', `${P.wf}/ping`)
      return { ready: r.status === 403, desc: `reject http=${r.status}` }
    }),
    waitReady('sentinel 生效', async () => {
      const r = await call('GET', `${P.sn}/ping`)
      return { ready: r.status === 200 || r.status === 429, desc: `http=${r.status}` }
    }),
    waitReady('circuit-breaker 生效', async () => {
      const r = await call('GET', `${P.cb}/ping`)
      return { ready: r.status !== 404, desc: `http=${r.status}` }
    }),
    waitReady('对照路由生效', async () => {
      const r = await call('GET', `${P.cc}/ping`)
      return { ready: r.status !== 404, desc: `http=${r.status}` }
    }),
    waitReady('oauth2 拦截', async () => {
      const r = await call('GET', `${P.oa}/ping`)
      return { ready: r.status === 302 || r.status === 401, desc: `无 token http=${r.status}` }
    }),
  ])
})

test.afterAll(async () => {
  // API 清理（逻辑删除）+ 物理兜底
  for (const [label, id] of routeIds) {
    try {
      const st = await api('GET', `/v1/routes/${id}`)
      if (st.body?.status === 'PUBLISHED') await api('POST', `/v1/routes/${id}/offline`)
      await api('DELETE', `/v1/routes/${id}`)
    } catch (e: any) {
      console.warn(`[cleanup] 路由 ${label}(${id}) API 清理失败：${e?.message}`)
    }
  }
  for (const [label, id] of pluginRowIds) {
    try {
      await api('POST', `/v1/plugins/${id}/disable`)
      await api('DELETE', `/v1/plugins/${id}`)
    } catch (e: any) {
      console.warn(`[cleanup] 插件行 ${label}(${id}) API 清理失败：${e?.message}`)
    }
  }
  dbSweepGwtest()
  for (const p of echoProcs) {
    try {
      p.kill()
    } catch {
      /* 忽略 */
    }
  }
})

// ---------- 场景 1：key-auth ----------
test('场景1 key-auth：缺/错 apikey 拦截 401，对 key 放行 200（header 与 query 两条通道）', async () => {
  const noKey = await call('GET', `${P.ka}/ping`)
  expect(noKey.status, `缺 apikey 应 401，实际 ${noKey.status}`).toBe(401)

  const wrongKey = await call('GET', `${P.ka}/ping`, { headers: { 'X-Api-Key': `wrong-${RUN}` } })
  expect(wrongKey.status, `错 apikey 应 401，实际 ${wrongKey.status}`).toBe(401)

  const goodKey = await call('GET', `${P.ka}/ping`, { headers: { 'X-Api-Key': KA_KEY } })
  expect(goodKey.status, `对 apikey 应 200，实际 ${goodKey.status} body=${goodKey.text.slice(0, 200)}`).toBe(200)
  expect(
    ownsEcho(goodKey, `${P.ka}/ping`),
    `正例响应归属不符：tag=${goodKey.body?.tag} path=${goodKey.body?.path}`,
  ).toBe(true)

  // query 参数通道（KeyAuthPlugin.checkKey 第二分支）
  const queryKey = await call('GET', `${P.ka}/ping?X-Api-Key=${encodeURIComponent(KA_KEY)}`)
  expect(queryKey.status, `query 传对 key 应 200，实际 ${queryKey.status}`).toBe(200)
  expect(ownsEcho(queryKey, `${P.ka}/ping`), `query 正例归属不符：tag=${queryKey.body?.tag}`).toBe(true)
})

// ---------- 场景 2：basic-auth ----------
test('场景2 basic-auth：无凭据/错口令/未知用户拦截 401，对口令放行 200', async () => {
  const none = await call('GET', `${P.ba}/ping`)
  expect(none.status, `无凭据应 401，实际 ${none.status}`).toBe(401)
  expect(
    (none.headers['www-authenticate'] ?? '').startsWith('Basic'),
    `无凭据应带 WWW-Authenticate: Basic，实际 ${none.headers['www-authenticate']}`,
  ).toBe(true)

  const b64 = (u: string, p: string) => Buffer.from(`${u}:${p}`).toString('base64')
  const wrongPass = await call('GET', `${P.ba}/ping`, {
    headers: { authorization: `Basic ${b64(BA_USER, 'not-the-password')}` },
  })
  expect(wrongPass.status, `错口令应 401，实际 ${wrongPass.status}`).toBe(401)

  const unknownUser = await call('GET', `${P.ba}/ping`, {
    headers: { authorization: `Basic ${b64('no-such-user', BA_PASS)}` },
  })
  expect(unknownUser.status, `未知用户应 401，实际 ${unknownUser.status}`).toBe(401)

  const good = await call('GET', `${P.ba}/ping`, { headers: { authorization: `Basic ${b64(BA_USER, BA_PASS)}` } })
  expect(good.status, `对口令应 200，实际 ${good.status} body=${good.text.slice(0, 200)}`).toBe(200)
  expect(ownsEcho(good, `${P.ba}/ping`), `正例归属不符：tag=${good.body?.tag} path=${good.body?.path}`).toBe(true)
  // 注入观测（不断言）：BasicAuthPlugin 会在「插件链内」向请求注入 X-User，但 SCG 转发用的是
  // 进入 PluginExecutionFilter 的原始 exchange，插件 mutate 出的新 exchange 不会传给转发
  // （见文件头「源码核实的插件语义」）——上游实际收不到该头，此处仅记录现场。
  if (good.body?.header_x_user) {
    console.log(`[basic-auth] X-User 注入观测：${good.body.header_x_user}`)
  }
})

// ---------- 场景 3：jwt ----------
test('场景3 jwt：无 token/乱串/伪签/过期均 401，合法 HS256 自签 token 放行 200', async () => {
  const now = Math.floor(Date.now() / 1000)
  const none = await call('GET', `${P.jw}/ping`)
  expect(none.status, `无 token 应 401，实际 ${none.status}`).toBe(401)

  const garbage = await call('GET', `${P.jw}/ping`, { headers: { authorization: 'Bearer abc.def.ghi' } })
  expect(garbage.status, `乱串 token 应 401，实际 ${garbage.status}`).toBe(401)

  const forged = await call('GET', `${P.jw}/ping`, {
    headers: {
      authorization: `Bearer ${hs256Jwt(`wrong-secret-${RUN}`, { sub: 'attacker', iat: now, exp: now + 300 })}`,
    },
  })
  expect(forged.status, `伪签（错密钥）token 应 401，实际 ${forged.status}`).toBe(401)

  const expired = await call('GET', `${P.jw}/ping`, {
    headers: {
      authorization: `Bearer ${hs256Jwt(JWT_SECRET, { sub: 'late-user', iat: now - 1200, exp: now - 600 })}`,
    },
  })
  expect(expired.status, `过期 token 应 401，实际 ${expired.status}`).toBe(401)

  const valid = await call('GET', `${P.jw}/ping`, {
    headers: {
      authorization: `Bearer ${hs256Jwt(JWT_SECRET, { sub: 'gwtest-jwt-user', iat: now, exp: now + 300 })}`,
    },
  })
  expect(valid.status, `合法 token 应 200，实际 ${valid.status} body=${valid.text.slice(0, 200)}`).toBe(200)
  expect(ownsEcho(valid, `${P.jw}/ping`), `正例归属不符：tag=${valid.body?.tag} path=${valid.body?.path}`).toBe(true)
})

// ---------- 场景 4：sign ----------
test('场景4 sign：缺签名/错签/错 appKey/超时时间戳均 401，正确 HMAC 放行 200', async () => {
  const path_ = `${P.sg}/ping`
  const ts = String(Date.now())
  const headersFor = (appKey: string, timestamp: string, sign: string | null) => {
    const h: Record<string, string> = { appKey, timestamp }
    if (sign !== null) h.sign = sign
    return h
  }

  const missing = await call('GET', path_, { headers: headersFor(SIGN_APPKEY, ts, null) })
  expect(missing.status, `缺 sign 头应 401，实际 ${missing.status}`).toBe(401)

  const wrong = await call('GET', path_, {
    headers: headersFor(SIGN_APPKEY, ts, 'deadbeef'.repeat(4)),
  })
  expect(wrong.status, `错签名应 401，实际 ${wrong.status}`).toBe(401)

  const wrongKey = await call('GET', path_, {
    headers: headersFor(`bad-${RUN}`, ts, hmacHex(SIGN_SECRET, `bad-${RUN}${ts}${path_}`)),
  })
  expect(wrongKey.status, `错 appKey 应 401，实际 ${wrongKey.status}`).toBe(401)

  const staleTs = String(Date.now() - 10 * 60 * 1000) // 超出 delayMinutes=5 窗口
  const stale = await call('GET', path_, {
    headers: headersFor(SIGN_APPKEY, staleTs, hmacHex(SIGN_SECRET, `${SIGN_APPKEY}${staleTs}${path_}`)),
  })
  expect(stale.status, `超时时间戳应 401，实际 ${stale.status}`).toBe(401)

  const good = await call('GET', path_, {
    headers: headersFor(SIGN_APPKEY, ts, hmacHex(SIGN_SECRET, `${SIGN_APPKEY}${ts}${path_}`)),
  })
  expect(good.status, `正确签名应 200，实际 ${good.status} body=${good.text.slice(0, 200)}`).toBe(200)
  expect(ownsEcho(good, path_), `正例归属不符：tag=${good.body?.tag} path=${good.body?.path}`).toBe(true)

  // 注：SignPlugin 无 nonce/重放防护（配置与算法均无该概念），窗口内重放同一请求会通过 —— 不做断言，记录现状
})

// ---------- 场景 5：waf ----------
test('场景5 waf：permission=reject 一刀切 403（含注入样例）→ PATCH allow 后放行 200', async () => {
  test.setTimeout(240_000)
  // WafPlugin 是开关语义（无内容检查引擎，见文件头）：reject 阶段任何请求都被拒
  const benign = await call('GET', `${P.wf}/ping`)
  expect(benign.status, `reject 阶段正常文本也应 403，实际 ${benign.status}`).toBe(403)

  const xss = await call('GET', `${P.wf}/ping?q=${encodeURIComponent('<script>alert(1)</script>')}`)
  expect(xss.status, `reject 阶段 XSS 样例应 403，实际 ${xss.status}`).toBe(403)

  const sqli = await call('POST', `${P.wf}/ping`, {
    headers: { 'content-type': 'application/json' },
    data: { name: "' OR 1=1 --" },
  })
  expect(sqli.status, `reject 阶段 SQLi 样例应 403，实际 ${sqli.status}`).toBe(403)

  // PATCH → allow：开关放行一切（就绪轮询等待 reload）
  await patchPluginConfig(pluginRowIds.get('wf')!, { model: 'black', permission: 'allow' })
  await waitReady('waf 切换 allow', async () => {
    const r = await call('GET', `${P.wf}/ping`)
    return { ready: r.status === 200, desc: `allow http=${r.status}` }
  })

  const benign2 = await call('GET', `${P.wf}/ping`)
  expect(benign2.status, `allow 阶段正常文本应 200，实际 ${benign2.status}`).toBe(200)
  expect(ownsEcho(benign2, `${P.wf}/ping`), `allow 正例归属不符：tag=${benign2.body?.tag}`).toBe(true)

  const xss2 = await call('GET', `${P.wf}/ping?q=${encodeURIComponent('<script>alert(1)</script>')}`)
  expect(
    xss2.status,
    `allow 阶段注入样例同样放行（插件无内容检查），实际 ${xss2.status}`,
  ).toBe(200)
})

// ---------- 场景 6：circuit-breaker ----------
test('场景6 circuit-breaker：闭合放行 200 → 限流拒绝 429 → 熔断 OPEN 短路 503 空体', async () => {
  // 说明：上游 5xx/连接失败不会进入熔断统计（PRE 链 continuation 为空、转发发生在链之后，
  // 见 PluginExecutionFilter + 文件头「源码核实的插件语义」）——本用例以限流拒绝作为
  // 熔断算子可观测的失败信号驱动 OPEN，断言的是断路器自身的状态机契约：
  // CLOSED(放行) → 限流(429) → OPEN(503 空体) → 对照路由全程不受影响。
  const burst: Array<{ status: number; text: string }> = []
  for (let i = 0; i < 8; i++) {
    const r = await call('GET', `${P.cb}/ping`)
    burst.push({ status: r.status, text: r.text })
  }
  const seq = burst.map((b) => b.status)
  console.log(`[circuit-breaker] 状态序列 ${seq.join(',')}`)
  const first200 = seq.indexOf(200)
  const first429 = seq.indexOf(429)
  const first503 = seq.indexOf(503)
  expect(first200 >= 0, `闭合期至少应放行 1 个 200，实际 ${seq.join(',')}`).toBeTruthy()
  expect(first429 > first200, `应出现限流 429 且晚于首个 200，实际 ${seq.join(',')}`).toBeTruthy()
  expect(
    first503 > first429,
    `熔断 OPEN 后应出现 503 且晚于限流 429，实际 ${seq.join(',')}（若一直 429/200：失败率未达阈值或熔断器未被驱动）`,
  ).toBeTruthy()
  const trailing503 = seq.slice(first503).filter((s) => s === 503).length
  expect(
    trailing503 >= 2,
    `OPEN 后应持续短路（≥2 个 503），实际尾部 ${seq.slice(first503).join(',')}`,
  ).toBeTruthy()
  for (const b of burst.filter((b) => b.status === 503)) {
    expect(b.text, `503 应为熔断短路空体（CallNotPermitted → setComplete），实际 body=${b.text.slice(0, 120)}`).toBe('')
  }

  // 归属对照：同窗口内无绑定路由不短路（503 只属于 cb 路由）
  for (let i = 0; i < 2; i++) {
    const ctrl = await call('GET', `${P.cc}/ping`)
    expect(
      ctrl.status === 200 && ctrl.body?.tag === CTRL_ECHO.tag,
      `对照路由应正常 200（熔断按路由隔离），实际 ${ctrl.status} tag=${ctrl.body?.tag}`,
    ).toBe(true)
  }
})

// ---------- 场景 7：sentinel ----------
test('场景7 sentinel：同秒超阈值流量 429，未绑定对照路由不受影响', async () => {
  const burst: number[] = []
  for (let i = 0; i < 10; i++) {
    const r = await call('GET', `${P.sn}/ping`)
    burst.push(r.status)
  }
  const first200 = burst.indexOf(200)
  const first429 = burst.indexOf(429)
  console.log(`[sentinel] 状态序列 ${burst.join(',')}`)
  expect(
    first200 >= 0,
    `阈值内至少应放行 1 个 200，实际序列 ${burst.join(',')}（QPS 规则 resource=${P.sn}/ping count=3）`,
  ).toBeTruthy()
  expect(
    first429 > first200,
    `超阈值应出现 429 且晚于首个 200，实际序列 ${burst.join(',')}（若全 200：规则未加载或窗口跨秒）`,
  ).toBeTruthy()

  // 归属对照：同一秒内，未绑定 sentinel 的路由不受该规则影响
  for (let i = 0; i < 3; i++) {
    const ctrl = await call('GET', `${P.cc}/ping`)
    expect(
      ctrl.status === 200 && ctrl.body?.tag === CTRL_ECHO.tag,
      `对照路由应正常 200（不受 sentinel 规则影响），实际 ${ctrl.status} tag=${ctrl.body?.tag}`,
    ).toBe(true)
  }
  // 残留说明：FlowRuleManager 是 JVM 级静态规则，用例结束后规则仍指向本运行专属路径（gwtest 唯一），
  // 下一次 sentinel 配置推送（本用例或他人）会整体 loadRules 覆盖，无需也不值得为清理多等一个轮询周期。
})

// ---------- 场景 8：oauth2 ----------
test('场景8 oauth2：无 token 302 跳转 / introspection 拒绝或故障 401 / 合法令牌放行 200', async () => {
  // IdP 已自建：tokenUri 指向本 spec 的 19004 /oauth/introspect 桩 —— 无需外部系统，不降级
  const none = await call('GET', `${P.oa}/ping`)
  expect(none.status, `无 token 应 302 跳 authorizationUri，实际 ${none.status}`).toBe(302)
  expect(
    none.headers['location'] ?? '',
    `302 Location 应携带 authorization code 流参数，实际 ${none.headers['location']}`,
  ).toContain('response_type=code')

  const invalid = await call('GET', `${P.oa}/ping`, { headers: { authorization: `Bearer ${OAUTH_INVALID}` } })
  expect(invalid.status, `introspection active:false 应 401，实际 ${invalid.status}`).toBe(401)

  const srvfail = await call('GET', `${P.oa}/ping`, { headers: { authorization: `Bearer ${OAUTH_SRVFAIL}` } })
  expect(srvfail.status, `introspection 端点 500 应 401（fail-closed），实际 ${srvfail.status}`).toBe(401)

  const valid = await call('GET', `${P.oa}/ping`, { headers: { authorization: `Bearer ${OAUTH_VALID}` } })
  expect(valid.status, `合法令牌应 200，实际 ${valid.status} body=${valid.text.slice(0, 200)}`).toBe(200)
  expect(ownsEcho(valid, `${P.oa}/ping`), `正例归属不符：tag=${valid.body?.tag} path=${valid.body?.path}`).toBe(true)
  // 注入观测（不断言）：OAuth2Plugin introspection 通过后注入 X-User/X-Username/X-OAuth2-Scope，
  // 但与 basic-auth 同理 —— 插件链内 mutate 的请求不会传给 SCG 转发，上游收不到这些头（现状记录）。
  if (valid.body?.header_x_user) {
    console.log(`[oauth2] X-User 注入观测：${valid.body.header_x_user} scope=${valid.body?.header_x_oauth2_scope}`)
  }
})

// ---------- 场景 9：fail-open 契约 ----------
test('场景9 fail-open 契约：绑定安全插件但配置为空 → 直通 200 而非 500/401', async () => {
  test.setTimeout(240_000)
  // 把 key-auth / basic-auth 两行配置 PATCH 成 {}：两插件对空配置均应放行（源码分支：
  // KeyAuthPlugin keyName/key 空白 → chain.execute；BasicAuthPlugin accounts 空 → chain.execute）
  await patchPluginConfig(pluginRowIds.get('ka')!, {})
  await patchPluginConfig(pluginRowIds.get('ba')!, {})
  await waitReady('fail-open 路由直通', async () => {
    const r = await call('GET', `${P.fo}/ping`)
    // 就绪判定即契约本身：空配置必须直通（200），401=插件 fail-closed（违约），500/404=链路异常
    return { ready: r.status === 200, desc: `空配置 http=${r.status}` }
  })

  const pass = await call('GET', `${P.fo}/ping`)
  expect(
    pass.status,
    `空配置的安全插件应放行（fail-open 契约），实际 ${pass.status} body=${pass.text.slice(0, 200)}`,
  ).toBe(200)
  expect(ownsEcho(pass, `${P.fo}/ping`), `fail-open 直通应到达后端：tag=${pass.body?.tag} path=${pass.body?.path}`).toBe(
    true,
  )
  // 注：jwt（HS 无 secretKey → 401）与 oauth2（无 authorizationUri → 401）是 fail-CLOSED 语义，
  // 不属于本契约的正例集合，详见文件头源码核实记录。
})

// ---------- 场景 10：9300 管理面不可达（P0-1 配套回归） ----------
test('场景10 管理面不可达：9300 上 /v1/users 与 /v1/routes 不得 200【依赖主 agent 重启后生效】', async () => {
  // ⚠ 已知现状：9300 尚未修复，管理端点在数据面上返回 200 —— 本用例当前会失败（红是预期），
  //   标注「依赖主 agent 重启后生效」，主 agent 统一重启后全量跑即应转绿。
  const ctx = await pwRequest.newContext() // 匿名客户端（模拟外部攻击面）
  try {
    const users = await ctx.get(`${GATEWAY}/v1/users`)
    expect(
      [404, 401].includes(users.status()),
      `9300 /v1/users 应 404/401（管理面不得暴露在数据面），实际 ${users.status()}`,
    ).toBe(true)
    const routes = await ctx.get(`${GATEWAY}/v1/routes`)
    expect(
      [404, 401].includes(routes.status()),
      `9300 /v1/routes 应 404/401（管理面不得暴露在数据面），实际 ${routes.status()}`,
    ).toBe(true)
  } finally {
    await ctx.dispose()
  }
})
