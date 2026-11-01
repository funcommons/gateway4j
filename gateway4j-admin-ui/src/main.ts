import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
// 样式顺序要紧：EP 自身的 CSS（含暗色 token）必须排在 theme.scss 之前 ——
// theme.scss 里的 `html:root` 桥接层要压过 EP 的 :root / html.dark。
import 'element-plus/dist/index.css'
import 'element-plus/theme-chalk/dark/css-vars.css'
import '@/components/theme/theme.scss'
// SDK 图标契约：FcIcon / SDK 内部组件统一用 remix-icon class（ri-*），
// 必须引入图标字体样式，否则这些图标渲染为空的 <i> 元素。
import 'remixicon/fonts/remixicon.css'
import * as ElementPlusIcons from '@element-plus/icons-vue'

import App from './App.vue'
import { router } from './router'
import { i18n } from './i18n'

// Hallmark gate 62：过渡的初始隐藏态必须挂在 .js 作用域下 —— 脚本失效时内容仍可见
document.documentElement.classList.add('js')

const app = createApp(App)
for (const [k, v] of Object.entries(ElementPlusIcons)) {
  app.component(`EpIcon${k}`, v as never)
}
app.use(createPinia())
app.use(ElementPlus)
app.use(router)
app.use(i18n)
app.mount('#app')
