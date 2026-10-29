// ESLint 9 flat config —— gateway4j-admin-ui
//
// 定位（H4 / P2-8 工程护栏）：
// - 从零引入的**守底线性**规则集：只拦"真问题"（未使用变量、解析失败、
//   模板硬编码文案等），不做风格/格式类约束（交给编辑器与 code review）。
// - 硬性原则：**当前代码零 error**。任何新规则上线前先跑通
//   `npx eslint .` 全量校验，违规面过大时降级为 warn，禁止为过规则改业务源码。
// - vue-i18n/no-raw-text 目前为 warn：存量模板存在大量硬编码中文文案，
//   迁移到 i18n 是独立工作流（涉及 src/**，归业务侧推进），warn 起步只记账不拦截。
//
// 运行：npm run lint（等价 npx eslint .）

import tseslint from 'typescript-eslint'
import pluginVue from 'eslint-plugin-vue'
import vueI18n from '@intlify/eslint-plugin-vue-i18n'
import globals from 'globals'

export default tseslint.config(
  // —— 全局忽略：构建产物 / 测试输出 / 临时调试脚本（根目录 .probe-tmp.mjs、
  //    dbg-*.mjs 为历史排查残留，候选清理项，不参与 lint）——
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'test-results/**',
      'playwright-report/**',
      'coverage/**',
      '**/*.d.ts',
      '.probe-tmp.mjs',
      'dbg-*.mjs',
    ],
  },

  // —— TS / JS 基线（非 type-checked：保证速度，且无需 project service）——
  ...tseslint.configs.recommended,

  // —— Vue 基线：只开 essential（正确性类），recommended/recommended 里的
  //    风格类规则（attributes-order 等）不启用 ——
  ...pluginVue.configs['flat/essential'],

  // plugin:vue preset 只装了 vue-eslint-parser（管 <template>），
  // <script lang="ts"> 块仍会落到 espree → 全量 TS 语法解析错误。
  // 这里把 script 块显式交给 typescript-eslint parser。
  {
    files: ['**/*.vue'],
    languageOptions: {
      parserOptions: {
        parser: tseslint.parser,
        ecmaVersion: 'latest',
        sourceType: 'module',
        extraFileExtensions: ['.vue'],
      },
    },
  },

  // —— i18n：模板硬编码文案记账（warn）——
  {
    files: ['**/*.vue'],
    plugins: { '@intlify/vue-i18n': vueI18n },
    rules: {
      '@intlify/vue-i18n/no-raw-text': 'warn',
    },
  },

  // —— 运行环境 globals ——
  {
    files: ['src/**/*.{ts,vue}'],
    languageOptions: { globals: { ...globals.browser } },
  },
  {
    // 构建/测试配置与 e2e 脚本跑在 node 侧
    files: ['*.config.ts', '*.config.js', 'e2e/**/*.ts', 'e2e-gateway/**/*.ts', 'e2e-regression/**/*.ts'],
    languageOptions: { globals: { ...globals.node } },
  },

  // —— 零 error 基调下的显式定级 ——
  {
    rules: {
      // 存量代码 any 面大，先 off（收紧是独立重构，不属本护栏首期目标）
      '@typescript-eslint/no-explicit-any': 'off',
      // 未使用变量/参数：warn 记账；支持 _ 前缀豁免
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      // 视图文件为单词命名（List.vue / Login.vue / Editor.vue ...），
      // 改名涉及路由与 import 调整（src/** 领域），本护栏不动业务源码 → off
      'vue/multi-word-component-names': 'off',
    },
  },

  // —— .cjs（e2e-gateway/echo-server.cjs 等）：CommonJS 里 require() 合法 ——
  {
    files: ['**/*.cjs'],
    languageOptions: { globals: { ...globals.node } },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },

  // no-explicit-any 已 off，存量源码里预埋的 disable 注释成为"无害闲置"，
  // 不作为问题上报（否则 18 条噪音 warning；待 src 侧清理时一并回收）
  {
    linterOptions: { reportUnusedDisableDirectives: 'off' },
  },
)
