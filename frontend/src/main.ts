import { createApp } from 'vue'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import 'remixicon/fonts/remixicon.css'
import * as ElementPlusIconsVue from '@element-plus/icons-vue'

import App from './App.vue'
import router from './router'
import pinia from './store'
import i18n from './locales'

import './styles/index.scss'
import { transformImageUrl, handleError, logger } from './utils'
import { setUserStoreGetter } from './api/request'
import { useOemStore, loadOemConfigSync } from './store/oem'

const app = createApp(App)

// 注册 Element Plus
app.use(ElementPlus)

// 注册所有 Element Plus 图标
for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
  app.component(key, component)
}

// 全局属性 - 图片URL转换函数
app.config.globalProperties.$img = transformImageUrl

// 全局错误兜底：捕获组件渲染错误
app.config.errorHandler = (err) => {
  logger.error('[Vue Error]', err)
  handleError(err, i18n.global.t('common.page-error'))
}

// 全局兜底：捕获未处理的 Promise 拒绝
window.addEventListener('unhandledrejection', (event) => {
  logger.error('[Unhandled Rejection]', event.reason)
  handleError(event.reason, i18n.global.t('api.request-failed'))
})

// 注册路由和状态管理
app.use(router)
app.use(pinia)
app.use(i18n)

// 注入 userStore 到 request 拦截器 (避免循环依赖)
// 必须在 pinia 注册之后调用, 否则 store 未初始化
// Gateway4j: 使用 gateway-auth store 提供 token/refresh
import { useGatewayAuthStore } from './store/gateway-auth'
setUserStoreGetter(() => {
  const auth = useGatewayAuthStore()
  return {
    accessToken: auth.accessToken,
    refreshToken: auth.refreshToken,
    refreshAccessToken: () => auth.refreshAccessToken(),
    clearAuth: () => auth.clearAuth(),
    hasToken: auth.hasToken,
  }
})

// OEM 白标配置: 同步读本地缓存 (无网络), 立即 apply 避免 first paint 闪默认;
// 然后异步从后端拉取最新配置, 再次 apply 覆盖; 最终在 app.mount 前完成.
//
// 注意: brand/theme 属性由 FcThemeProvider (在 App.vue 内) 管理,
// OEM config.brand/theme 通过 initialBrand/initialTheme prop 传给 Provider 作为兜底默认.
// OEM apply 只设置 title / favicon / --el-color-* 等非主题属性.
const oemStore = useOemStore()
const currentHost = typeof window !== 'undefined' ? window.location.host : null
const cachedConfig = loadOemConfigSync(currentHost)
if (cachedConfig) {
  oemStore.$patch({ config: { ...oemStore.config, ...cachedConfig } })
  oemStore.apply()
}

oemStore.load(currentHost).then(() => {
  oemStore.apply()
}).finally(() => {
  app.mount('#app')
})
