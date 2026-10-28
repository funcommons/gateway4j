import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

describe('User List — input maxlength', () => {
  const src = fs.readFileSync(path.resolve(__dirname, 'List.vue'), 'utf-8')

  it('username input has maxlength', () => {
    // gw_user.username VARCHAR(50)
    expect(src).toMatch(/form\.username.*maxlength/)
  })

  it('real_name input has maxlength', () => {
    // gw_user.real_name VARCHAR(50)
    expect(src).toMatch(/form\.real_name.*maxlength/)
  })

  it('phone input has maxlength', () => {
    // gw_user.phone VARCHAR(20)
    expect(src).toMatch(/form\.phone.*maxlength/)
  })
})
