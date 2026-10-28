import axios, { AxiosInstance, InternalAxiosRequestConfig } from 'axios'

const TOKEN_KEY = 'gw4j_token'

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}
export function setToken(t: string | null) {
  if (t) localStorage.setItem(TOKEN_KEY, t)
  else localStorage.removeItem(TOKEN_KEY)
}

// Business error codes from the server envelope (PRD 4.2)
export const ERR_VALIDATION = 10100
export const ERR_PERMISSION_DENIED = 10300
export const ERR_RATE_LIMITED = 10500
export const ERR_DUPLICATE_SUBMIT = 10501

export interface FieldError {
  field: string
  code: string
  message: string
  value: unknown
}

export class BusinessError extends Error {
  code: number
  retryAfter?: number
  errors?: FieldError[]

  constructor(code: number, message = 'Business error', retryAfter?: number, errors?: FieldError[]) {
    super(message)
    this.name = 'BusinessError'
    this.code = code
    this.retryAfter = retryAfter
    this.errors = errors
  }
}

// ===== D13: 错误文案归一 (避免后端原始错误报文透出到页面展示层) =====
// 已知业务码 → 友好中文文案 (API_CONTRACT 2.5 错误码表).
const FRIENDLY_ERROR_MESSAGES: Record<number, string> = {
  10100: '提交的内容有误，请检查后重试',
  10101: '有必填项未填写，请补全后重试',
  10102: '填写内容的格式不正确，请修改后重试',
  10200: '尚未登录或登录已过期，请重新登录',
  10201: '登录已过期，请重新登录',
  10300: '权限不足',
  10400: '目标资源不存在或已被删除',
  10401: '名称已存在，请修改后重试',
  10402: '当前状态不允许该操作',
  10500: '请求过于频繁，请稍后重试',
  10501: '请勿重复操作',
  10600: '插件包校验失败，请检查后重试',
  10601: '脚本编译失败，请检查脚本内容',
  10602: '插件未实现 SDK 接口',
  10603: '存在循环引用，请调整后重试',
  10604: '分发路由嵌套层级超限',
  10699: '网关引擎内部错误，请稍后重试'
}

/** 未知码 / 5xx 的兜底文案; 命中原始报文特征时也用它覆盖. */
export const GENERIC_ERROR_MESSAGE = '操作失败，请稍后重试'

// 命中这些特征的服务端 message 视为原始报文 (如全局异常兜底文案 / 带 trace_id 的串),
// 不直接透出给展示层, 按业务码映射或兜底文案展示.
const RAW_MESSAGE_PATTERN = /trace[_-]?id|系统繁忙|未知异常|未知错误|exception|internal server error/i

/**
 * Compute the user-facing message for a business error:
 *  - server message present and looks like a real business message → pass through;
 *  - empty / raw-looking (系统繁忙, trace_id, Exception...) → map by known code, else fallback.
 * Field-level errors (BusinessError.errors) are NOT touched here — they feed
 * mapFieldErrors() and must keep the server's per-field wording.
 */
export function toDisplayMessage(code: number | undefined, rawMessage: unknown, fallback: string): string {
  const raw = typeof rawMessage === 'string' ? rawMessage.trim() : ''
  if (!raw || RAW_MESSAGE_PATTERN.test(raw)) {
    return (code != null && FRIENDLY_ERROR_MESSAGES[code]) || fallback
  }
  return raw
}

// ===== D18: 分页元数据归一 =====
// 后端 Long 统一序列化为字符串 (framework4j-web 契约), 分页载荷的 total/size/current/pages
// 会以 "11" 形式到达前端; el-pagination 对 :total 做数字类型校验, 字符串会触发内部
// assertValidUsage 失败 → 整个分页控件不渲染. 响应归一层统一 Number() 化.
const PAGE_NUMERIC_KEYS = ['total', 'size', 'current', 'pages'] as const

export function normalizePagination<T>(payload: T): T {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return payload
  const o = payload as Record<string, unknown>
  // 仅处理分页形状的载荷 { records, total, size, current, pages } (无论根还是 data 里)
  if (!('records' in o)) return payload
  const out: Record<string, unknown> = { ...o }
  for (const k of PAGE_NUMERIC_KEYS) {
    const v = out[k]
    if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) {
      out[k] = Number(v)
    }
  }
  return out as T
}

