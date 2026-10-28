import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const src = fs.readFileSync(
  path.join(import.meta.dirname, 'Settings.vue'),
  'utf-8'
)

describe('Settings.vue — permission guards', () => {
  it('imports usePermission composable', () => {
    expect(src).toContain("import { usePermission } from '@/composables/usePermission'")
  })

  it('calls canEdit("system") in saveGeneral', () => {
    expect(src).toContain("canEdit('system')")
    // saveGeneral function body should contain the guard
    const start = src.indexOf('async function saveGeneral')
    const end = src.indexOf('\nasync function saveSecurity')
    const fn = src.slice(start, end)
    expect(fn).toContain("canEdit('system')")
  })

  it('calls canEdit("system") in saveSecurity', () => {
    const start = src.indexOf('async function saveSecurity')
    const end = src.indexOf('\n// Dict')
    const fn = src.slice(start, end)
    expect(fn).toContain("canEdit('system')")
  })

  it('hides save buttons when user lacks system:edit', () => {
    // Both save buttons should have v-if="canEdit('system')"
    const matches = src.match(/v-if="canEdit\(['"]system['"]\)"/g)
    expect(matches).toBeTruthy()
    expect(matches!.length).toBeGreaterThanOrEqual(2)
  })
})
