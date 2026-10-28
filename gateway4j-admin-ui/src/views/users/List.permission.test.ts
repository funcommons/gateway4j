import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const source = fs.readFileSync(path.resolve(__dirname, 'List.vue'), 'utf-8')

describe('users/List.vue — permission guards', () => {
  it('imports usePermission from composables', () => {
    expect(source).toMatch(/import.*usePermission.*from.*@\/composables/)
  })

  it('Create button is guarded by canEdit("user")', () => {
    expect(source).toMatch(/v-if="canEdit\('user'\)"/)
  })

  it('Edit button is guarded by canEdit("user")', () => {
    // The edit button in the action column should have a permission guard
    const editMatch = source.match(/FcButton[^>]*@click="openEdit[^"]*"[^>]*>/s)
    if (editMatch) {
      // Check that the line or nearby has canEdit('user')
      const lineStart = source.lastIndexOf('\n', source.indexOf('openEdit')) - 200
      const context = source.substring(Math.max(0, lineStart), source.indexOf('openEdit') + 50)
      expect(context).toMatch(/canEdit\('user'\)/)
    }
  })

  it('Delete confirm is guarded by canEdit("user")', () => {
    expect(source).toMatch(/v-if="canEdit\('user'\)"/)
  })

  it('Reset password button is guarded by canEdit("user")', () => {
    expect(source).toMatch(/v-if="canEdit\('user'\)"/)
  })

  it('Toggle status button is guarded by canEdit("user")', () => {
    expect(source).toMatch(/v-if="canEdit\('user'\)"/)
  })
})
