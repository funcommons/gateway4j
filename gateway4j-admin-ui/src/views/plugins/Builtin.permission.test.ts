import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const source = fs.readFileSync(path.resolve(__dirname, 'Builtin.vue'), 'utf-8')

describe('plugins/Builtin.vue — permission guards', () => {
  it('imports usePermission from composables', () => {
    expect(source).toMatch(/import.*usePermission.*from.*@\/composables/)
  })

  it('config button is guarded by canEdit("plugin")', () => {
    const configBtn = source.match(/FcButton[^>]*@click="openConfig[^"]*"[^>]*>/s)
    expect(configBtn).toBeTruthy()
    const context = source.substring(Math.max(0, source.indexOf('openConfig') - 200), source.indexOf('openConfig') + 50)
    expect(context).toMatch(/canEdit\('plugin'\)/)
  })

  it('enable/disable buttons are guarded by canEdit("plugin")', () => {
    expect(source).toMatch(/v-if="canEdit\('plugin'\)"/)
  })

  it('saveConfig() has function-level canEdit guard', () => {
    const fn = source.substring(source.indexOf('async function saveConfig'), source.indexOf('async function toggleStatus'))
    expect(fn).toMatch(/canEdit\('plugin'\)/)
  })

  it('toggleStatus() has function-level canEdit guard', () => {
    const fn = source.substring(source.indexOf('async function toggleStatus'), source.indexOf('</script>'))
    expect(fn).toMatch(/canEdit\('plugin'\)/)
  })
})
