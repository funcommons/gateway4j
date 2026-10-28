import { onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import { BusinessError, ERR_PERMISSION_DENIED, ERR_RATE_LIMITED, ERR_DUPLICATE_SUBMIT } from '@/api/http'
import { useRouter } from 'vue-router'

/**
 * Installs a global unhandled-rejection handler that catches BusinessError
 * thrown by envelope() and shows appropriate UI feedback:
 *
 *   10300 (permission denied) → error toast + redirect to /login
 *   10500 (rate limited)      → warning toast with retry countdown
 *   10501 (duplicate submit)  → warning toast
 *   other non-zero codes      → error toast with server message
 *
 * Call in App.vue setup. Returns a stop function for cleanup.
 */
export function useBusinessErrorHandler() {
  const { t } = useI18n()
  const router = useRouter()

  async function handler(event: PromiseRejectionEvent) {
    const err = event.reason
    if (!(err instanceof BusinessError)) return

    // Prevent the default "Unhandled rejection" console error
    event.preventDefault()

    switch (err.code) {
      case ERR_PERMISSION_DENIED:
        ElMessage.error(t('common.permissionDenied'))
        await router.push({ name: 'Login' })
        break
      case ERR_RATE_LIMITED: {
        const seconds = err.retryAfter
        const msg = seconds
          ? t('common.rateLimited', { seconds })
          : t('common.rateLimited', { seconds: '?' })
        ElMessage.warning({ message: msg, duration: 5000 })
        break
      }
      case ERR_DUPLICATE_SUBMIT:
        ElMessage.warning(t('common.duplicateSubmit'))
        break
      default:
        ElMessage.error(err.message || t('common.failed'))
    }
  }

  window.addEventListener('unhandledrejection', handler)
  const stop = () => window.removeEventListener('unhandledrejection', handler)
  onUnmounted(stop)
  return { stop }
}
