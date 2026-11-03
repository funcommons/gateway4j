import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { mountFc, emittedOf } from '../__tests__/helpers/mount'
import FcDropdown from './FcDropdown.vue'

const SOURCE = fs.readFileSync(path.resolve(__dirname, 'FcDropdown.vue'), 'utf-8')
/** 去掉注释后再做样式断言（注释里也会出现 :focus-visible 之类的字样）。 */
const STYLE = SOURCE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const items = [
  { label: '编辑', command: 'edit', icon: 'ri-edit-line' },
  { label: '删除', command: 'delete', danger: true, divided: true },
  { label: '停用', command: 'disable', disabled: true },
]

/**
 * teleported=false 时 EP 的浮层不 teleport 到 body，留在 wrapper 里，
 * 测试才能直接 find 到菜单项。
 */
function mountDropdown(props: Record<string, unknown> = {}, slots?: Record<string, unknown>) {
  return mountFc(FcDropdown, {
    props: { teleported: false, ...props },
    slots: slots ?? { default: '<button class="trigger">更多</button>' },
  })
}

describe('FcDropdown', () => {
  it('渲染 EP 下拉根节点 + 触发器内容', () => {
    const w = mountDropdown()
    expect(w.find('.el-dropdown').exists()).toBe(true)
    expect(w.find('.fc-dropdown').exists()).toBe(true)
    expect(w.find('.trigger').exists()).toBe(true)
  })

  it('attrs 透传：data-testid 落在根节点', () => {
    const w = mountFc(FcDropdown, {
      props: { teleported: false },
      attrs: { 'data-testid': 'row-actions' },
      slots: { default: '<button class="trigger">更多</button>' },
    })
    expect(w.find('[data-testid="row-actions"]').exists()).toBe(true)
  })

  it('prop 默认值：trigger=click / placement=bottom-start / hideOnClick=true / teleported=true', () => {
    const w = mountFc(FcDropdown, { slots: { default: '<button class="trigger">更多</button>' } })
    const dd = w.findComponent({ name: 'ElDropdown' })
    expect(dd.props('trigger')).toBe('click')
    expect(dd.props('placement')).toBe('bottom-start')
    expect(dd.props('hideOnClick')).toBe(true)
    expect(dd.props('teleported')).toBe(true)
  })

  it('prop 可覆盖：trigger=hover / placement / hideOnClick / teleported', () => {
    const w = mountDropdown({ trigger: 'hover', placement: 'bottom-end', hideOnClick: false })
    const dd = w.findComponent({ name: 'ElDropdown' })
    expect(dd.props('trigger')).toBe('hover')
    expect(dd.props('placement')).toBe('bottom-end')
    expect(dd.props('hideOnClick')).toBe(false)
  })

  it('items prop → 渲染菜单项（含图标 / 分隔线 / 禁用 / 危险项）', () => {
    const w = mountDropdown({ items })
    const menuItems = w.findAll('.el-dropdown-menu__item')
    expect(menuItems.length).toBe(3)
    // 第 1 项：普通项 + 图标
    expect(menuItems[0]!.text()).toContain('编辑')
    expect(menuItems[0]!.find('.ri-edit-line').exists()).toBe(true)
    // 第 2 项：危险项（分隔线是 EP 单独渲染的一个 li）
    expect(menuItems[1]!.classes()).toContain('fc-dropdown__item--danger')
    expect(menuItems[1]!.classes()).not.toContain('is-disabled')
    expect(w.findAll('.el-dropdown-menu__item--divided').length).toBe(1)
    // 第 3 项：禁用项
    expect(menuItems[2]!.classes()).toContain('is-disabled')
  })

  it('点击菜单项 → emit command（取值 + 原生事件）', async () => {
    const w = mountDropdown({ items })
    await w.findAll('.el-dropdown-menu__item')[0]!.trigger('click')
    const payload = emittedOf(w, 'command')[0] as unknown[]
    expect(payload[0]).toBe('edit')
    expect(payload[1]).toBeInstanceOf(Event)
  })

  it('disabled → 根节点 is-disabled', () => {
    const w = mountDropdown({ disabled: true })
    expect(w.find('.fc-dropdown.is-disabled').exists()).toBe(true)
  })

  it('键盘可达：EP 把 role=button / tabindex 挂到触发器上（Tab 能落到触发器）', () => {
    const w = mountDropdown()
    const trigger = w.find('.trigger')
    expect(trigger.attributes('role')).toBe('button')
    expect(trigger.attributes('tabindex')).toBe('0')
  })

  it('#dropdown 槽优先于 items prop（与 EP 语义一致：槽优先）', () => {
    const w = mountDropdown({ items }, {
      default: '<button class="trigger">更多</button>',
      dropdown: '<ul class="my-menu"><li class="my-item">自定义</li></ul>',
    })
    expect(w.find('.my-menu').exists()).toBe(true)
    expect(w.findAll('.el-dropdown-menu__item').length).toBe(0)
  })

  it('焦点环（26a）：触发器与菜单项都有 :focus-visible 焦点环', () => {
    // 触发器：焦点环落在 .fc-dropdown 内
    expect(STYLE).toMatch(/\.fc-dropdown\s+:focus-visible:not\(\.el-button\)/)
    // 菜单项：EP 把 outline 抹掉了，这里补回来
    expect(STYLE).toMatch(/\.fc-dropdown-popper \.el-dropdown-menu__item:focus-visible/)
    // 两处都走 --app-focus-ring token，且瞬时出现（不渐显）
    const focusRules = STYLE.match(/:focus-visible[^{]*\{[^}]*\}/g) ?? []
    expect(focusRules.length).toBeGreaterThanOrEqual(2)
    for (const rule of focusRules) {
      expect(rule).toMatch(/outline:\s*2px solid var\(--app-focus-ring\)/)
      expect(rule).not.toMatch(/transition/)
    }
  })

  it('菜单配色走 --app-* token（深浅色自动跟，不写死颜色）', () => {
    expect(STYLE).toMatch(/background:\s*var\(--app-bg-card\)/)
    expect(STYLE).toMatch(/color:\s*var\(--app-text\)/)
    expect(STYLE).toMatch(/border-color:\s*var\(--app-border\)/)
    // 不许出现裸颜色字面量
    expect(STYLE).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(STYLE).not.toMatch(/\brgba?\(/)
  })
})
