import { http } from '../request'
import { ApiError } from '../errorCodes'
import type { ApiFieldError } from '../errorCodes'

/**
 * Gateway4j 信封响应解包: { code, message, data, error[] }
 * code === 0 视为成功，返回 data；非 0 抛 ApiError。
 */
export async function envelope<T = unknown>(p: Promise<unknown>): Promise<T> {
  const r = (await p) as {
    code?: number
    data?: T
    message?: string
    retry_after?: number
    error?: ApiFieldError[]
  }
  if (r && typeof r === 'object' && 'code' in r) {
    if ((r.code ?? -1) !== 0) {
      throw new ApiError(r.code ?? -1, r.message ?? 'Business error', {
        details: Array.isArray(r.error) ? r.error : undefined,
      })
    }
    return r.data as T
  }
  // 非 envelope 格式 (如 204 No Content)，直接返回
  return r as T
}

/**
 * Map ApiError.details[] to field→message record for el-form integration.
 */
export function mapFieldErrors(err: unknown): Record<string, string> {
  if (!(err instanceof ApiError) || !err.details) return {}
  const out: Record<string, string> = {}
  for (const e of err.details) {
    if (e.field) out[e.field] = e.message
  }
  return out
}
