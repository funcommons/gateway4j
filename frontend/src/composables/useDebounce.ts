import { ref, watch, onUnmounted, getCurrentInstance, type Ref } from 'vue'

/**
 * Reactive debounce: returns a Ref<T> that mirrors `source` after the
 * last change has remained stable for `delay` ms. Last-call-wins semantics.
 */
export function useDebounce<T>(source: Ref<T>, delay = 300): Ref<T> {
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