/**
 * Map BusinessError.errors[] to a field→message record for el-form integration.
 * Returns {} for non-BusinessError or when no field errors are present.
 */
export function mapFieldErrors(err: unknown): Record<string, string> {
  if (!(err instanceof BusinessError) || !err.errors) return {}
  const out: Record<string, string> = {}
  for (const e of err.errors) {
    if (e.field) out[e.field] = e.message
  }
  return out
}

export const http: AxiosInstance = axios.create({
  baseURL: '/',
  timeout: 30_000,
  headers: { 'Content-Type': 'application/json' }
})

const WRITE_METHODS = new Set(['post', 'put', 'patch', 'delete'])

let _onTokenRefresh: (() => Promise<string | null>) | null = null

/** Register a token refresh callback (called by auth store to avoid circular deps). */
export function setOnTokenRefresh(fn: (() => Promise<string | null>) | null) {
  _onTokenRefresh = fn
}

let _isRefreshing = false
let _refreshPromise: Promise<string | null> | null = null

async function tryRefreshToken(): Promise<string | null> {
  if (_isRefreshing && _refreshPromise) return _refreshPromise
  if (!_onTokenRefresh) return null
  _isRefreshing = true
  _refreshPromise = _onTokenRefresh().finally(() => {
    _isRefreshing = false
    _refreshPromise = null
  })
  return _refreshPromise
}

http.interceptors.request.use((cfg: InternalAxiosRequestConfig) => {
  const tok = getToken()
  if (tok) cfg.headers.set('Authorization', `Bearer ${tok}`)
  cfg.headers.set('X-Trace-Id', crypto.randomUUID())
  if (WRITE_METHODS.has(cfg.method?.toLowerCase() ?? '')) {
    cfg.headers.set('Idempotency-Key', crypto.randomUUID())
  }
  return cfg
})

http.interceptors.response.use(
  (r) => {
    // 响应归一层: 对分页形状的载荷 (data 内或根上) 把 total/size/current/pages 归一为 number
    const body = r?.data
    if (body && typeof body === 'object') {
      const b = body as Record<string, unknown>
      if ('data' in b) b.data = normalizePagination(b.data)
      else if ('records' in b) return normalizePagination(body)
    }
    return body
  },
  async (err) => {
    const originalConfig = err?.config
    if (err?.response?.status === 401 && originalConfig && !originalConfig._retried) {
      const newToken = await tryRefreshToken()
      if (newToken) {
        originalConfig._retried = true
        originalConfig.headers.set('Authorization', `Bearer ${newToken}`)
        return http.request(originalConfig)
      }
      setToken(null)
      if (!location.pathname.startsWith('/login')) {
        location.href = '/login'
      }
    }
    const status: number = err?.response?.status ?? 0
    const data = err?.response?.data
    if (data && typeof data === 'object' && 'code' in data && (data.code ?? 0) !== 0) {
      return Promise.reject(
        new BusinessError(data.code ?? -1, toDisplayMessage(data.code, data.message, GENERIC_ERROR_MESSAGE), data.retry_after, data.error)
      )
    }
    // HTTP 层错误 (无业务信封): 5xx 或原始报文特征 → 兜底文案, 不透出原始报文
    const rawMsg = (typeof data?.message === 'string' && data.message) || err?.message || 'Request failed'
    const msg = status >= 500 || RAW_MESSAGE_PATTERN.test(rawMsg) ? GENERIC_ERROR_MESSAGE : rawMsg
    return Promise.reject(new Error(msg))
  }
)

/**
 * Gateway4j 信封响应：{ code, message, data, ... }
 * code === 0 视为成功；这里把 data 解包为 resolved value，非 0 抛 BusinessError
 */
export async function envelope<T = unknown>(p: Promise<unknown>): Promise<T> {
  const r = (await p) as { code?: number; data?: T; message?: string; retry_after?: number; error?: FieldError[] }
  if (r && typeof r === 'object' && 'code' in r) {
    if ((r.code ?? 0) !== 0) {
      throw new BusinessError(r.code ?? -1, toDisplayMessage(r.code, r.message, GENERIC_ERROR_MESSAGE), r.retry_after, r.error)
    }
    return normalizePagination(r.data) as T
  }
  // 无信封载荷: 分页形状时归一分页元数据 (其余原样透传)
  return normalizePagination(r) as T
}
