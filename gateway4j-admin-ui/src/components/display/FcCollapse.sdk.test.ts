import { describe, it, expect } from 'vitest'
import { mountFc, emittedOf } from '../__tests__/helpers/mount'
import FcCollapse from './FcCollapse.vue'
import FcCollapseItem from './FcCollapseItem.vue'

function factory(modelValue: string[] = []) {
  return mountFc(FcCollapse, {
    props: { modelValue },
    slots: {
      default: `
        <FcCollapseItem name="a" title="甲">内容甲</FcCollapseItem>
        <FcCollapseItem name="b" title="乙">内容乙</FcCollapseItem>
      `,
    },
    global: { components: { FcCollapseItem } },
  })
}

describe('FcCollapse', () => {
  it('渲染 EP 折叠面板 + 折叠项', () => {
    const w = factory()
    expect(w.find('.el-collapse').exists()).toBe(true)
    expect(w.findAll('.el-collapse-item').length).toBe(2)
  })

  it('根节点就是折叠面板本身（业务布局 class 仍落在同一元素）', () => {
    const w = mountFc(FcCollapse, {
      props: { modelValue: [] },
      attrs: { class: 'env-diff__collapse' },
    })
    expect(w.find('.env-diff__collapse.el-collapse').exists()).toBe(true)
  })

  it('点击标题 → 展开并 emit update:modelValue', async () => {
    const w = factory()
    await w.findAll('.el-collapse-item__header')[0]!.trigger('click')
    expect(emittedOf(w, 'update:modelValue')[0]).toEqual([['a']])
  })

  it('accordion 模式：再点第二项只保留第二项', async () => {
    const w = mountFc(FcCollapse, {
      props: { modelValue: [], accordion: true },
      slots: {
        default: `
          <FcCollapseItem name="a" title="甲">A</FcCollapseItem>
          <FcCollapseItem name="b" title="乙">B</FcCollapseItem>
        `,
      },
      global: { components: { FcCollapseItem } },
    })
    await w.findAll('.el-collapse-item__header')[1]!.trigger('click')
    expect(emittedOf(w, 'update:modelValue')[0]).toEqual(['b'])
  })

  it('已展开的项内容可见（v-show 展开）', async () => {
    const w = factory(['a'])
    await w.vm.$nextTick()
    const first = w.findAll('.el-collapse-item')[0]!
    expect(first.classes()).toContain('is-active')
  })
})

describe('FcCollapseItem', () => {
  it('渲染标题文案', () => {
    const w = factory()
    expect(w.text()).toContain('甲')
    expect(w.text()).toContain('乙')
  })

  it('折叠箭头用 remixicon（不是 emoji），且标 aria-hidden', () => {
    const w = factory()
    const arrow = w.find('.fc-collapse-item__arrow')
    expect(arrow.exists()).toBe(true)
    expect(arrow.classes()).toContain('ri-arrow-down-s-line')
    expect(arrow.attributes('aria-hidden')).toBe('true')
  })

  it('箭头随展开态旋转（is-active 类）', async () => {
    const w = factory(['a'])
    await w.vm.$nextTick()
    const arrow = w.find('.fc-collapse-item__arrow')
    expect(arrow.classes()).toContain('is-active')
  })

  it('自定义 title 槽位优先于 title prop', () => {
    // 折叠项必须挂在折叠面板里（EP 用 provide/inject 传折叠上下文），
    // 所以这里套一层 FcCollapse 再断言。
    const w = mountFc(FcCollapse, {
      props: { modelValue: [] },
      slots: {
        default: `
          <FcCollapseItem name="x" title="标题 prop">
            <template #title><span class="custom-title">自定义标题</span></template>
          </FcCollapseItem>
        `,
      },
      global: { components: { FcCollapseItem } },
    })
    expect(w.find('.custom-title').exists()).toBe(true)
    expect(w.text()).not.toContain('标题 prop')
  })

  it('M3 契约：#title 槽拿到 EP 的 { isActive }（折叠态透传给业务侧）', async () => {
    const w = mountFc(FcCollapse, {
      props: { modelValue: ['a'] },
      slots: {
        default: `
          <FcCollapseItem name="a" title="标题 prop">
            <template #title="{ isActive }">
              <span class="custom-title">{{ isActive ? '已展开' : '已收起' }}</span>
            </template>
          </FcCollapseItem>
        `,
      },
      global: { components: { FcCollapseItem } },
    })
    await w.vm.$nextTick()
    // 展开中的项 → isActive 为 true（不再是永远 undefined）
    expect(w.find('.custom-title').text()).toBe('已展开')
  })

  it('M3 契约：#title 槽在折叠态拿到 isActive=false', async () => {
    const w = mountFc(FcCollapse, {
      props: { modelValue: [] },
      slots: {
        default: `
          <FcCollapseItem name="a" title="标题 prop">
            <template #title="{ isActive }">
              <span class="custom-title">{{ isActive ? '已展开' : '已收起' }}</span>
            </template>
          </FcCollapseItem>
        `,
      },
      global: { components: { FcCollapseItem } },
    })
    await w.vm.$nextTick()
    expect(w.find('.custom-title').text()).toBe('已收起')
  })

  it('L3 契约：自定义箭头同时挂 EP 的 el-collapse-item__arrow 类', () => {
    const w = factory()
    const arrow = w.find('.fc-collapse-item__arrow')
    expect(arrow.exists()).toBe(true)
    // EP 的箭头类名不能丢 —— 外部 / e2e 按 EP 类名定位要能找到
    expect(arrow.classes()).toContain('el-collapse-item__arrow')
  })

  it('L3 契约：展开时箭头带 is-active（EP 类名 + 自定义类名两条旋转路径都成立）', async () => {
    const w = factory(['a'])
    await w.vm.$nextTick()
    const arrow = w.find('.fc-collapse-item__arrow')
    expect(arrow.classes()).toContain('is-active')
    expect(arrow.classes()).toContain('el-collapse-item__arrow')
  })
})
