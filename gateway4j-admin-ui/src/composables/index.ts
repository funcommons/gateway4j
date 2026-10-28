// Project-level composables stub. The Fc SDK components may import from
// '@/composables' expecting project utilities (useResize, useDebounce, etc.)
// We provide minimal no-op equivalents so the build succeeds.

import { ref, computed, watch, onUnmounted, getCurrentInstance, type Ref, type ComputedRef } from 'vue'

export function useResize(cb: () => void) {
  if (typeof window !== 'undefined') {
    window.addEventListener('resize', cb)
  }
  return { stop: () => window.removeEventListener('resize', cb) }
}

/**
 * Reactive debounce: returns a Ref<T> that mirrors `source` after the
 * last change has remained stable for `delay` ms. Last-call-wins semantics.
 */
export function useDebounce<T>(source: Ref<T>, delay = 200): Ref<T> {
  const out = ref(source.value) as Ref<T>
  let h: ReturnType<typeof setTimeout> | null = null
  const stop = watch(source, (v) => {
    if (h) clearTimeout(h)
    h = setTimeout(() => { out.value = v; h = null }, delay)
  })
  if (getCurrentInstance()) {
    onUnmounted(() => {
      if (h) clearTimeout(h)
      stop()
    })
  }
  return out
}

/**
 * Reactive throttle: returns a Ref<T> that emits the leading value
 * immediately, then the trailing value after the window elapses.
 * Within the window, intermediate changes are dropped.
 */
export function useThrottle<T>(source: Ref<T>, delay = 200): Ref<T> {
  const out = ref(source.value) as Ref<T>
  let last = 0
  let pending: ReturnType<typeof setTimeout> | null = null
  let pendingValue: T | undefined = undefined
  const stop = watch(source, (v) => {
    const now = Date.now()
    if (now - last >= delay) {
      last = now
      out.value = v
    } else {
      pendingValue = v
      if (!pending) {
        pending = setTimeout(() => {
          pending = null
          if (pendingValue !== undefined) {
            last = Date.now()
            out.value = pendingValue as T
            pendingValue = undefined
          }
        }, delay - (now - last))
      }
    }
  })
  if (getCurrentInstance()) {
    onUnmounted(() => {
      if (pending) clearTimeout(pending)
      stop()
    })
  }
  return out
}

export function useEventListener(el: unknown, event: string, cb: (...args: any[]) => void) {
  if (el && (el as any).addEventListener) {
    (el as any).addEventListener(event, cb)
    if (getCurrentInstance()) {
      onUnmounted(() => {
        if ((el as any).removeEventListener) {
          (el as any).removeEventListener(event, cb)
        }
      })
    }
  }
}

export function useDocumentVisibility() {
  if (typeof document !== 'undefined') {
    return document.visibilityState === 'visible'
  }
  return true
}

/**
 * useResponsive: 响应式窗口尺寸 + 断点标志。
 * 监听 window 'resize' 事件，组件内 reactive refs 自动随窗口变化更新。
 * SSR 安全：window 不存在时返回零值 + isDesktop=true（保守默认）。
 */
export function useResponsive() {
  const width = ref(0)
  const height = ref(0)
  const ssr = typeof window === 'undefined'
  function update() {
    width.value = window.innerWidth
    height.value = window.innerHeight
  }
  if (!ssr) {
    update()
    window.addEventListener('resize', update)
    if (getCurrentInstance()) {
      onUnmounted(() => window.removeEventListener('resize', update))
    }
  }
  const isMobile = computed(() => !ssr && width.value > 0 && width.value < 768)
  const isTablet = computed(() => !ssr && width.value >= 768 && width.value < 1024)
  // SSR default: isDesktop=true (safe — render desktop layout)
  const isDesktop = computed(() => ssr || width.value >= 1024)
  return { width, height, isMobile, isTablet, isDesktop }
}

/**
 * useMouse: 跟踪窗口 mousemove 事件，暴露响应式 x/y 坐标。
 * 返回的 x/y 在 setup 之外使用时需保持 reactivity。
 */
export function useMouse() {
  const x = ref(0)
  const y = ref(0)
  if (typeof window !== 'undefined') {
    const handler = (e: MouseEvent) => { x.value = e.clientX; y.value = e.clientY }
    window.addEventListener('mousemove', handler)
    if (getCurrentInstance()) {
      onUnmounted(() => window.removeEventListener('mousemove', handler))
    }
  }
  return { x, y }
}

/**
 * useClipboard: 复制/粘贴文本。
 * 优先用 navigator.clipboard（现代浏览器），降级到 document.execCommand（旧浏览器）。
 */
export function useClipboard() {
  async function copy(text: string): Promise<void> {
    if ((navigator as any).clipboard?.writeText) {
      await (navigator as any).clipboard.writeText(text)
      return
    }
    if (typeof document !== 'undefined' && document.execCommand) {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
      return
    }
    throw new Error('useClipboard.copy: no clipboard mechanism available')
  }
  async function paste(): Promise<string> {
    if ((navigator as any).clipboard?.readText) {
      return await (navigator as any).clipboard.readText()
    }
    if (typeof document !== 'undefined' && document.execCommand) {
      const out = document.execCommand('paste')
      if (typeof out === 'string') return out
      return ''
    }
    throw new Error('useClipboard.paste: no clipboard mechanism available')
  }
  return { copy, paste }
}

