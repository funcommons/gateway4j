import '@/components/theme/theme.scss'
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
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
