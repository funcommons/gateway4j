import '@/components/theme/theme.scss'
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
// SDK 图标契约：FcIcon / SDK 内部组件统一用 remix-icon class（ri-*），
// 必须引入图标字体样式，否则这些图标渲染为空的 <i> 元素。
import 'remixicon/fonts/remixicon.css'
import * as ElementPlusIcons from '@element-plus/icons-vue'

import App from './App.vue'
import { router } from './router'
import { i18n } from './i18n'

const app = createApp(App)
for (const [k, v] of Object.entries(ElementPlusIcons)) {
  app.component(`EpIcon${k}`, v as never)
}
app.use(createPinia())
app.use(ElementPlus)
app.use(router)
app.use(i18n)
app.mount('#app')
