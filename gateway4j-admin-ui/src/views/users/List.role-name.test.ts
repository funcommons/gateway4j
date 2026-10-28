import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

describe('users List.vue — role name display', () => {
  const src = fs.readFileSync(path.resolve(__dirname, 'List.vue'), 'utf-8')

  it('does not display raw role_codes directly in FcTag', () => {
    expect(src).not.toMatch(/v-for="r in row\.role_codes".*\{\{\s*r\s*\}\}/)
  })

  it('has a roleName function to map code to display name', () => {
    expect(src).toContain('function roleName')
  })
})
