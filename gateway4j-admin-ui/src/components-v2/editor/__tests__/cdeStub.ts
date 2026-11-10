import type { Component } from 'vue'

/**
 * OPT-5-T 共享测试替身：FcCodeEditor 接线 stub（v2 优化建议 #4 —— CodeMirror 6 封装编辑器）。
 * 消费方：src/views-v2/plugins/__tests__/Editor.code-editor.test.ts（接线契约主测）与
 * src/views-v2/plugins/__tests__/Editor.test.ts（既有 40 例套件的确定性保鲜）。
 *
 * 为什么 mock 成 stub：Editor.vue 在 C 步会以【动态 import】接 FcCodeEditor（懒加载，
 * CodeMirror 不进主包）。若不拦截，C 步后既有套件每次 mount 都会真实拉起 CodeMirror
 * 视图（jsdom 需要 shim、引入异步就绪窗口），40 例全部被动耦合编辑器内部实现——
 * 接线层只关心 v-model 链路与提交链路，编辑器行为由 FcCodeEditor.test.ts 专测。
 *
 * 为什么工厂 mock 可以注册在【尚不存在】的模块上（OPT-5-T 探针实证）：
 * vi.mock 工厂按路径惰性注册，RED 阶段 Editor.vue 根本没有 import 该路径 → mock 无害、
 * 既有断言照常红/绿；C 步接线后动态 import 命中本 stub。组件本体 RED（模块缺失型）
 * 在 FcCodeEditor.test.ts 用「变量路径动态导入」承担（CommandPalette PALETTE_PATH 同法）。
 *
 * stub 面契约（只暴露接线层关心的最小面）：
 * - props { modelValue, disabled }（Editor.vue 侧 v-model="form.config" 所需最小集；
 *   maxlength/rows 等额外 prop 走 attrs 透传到根 div，不影响接线断言）
 * - emits ['update:modelValue']：textarea input → $emit，供「输入 → form.config 回写 →
 *   保存 payload / 脏离开 DOM 基线」链路断言
 * - testid：cde-root（根）/ cde-content（textarea 本体）——与真组件 DOM 契约同形，
 *   Editor.vue 的 collectDomValues（textarea[data-testid] 快照）在 C 步后仍能捕获编辑器值
 */
export const cdeStub: Component = {
  name: 'FcCodeEditor',
  props: {
    modelValue: { type: String, default: '' },
    disabled: { type: Boolean, default: false }
  },
  emits: ['update:modelValue'],
  // 模板字符串运行时编译在当前 vitest 环境可用（OPT-5-T 探针已实证，见 OPT-5 交付报告）
  template: `<div data-testid="cde-root" class="cde-stub">
  <textarea data-testid="cde-content" :value="modelValue" :disabled="disabled"
    @input="$emit('update:modelValue', $event.target.value)"></textarea>
</div>`
}
