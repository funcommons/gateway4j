import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const src = fs.readFileSync(
  path.join(import.meta.dirname, 'ImportExport.vue'),
  'utf-8'
)

describe('ImportExport.vue — permission guards', () => {
  it('imports usePermission composable', () => {
    expect(src).toContain("import { usePermission } from '@/composables/usePermission'")
  })

  it('calls canEdit("route") in onExport', () => {
    expect(src).toContain("canEdit('route')")
    const start = src.indexOf('async function onExport')
    const end = src.indexOf('\nasync function onValidate')
    const fn = src.slice(start, end)
    expect(fn).toContain("canEdit('route')")
  })

  it('calls canEdit("route") in onValidate', () => {
    const start = src.indexOf('async function onValidate')
    const end = src.indexOf('\nasync function onImport')
    const fn = src.slice(start, end)
    expect(fn).toContain("canEdit('route')")
  })

  it('calls canEdit("route") in onImport', () => {
    const start = src.indexOf('async function onImport')
    const end = src.indexOf('\n</script>')
    const fn = src.slice(start, end)
    expect(fn).toContain("canEdit('route')")
  })

  it('hides export button when user lacks route:edit', () => {
    // Check that the line with @click="onExport" also has canEdit guard
    const line = src.split('\n').find(l => l.includes('onExport') && l.includes('FcButton'))
    expect(line).toBeTruthy()
    expect(line!).toContain("canEdit('route')")
  })

  it('hides import/validate buttons when user lacks route:edit', () => {
    const importLine = src.split('\n').find(l => l.includes('onImport') && l.includes('FcButton'))
    const validateLine = src.split('\n').find(l => l.includes('onValidate') && l.includes('FcButton'))
    expect(importLine).toBeTruthy()
    expect(validateLine).toBeTruthy()
    expect(importLine!).toContain("canEdit('route')")
    expect(validateLine!).toContain("canEdit('route')")
  })
})
