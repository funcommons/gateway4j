import { createVNode, render, getCurrentInstance, type VNode, type AppContext } from 'vue'
import FcConfirm from '@/components/sdk/overlay/FcConfirm.vue'

type ConfirmVariant = 'default' | 'danger' | 'primary'

interface ConfirmOptions {
  title?: string
  content?: string
  variant?: ConfirmVariant
  confirmText?: string
  cancelText?: string
}

export function useFcConfirm() {
  const instance = getCurrentInstance()
  const appContext: AppContext | undefined = instance?.appContext

  function confirm(options: ConfirmOptions = {}): Promise<boolean> {
    return new Promise((resolve) => {
      const container = document.createElement('div')
      document.body.appendChild(container)

      let vnode: VNode | null = null

      function onConfirm() {
        cleanup()
        resolve(true)
      }

      function onCancel() {
        cleanup()
        resolve(false)
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
          if (!val) {
            cleanup()
            resolve(false)
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
