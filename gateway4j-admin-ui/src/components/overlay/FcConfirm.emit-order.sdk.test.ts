import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createI18n } from 'vue-i18n'
import FcConfirm from './FcConfirm.vue'

/**
 * FcConfirm emit 顺序契约（行为级回归测试，2026-10-31）。
 *
 * useFcConfirm 的 onUpdate:open 在 `!val && !settled` 时 settle(false)，
 * 因此 confirm/cancel 必须先于 update:open(false) 发出 —— 否则命令式
 * confirm() 无论用户点确认还是取消都返回 false。
 * （此前只有 composable 的源码正则断言，拦不住 SDK 侧顺序被调换。）
 *
 * 放在 sdk project：FcDialog 基于 el-dialog，需要 ElementPlus 基座才渲染得出来。
 */
/**
 * el-dialog 在 jsdom 下不渲染内容（teleport + transition），
 * 故用 stub 渲染 default/footer 槽，按钮才可点。
 */
const ElDialogStub = {
  props: { modelValue: { type: Boolean, default: false } },
  emits: ['update:modelValue'],
  template: `<div class="el-dialog-stub" v-if="modelValue"><slot /><slot name="footer" /></div>`
}

const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  fallbackLocale: 'zh-CN',
  messages: {},
  missingWarn: false,
  fallbackWarn: false
})

describe('FcConfirm — emit 顺序契约', () => {
  it('确认时先发 confirm、后发 update:open(false)', async () => {
    const order: string[] = []
    const wrapper = mount(FcConfirm, {
      props: {
        open: true,
        'onConfirm': () => order.push('confirm'),
        'onUpdate:open': (v: boolean) => { if (!v) order.push('update:open') }
      },
      global: { plugins: [i18n], stubs: { 'el-dialog': ElDialogStub } }
    })
    const btn = wrapper.findAll('button').find((b) => /确定|确认|common\.confirm/.test(b.text()))
    expect(btn, '应渲染确认按钮').toBeTruthy()
    await btn!.trigger('click')
    await nextTick()
    expect(order[0]).toBe('confirm')
    expect(order).toContain('update:open')
  })

  it('取消时先发 cancel、后发 update:open(false)', async () => {
    const order: string[] = []
    const wrapper = mount(FcConfirm, {
      props: {
        open: true,
        'onCancel': () => order.push('cancel'),
        'onUpdate:open': (v: boolean) => { if (!v) order.push('update:open') }
      },
      global: { plugins: [i18n], stubs: { 'el-dialog': ElDialogStub } }
    })
    const btn = wrapper.findAll('button').find((b) => /取消|common\.cancel/.test(b.text()))
    expect(btn, '应渲染取消按钮').toBeTruthy()
    await btn!.trigger('click')
    await nextTick()
    expect(order[0]).toBe('cancel')
  })

  it('结果事件只发一次（重复点击确认不重复 emit）', async () => {
    const onConfirm = vi.fn()
    const wrapper = mount(FcConfirm, {
      props: { open: true, 'onConfirm': onConfirm },
      global: { plugins: [i18n], stubs: { 'el-dialog': ElDialogStub } }
    })
    const btn = wrapper.findAll('button').find((b) => /确定|确认|common\.confirm/.test(b.text()))
    expect(btn, '应渲染确认按钮').toBeTruthy()
    await btn!.trigger('click')
    await btn!.trigger('click')
    await nextTick()
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })
})
