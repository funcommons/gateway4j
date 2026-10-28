import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const listSource = fs.readFileSync(path.resolve(__dirname, 'List.vue'), 'utf-8')
const globalSource = fs.readFileSync(path.resolve(__dirname, 'Global.vue'), 'utf-8')

describe('plugins/List.vue — permission guards', () => {
  it('imports usePermission from composables', () => {
    expect(listSource).toMatch(/import.*usePermission.*from.*@\/composables/)
  })

  it('edit button is guarded by canEdit("plugin")', () => {
    expect(listSource).toMatch(/v-if="canEdit\('plugin'\)"/)
  })

  it('enable/disable buttons are guarded by canEdit("plugin")', () => {
    // At least one enable/disable should have a permission guard
    expect(listSource).toMatch(/v-if="canEdit\('plugin'\).*enable|v-if="canEdit\('plugin'\).*disable|v-if="canEdit\('plugin'\).*status/)
  })

  it('delete confirm is guarded by canEdit("plugin")', () => {
    expect(listSource).toMatch(/v-if="canEdit\('plugin'\).*confirmDelete|v-if="canEdit\('plugin'\).*delete/)
  })
})

describe('plugins/Global.vue — permission guards', () => {
  it('imports usePermission from composables', () => {
    expect(globalSource).toMatch(/import.*usePermission.*from.*@\/composables/)
  })

  it('drag handle is guarded by hasPermission("plugin:global")', () => {
    // Drag-and-drop reordering should only be available with plugin:global
    expect(globalSource).toMatch(/v-if="hasPermission\('plugin:global'\)"/)
  })

  it('FcSwitch toggle is guarded by hasPermission("plugin:global")', () => {
    expect(globalSource).toMatch(/v-if="hasPermission\('plugin:global'\)"/)
  })
})
