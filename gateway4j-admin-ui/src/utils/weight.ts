/**
 * P2-4 权重分流条件（WEIGHT）共用常量与解析。
 *
 * 契约：condition_type='WEIGHT' 时 condition_key 存 1~100 的正整数字符串
 * （如 "20"/"80"），condition_value 留空；同优先级候选按权重比例分流。
 */

export const WEIGHT_MIN = 1
export const WEIGHT_MAX = 100

/** 解析权重数字串：非法/越界返回 null（交由调用方提示，不静默改值） */
export function parseWeight(key: unknown): number | null {
  const s = String(key ?? '').trim()
  if (!/^\d+$/.test(s)) return null
  const n = Number(s)
  if (!Number.isSafeInteger(n) || n < WEIGHT_MIN || n > WEIGHT_MAX) return null
  return n
}
