// Utils stub for SDK imports of '@/utils'

export function resolveIcon(name: string) {
  // Best-effort dynamic icon resolver; SDK components only use this for sidebar.
  // Return null so the calling code falls back to default rendering.
  return null
}

export function formatDate(d: Date | number | string, fmt = 'YYYY-MM-DD HH:mm') {
  const date = d instanceof Date ? d : new Date(d)
  const pad = (n: number) => (n < 10 ? '0' + n : '' + n)
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} `
       + `${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function debounce<T extends (...args: any[]) => void>(fn: T, delay = 200) {
  let h: any
  return (...args: Parameters<T>) => {
    clearTimeout(h)
    h = setTimeout(() => fn(...args), delay)
  }
}

export function throttle<T extends (...args: any[]) => void>(fn: T, delay = 200) {
  let last = 0
  return (...args: Parameters<T>) => {
    const now = Date.now()
    if (now - last >= delay) {
      last = now
      fn(...args)
    }
  }
}

export function deepClone<T>(v: T): T {
  // JSON.stringify silently returns undefined for undefined, then
  // JSON.parse(undefined) throws. Handle null/undefined explicitly.
  if (v === undefined || v === null) return v
  return JSON.parse(JSON.stringify(v))
}

export const logger = {
  info: (...args: any[]) => console.info('[gw]', ...args),
  warn: (...args: any[]) => console.warn('[gw]', ...args),
  error: (...args: any[]) => console.error('[gw]', ...args),
  debug: (...args: any[]) => console.debug('[gw]', ...args)
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

export function deepMerge<T>(a: T, b: Partial<T>): T {
  if (b === undefined || b === null) return a
  if (a === undefined || a === null) return b as T
  if (!isPlainObject(a) || !isPlainObject(b)) {
    if (Array.isArray(a) && Array.isArray(b)) return b.slice() as unknown as T
    return b as T
  }
  const out: Record<string, unknown> = { ...a }
  for (const k of Object.keys(b)) {
    const av = (a as Record<string, unknown>)[k]
    const bv = (b as Record<string, unknown>)[k]
    if (bv === undefined) continue
    if (isPlainObject(av) && isPlainObject(bv)) {
      out[k] = deepMerge(av, bv)
    } else if (Array.isArray(bv)) {
      out[k] = bv.slice()
    } else {
      out[k] = bv
    }
  }
  return out as T
}

export default { resolveIcon, formatDate, debounce, throttle, deepClone, logger, deepMerge }
