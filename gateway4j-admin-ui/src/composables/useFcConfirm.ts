import { createVNode, render, getCurrentInstance, type VNode, type AppContext } from 'vue'
import FcConfirm from '@/components/overlay/FcConfirm.vue'

type ConfirmVariant = 'default' | 'danger' | 'primary'

interface ConfirmOptions {
  title?: string
  content?: string
  variant?: ConfirmVariant
  confirmText?: string
  cancelText?: string
}

/**
 * useFcConfirm — imperative confirm dialog (composable).
 *
 * Usage:
 *   const { confirm } = useFcConfirm()
 *   if (await confirm({ title: 'Delete?', variant: 'danger' })) { ... }
 *
 * Internally creates a FcConfirm instance via createVNode + render,
 * appends to document.body, and removes it after the dialog closes.
 * Inherits the current app context (i18n, pinia, etc.) so that
 * FcConfirm's useI18n() works correctly.
 */
export function useFcConfirm() {
  const instance = getCurrentInstance()
  const appContext: AppContext | undefined = instance?.appContext

  function confirm(options: ConfirmOptions = {}): Promise<boolean> {
    return new Promise((resolve) => {
      const container = document.createElement('div')
      document.body.appendChild(container)

      let vnode: VNode | null = null

      // A Promise settles only once. FcConfirm emits 'confirm'/'cancel' first
      // and 'update:open' false afterwards, so the settled guard prevents the
      // later update:open from overwriting (or double-running cleanup after)
      // the real result.
      let settled = false

      function settle(result: boolean) {
        if (settled) return
        settled = true
        cleanup()
        resolve(result)
      }

      function onConfirm() {
        settle(true)
      }

      function onCancel() {
        settle(false)
      }

      function cleanup() {
        if (vnode) {
          render(null, container)
          vnode = null
        }
        if (container.parentNode) {
          container.parentNode.removeChild(container)
        }
      }

      vnode = createVNode(FcConfirm, {
        open: true,
        title: options.title,
        content: options.content,
        variant: options.variant,
        confirmText: options.confirmText,
        cancelText: options.cancelText,
        closeOnClickModal: false,
        'onUpdate:open': (val: boolean) => {
          if (!val && !settled) {
            settle(false)
          }
        },
        onConfirm,
        onCancel,
      })
      if (appContext) {
        vnode.appContext = appContext
      }
      render(vnode, container)
    })
  }

  return { confirm }
}