/**
 * useRecentImages: 图片选择器的"最近使用"列表管理，localStorage 持久化。
 *
 * 用法:
 *   const { images, add, remove, clear, getAll } = useRecentImages('fc-image-picker:recent')
 *   add('https://cdn/a.png')      // 去重，新图插到头部
 *   remove('https://cdn/a.png')   // 从列表移除
 *   clear()                       // 清空
 *   getAll()                      // 同步获取当前列表快照
 *
 * 存储格式: localStorage[key] = JSON string array
 * 异常处理: 损坏的 JSON 或非数组 → 视为空列表
 */
export function useRecentImages(storageKey = 'fc-image-picker:recent') {
  const images = ref<string[]>(loadKey(storageKey))

  function persist() {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(storageKey, JSON.stringify(images.value))
  }

  function add(url: string) {
    if (!url) return
    const next = [url, ...images.value.filter((u) => u !== url)]
    images.value = next
    persist()
  }

  function remove(url: string) {
    const next = images.value.filter((u) => u !== url)
    if (next.length === images.value.length) return
    images.value = next
    persist()
  }

  function clear() {
    images.value = []
    if (typeof localStorage !== 'undefined') localStorage.removeItem(storageKey)
  }

  function getAll(): string[] {
    return [...images.value]
  }

  return { images, add, remove, clear, getAll }
}

function loadKey(key: string): string[] {
  if (typeof localStorage === 'undefined') return []
  const raw = localStorage.getItem(key)
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed) && parsed.every((x) => typeof x === 'string')) {
      return parsed as string[]
    }
  } catch {
    // fall through
  }
  return []
}

/**
 * Convert an image file to a different mime type via canvas re-encoding.
 * Returns a Promise<Blob>. Caller may pass an explicit mime type or omit
 * to get a PNG by default.
 */
export function convertImage(file: Blob, mime = 'image/png'): Promise<Blob> {
  return new Promise((resolve, reject) => {
    if (typeof document === 'undefined') {
      reject(new Error('convertImage: not in a browser environment'))
      return
    }
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.naturalWidth
      canvas.height = img.naturalHeight
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        URL.revokeObjectURL(url)
        reject(new Error('convertImage: failed to acquire 2d context'))
        return
      }
      ctx.drawImage(img, 0, 0)
      canvas.toBlob((blob) => {
        URL.revokeObjectURL(url)
        if (!blob) {
          reject(new Error('convertImage: toBlob returned null'))
          return
        }
        // Re-type to the requested mime if browser stored a different one
        if (blob.type !== mime) {
          resolve(new Blob([blob], { type: mime }))
        } else {
          resolve(blob)
        }
      }, mime)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('convertImage: failed to load image'))
    }
    img.src = url
  })
}

/**
 * Downscale an image so its longer edge is at most `max` pixels.
 * If the image is already smaller, returns the input blob unchanged.
 */
export function downscaleToMaxEdge(blob: Blob, max: number): Promise<Blob> {
  if (!max || max <= 0) return Promise.resolve(blob)
  return new Promise((resolve, reject) => {
    if (typeof document === 'undefined') {
      reject(new Error('downscaleToMaxEdge: not in a browser environment'))
      return
    }
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => {
      const w = img.naturalWidth
      const h = img.naturalHeight
      const longest = Math.max(w, h)
      if (longest <= max) {
        URL.revokeObjectURL(url)
        resolve(blob)
        return
      }
      const ratio = max / longest
      const nw = Math.max(1, Math.round(w * ratio))
      const nh = Math.max(1, Math.round(h * ratio))
      const canvas = document.createElement('canvas')
      canvas.width = nw
      canvas.height = nh
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        URL.revokeObjectURL(url)
        reject(new Error('downscaleToMaxEdge: failed to acquire 2d context'))
        return
      }
      ctx.drawImage(img, 0, 0, nw, nh)
      canvas.toBlob((out) => {
        URL.revokeObjectURL(url)
        if (!out) {
          reject(new Error('downscaleToMaxEdge: toBlob returned null'))
          return
        }
        resolve(out)
      }, blob.type || 'image/png')
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('downscaleToMaxEdge: failed to load image'))
    }
    img.src = url
  })
}

export function useBodyScrollLock(lock: Ref<boolean> | ComputedRef<boolean> | boolean) {
  if (typeof document === 'undefined') return
  const isRef = (v: any): v is Ref<boolean> => v !== null && typeof v === 'object' && '__v_isRef' in v
  const stop = watch(
    () => isRef(lock) ? lock.value : lock,
    (v) => {
      document.body.style.overflow = v ? 'hidden' : ''
    },
    { immediate: true }
  )
  if (getCurrentInstance()) {
    onUnmounted(() => {
      stop()
      document.body.style.overflow = ''
    })
  }
}

export { usePermission } from './usePermission'

export default {}
