import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'node:path'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') }
  },
  server: {
    port: 9302,
    proxy: {
      '/v1': { target: 'http://localhost:9301', changeOrigin: true }
    }
  },
  css: {
    preprocessorOptions: {
      scss: { api: 'modern-compiler' }
    }
  },
  build: {
    rollupOptions: {
      output: {
        // ── P3-g（2026-11-10）：manualChunks 拆主包 ─────────────────────────
        // 主 chunk 曾达 1369KB（> 500KB 预警线），因为 element-plus 全量 +
        // vue 生态全部打进单个 index chunk。按依赖路径拆成 3 个 vendor 组：
        //   vue-vendor    vue/@vue/*、vue-router、pinia/vue-demi、vue-i18n/@intlify/*
        //   element-plus  element-plus + 其全部运行时依赖（含嵌套安装的 @vueuse v14）
        //   vue-flow      @vue-flow/* + d3-* + 根安装的 @vueuse v10（仅 Canvas 懒路由消费）
        // 纯分包、零运行时行为变化；目标 = 主 chunk 显著下降 + 缓存粒度改善。
        manualChunks(id) {
          // FcCodeEditor 懒加载边界（P3-g 红线）：CodeMirror 系【绝不】归入任何
          // vendor 组，返回 undefined 交给 Rollup 默认切分 → 仍随 FcCodeEditor.vue
          // 留在动态 import 的独立 async chunk（见 Editor.vue OPT-5 契约与
          // src/components-v2/editor/__tests__/FcCodeEditor.test.ts）。
          const nm = id.lastIndexOf('node_modules/')
          if (nm < 0) return undefined
          const rest = id.slice(nm + 'node_modules/'.length)
          const segs = rest.split('/')
          const pkg = segs[0].startsWith('@') ? `${segs[0]}/${segs[1]}` : segs[0]
          if (pkg === 'codemirror' || pkg.startsWith('@codemirror')) return undefined
          // element-plus 自带嵌套依赖（npm 不提升时落在 element-plus/node_modules/ 下，
          // 如 @vueuse/core v14）——按归属切给 element-plus，而不是内层包名。
          if (id.includes('/element-plus/node_modules/')) return 'element-plus'
          if (pkg === 'echarts' || pkg === 'zrender') return 'echarts'
          if (
            pkg === 'element-plus' ||
            pkg === '@element-plus/icons-vue' ||
            pkg === '@sxzz/popperjs-es' ||
            pkg === '@ctrl/tinycolor' ||
            pkg === '@floating-ui/dom' ||
            pkg === 'async-validator' ||
            pkg === 'dayjs' ||
            pkg === 'lodash' ||
            pkg === 'lodash-es' ||
            pkg === 'lodash-unified' ||
            pkg === 'normalize-wheel-es' ||
            pkg === 'memoize-one'
          ) {
            return 'element-plus'
          }
          if (
            pkg === 'vue' ||
            pkg.startsWith('@vue/') ||
            pkg === 'vue-router' ||
            pkg === 'pinia' ||
            pkg === 'vue-demi' ||
            pkg === 'vue-i18n' ||
            pkg.startsWith('@intlify/')
          ) {
            return 'vue-vendor'
          }
          if (
            pkg.startsWith('@vue-flow/') ||
            pkg === '@vueuse/core' || // 根安装 v10：仅 @vue-flow 消费（Canvas 懒路由）
            pkg.startsWith('d3-')
          ) {
            return 'vue-flow'
          }
          // 其余 node_modules（axios、remixicon 等）不分组 → 随应用代码留在主 chunk
          return undefined
        }
      }
    }
  },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.test.ts']
  }
})
