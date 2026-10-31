import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

describe('User List — password maxlength', () => {
  const src = fs.readFileSync(path.resolve(__dirname, 'List.vue'), 'utf-8')

  /**
   * 表单项按 <FcFormItem 切块 —— 字段块可跨多行（label 插槽 / help 提示），
   * 单行匹配在多行表单结构下会漏判，故按块定位后再断言控件约束。
   */
  function formItemBlock(marker: string): string {
    const blocks = src.split('<FcFormItem')
    return blocks.find(b => b.includes(marker)) ?? ''
  }

  it('create password input has maxlength matching VARCHAR(100)', () => {
    // Password field in create mode
    const block = formItemBlock("t('user.password')")
    expect(block).toBeTruthy()
    expect(block).toContain('type="password"')
    expect(block).toMatch(/maxlength="100"/)
  })

  it('edit password input has maxlength', () => {
    // Password field in edit mode (newPassword)
    const block = formItemBlock("t('user.newPassword')")
    expect(block).toBeTruthy()
    expect(block).toContain('type="password"')
    expect(block).toMatch(/maxlength="100"/)
  })

  it('reset password input has maxlength', () => {
    // Password field in reset dialog
    const block = formItemBlock('newPwd')
    expect(block).toBeTruthy()
    expect(block).toContain('type="password"')
    expect(block).toMatch(/maxlength="100"/)
  })
})
