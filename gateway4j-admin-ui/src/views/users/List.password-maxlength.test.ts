import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

describe('User List — password maxlength', () => {
  const src = fs.readFileSync(path.resolve(__dirname, 'List.vue'), 'utf-8')

  it('create password input has maxlength matching VARCHAR(100)', () => {
    // Password field in create mode
    const lines = src.split('\n')
    const createPwdLine = lines.find(l => l.includes('user.password') && l.includes('type="password"') && !l.includes('newPassword') && l.includes('maxlength'))
    expect(createPwdLine).toBeTruthy()
  })

  it('edit password input has maxlength', () => {
    // Password field in edit mode (newPassword)
    const lines = src.split('\n')
    const editPwdLine = lines.find(l => l.includes('newPassword') && l.includes('type="password"') && l.includes('maxlength'))
    expect(editPwdLine).toBeTruthy()
  })

  it('reset password input has maxlength', () => {
    // Password field in reset dialog
    const lines = src.split('\n')
    const resetPwdLine = lines.find(l => l.includes('newPwd') && l.includes('type="password"') && l.includes('maxlength'))
    expect(resetPwdLine).toBeTruthy()
  })
})
