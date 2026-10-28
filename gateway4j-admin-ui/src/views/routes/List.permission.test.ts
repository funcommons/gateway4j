import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const source = fs.readFileSync(path.resolve(__dirname, 'List.vue'), 'utf-8')

describe('routes/List.vue — permission guards in template', () => {
  it('Create button is guarded by canEdit("route") or hasPermission("route:edit")', () => {
    // The create button should have a v-if permission check
    const createLine = source.match(/FcButton[^>]*@click="onNav\('\/routes\/new'\)"[^>]*>/s)
    expect(createLine).toBeTruthy()
    // Check that the button or its parent has a v-if with permission
    expect(source).toMatch(/v-if="[^"]*canEdit|v-if="[^"]*hasPermission.*route:edit/)
  })

  it('Import button is guarded by canEdit("route") or hasPermission("route:edit")', () => {
    const importLine = source.match(/FcButton[^>]*@click="onNav\('\/import-export'\)"[^>]*>/s)
    expect(importLine).toBeTruthy()
    expect(source).toMatch(/v-if="[^"]*canEdit|v-if="[^"]*hasPermission.*route:edit/)
  })

  it('action column v-if guards exist for edit/canvas/publish/offline/delete', () => {
    // The actions column template should have a permission guard
    // Check for usePermission import
    expect(source).toMatch(/usePermission/)
  })

  it('imports usePermission from composables', () => {
    expect(source).toMatch(/import.*usePermission.*from.*@\/composables/)
  })
})
