import { describe, it, expect, vi } from 'vitest'
import { createI18n } from 'vue-i18n'
import { mount } from '@vue/test-utils'
import FcDropZone from '@/components/form/FcDropZone.vue'

const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  messages: {
    'zh-CN': {
      common: {
        dropRejectType: '不支持的文件类型',
        dropRejectSize: '文件大小超出限制',
        dropRejectCount: '仅支持选择单个文件'
      }
    }
  }
})

function factory(props = {}) {
  return mount(FcDropZone, {
    props: { ...props },
    global: { plugins: [i18n] },
    slots: { default: '<template #default="{ isDragOver }"><span>{{ isDragOver }}</span></template>' }
  })
}

describe('FcDropZone — i18n reject messages', () => {
  it('emits reject with i18n type message when file type does not match accept', async () => {
    const wrapper = factory({ accept: '.jar', multiple: false })
    const vm = wrapper.vm as any
    const fakeFile = { name: 'photo.png', size: 100, type: 'image/png' } as any
    vm.validateAndEmit([fakeFile])
    const events = wrapper.emitted('reject')
    expect(events).toBeTruthy()
    const payload = events![0][0] as any
    expect(payload.reason).toBe('type')
    expect(payload.message).toBe('不支持的文件类型')
  })

  it('emits reject with i18n size message when file exceeds maxSize', async () => {
    const wrapper = factory({ accept: '*', maxSize: 100 })
    const vm = wrapper.vm as any
    const bigFile = { name: 'big.jar', size: 200, type: 'application/java-archive' } as any
    vm.validateAndEmit([bigFile])
    const events = wrapper.emitted('reject')
    expect(events).toBeTruthy()
    const payload = events![0][0] as any
    expect(payload.reason).toBe('size')
    expect(payload.message).toBe('文件大小超出限制')
  })

  it('emits reject with i18n count message when multiple files but multiple=false', async () => {
    const wrapper = factory({ multiple: false })
    const vm = wrapper.vm as any
    const f1 = { name: 'a.jar', size: 100, type: 'application/java-archive' } as any
    const f2 = { name: 'b.jar', size: 100, type: 'application/java-archive' } as any
    vm.validateAndEmit([f1, f2])
    const events = wrapper.emitted('reject')
    expect(events).toBeTruthy()
    const payload = events![0][0] as any
    expect(payload.reason).toBe('count')
    expect(payload.message).toBe('仅支持选择单个文件')
  })

  it('emits drop with accepted files', async () => {
    const wrapper = factory({ accept: '.jar', maxSize: 1024 * 1024 })
    const vm = wrapper.vm as any
    const okFile = { name: 'plugin.jar', size: 500, type: 'application/java-archive' } as any
    vm.validateAndEmit([okFile])
    expect(wrapper.emitted('drop')).toBeTruthy()
    expect(wrapper.emitted('drop')![0][0]).toEqual([okFile])
  })
})
