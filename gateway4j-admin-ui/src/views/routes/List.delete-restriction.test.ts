import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const source = fs.readFileSync(path.resolve(__dirname, 'List.vue'), 'utf-8')

// 动作列：行内动作已收进「更多」下拉，菜单项由 rowActionItems() 生成 ——
// 删除项的可见性条件从模板搬到了脚本，断言也跟着换位置，
// 但断言语义不变（删除只对 DRAFT / OFFLINE 开放，且不是无条件可见）。
const actionStart = source.indexOf("label=\"t('common.more')\"")
const actionCol = source.slice(actionStart)

describe('routes/List.vue — delete restricted by status', () => {
  it('delete action only appears for DRAFT and OFFLINE routes', () => {
    // PRD state machine: only DRAFT and OFFLINE routes can be deleted.
    // PUBLISHED and CHANGING routes must not show the delete action.
    expect(actionCol).toMatch(/status === 'DRAFT'\s*\|\|\s*row\.status === 'OFFLINE'/)
  })

  it('delete action is NOT unconditionally visible', () => {
    // 删除菜单项必须在状态守卫内 push —— 源码里 command: 'delete' 只出现一次，
    // 且与 DRAFT / OFFLINE 守卫同在一条语句上。
    const deleteLines = source.split('\n').filter(l => l.includes("command: 'delete'"))
    expect(deleteLines).toHaveLength(1)
    expect(deleteLines[0]).toContain("'DRAFT'")
    expect(deleteLines[0]).toContain("'OFFLINE'")
  })
})
