/**
 * 全局快捷键注册表（LOW-2-C）—— 速查表的数据源，ShortcutHelp.vue 只管壳与交互。
 *
 * 契约以 src/components-v2/shortcuts/__tests__/ShortcutHelp.test.ts 头注为准（B 组逐一钉死）：
 * - id 即 testid 后缀（sc-item-{id} / sc-kbd-{id}），全表唯一且 ^[a-z][a-z0-9-]*$；
 * - keys 是平台中立字形展示串（'Ctrl/⌘+K' 等），不入 i18n（v2.topbar.kbd='⌘K' 先例同口径）；
 * - descKey 走 v2.sc.item.* 命名空间（zh-CN / en-US 双语严格同位）；
 * - 条目是「真实代码点」的枚举，代码改动必须同步注册表（B 组 fs 对账防漂移）：
 *     palette ← CommandPalette.vue（metaKey||ctrlKey + k）、help ← 本组件（'?'）、
 *     close ← CommandPalette/LayoutV2 的 Esc 关闭、
 *     undo/redo ← useCanvasGraph.onKeydown（实际绑定 Ctrl/Cmd+Z 与 Ctrl/Cmd+Y；
 *               优化建议原文的 Ctrl+Shift+Z 与代码不符，按实际绑定入表）、
 *     rowDetail ← Monitor.vue 慢路由行 @keydown.enter（OPT-1 键盘等价）。
 */

/** 分组 id —— 亦是 sc-group-{id} 的 testid 后缀 */
export type ShortcutGroupId = 'global' | 'canvas' | 'list'

export interface ShortcutEntry {
  /** 全表唯一 slug，作 testid 后缀（sc-item-{id} / sc-kbd-{id}） */
  id: string
  group: ShortcutGroupId
  /** 键位展示串（平台中立字形，不入 i18n） */
  keys: string
  /** 描述文案的 i18n key（v2.sc.item.*） */
  descKey: string
}

/** 分组渲染顺序（固定 global → canvas → list，测试 A/B 组钉死） */
export const SHORTCUT_GROUP_ORDER: ShortcutGroupId[] = ['global', 'canvas', 'list']

/** 分组名 i18n key（v2.sc.group.*，双语存在性由测试钉死） */
export const SHORTCUT_GROUP_LABEL_KEYS: Record<ShortcutGroupId, string> = {
  global: 'v2.sc.group.global',
  canvas: 'v2.sc.group.canvas',
  list: 'v2.sc.group.list'
}

/** 平铺注册表（每项自带 group；组内序 = 渲染序） */
export const SHORTCUTS: ShortcutEntry[] = [
  // —— global：壳层级（命令面板 / 本速查表 / 弹层关闭）——
  { id: 'palette', group: 'global', keys: 'Ctrl/⌘+K', descKey: 'v2.sc.item.palette' },
  { id: 'help', group: 'global', keys: '?', descKey: 'v2.sc.item.help' },
  { id: 'close', group: 'global', keys: 'Esc', descKey: 'v2.sc.item.close' },
  // —— canvas：流程编排（useCanvasGraph.onKeydown 实际绑定）——
  { id: 'undo', group: 'canvas', keys: 'Ctrl/⌘+Z', descKey: 'v2.sc.item.undo' },
  { id: 'redo', group: 'canvas', keys: 'Ctrl/⌘+Y', descKey: 'v2.sc.item.redo' },
  // —— list：列表页键盘等价（Monitor 慢路由行下钻，v2 列表页目前唯一成体系键盘项）——
  { id: 'rowDetail', group: 'list', keys: 'Enter', descKey: 'v2.sc.item.rowDetail' }
]

export interface ShortcutGroup {
  group: ShortcutGroupId
  labelKey: string
  items: ShortcutEntry[]
}

/** 按 SHORTCUT_GROUP_ORDER 分组返回（组内序 = 注册表序；不丢条目） */
export function groupedShortcuts(): ShortcutGroup[] {
  return SHORTCUT_GROUP_ORDER.map((group) => ({
    group,
    labelKey: SHORTCUT_GROUP_LABEL_KEYS[group],
    items: SHORTCUTS.filter((entry) => entry.group === group)
  }))
}
