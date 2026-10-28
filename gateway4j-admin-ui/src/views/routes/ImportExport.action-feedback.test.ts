import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const source = fs.readFileSync(path.resolve(__dirname, 'ImportExport.vue'), 'utf-8')

describe('routes/ImportExport.vue — action feedback', () => {
  it('shows success message after export', () => {
    const exportFn = source.substring(
      source.indexOf('async function onExport'),
      source.indexOf('async function onValidate')
    )
    expect(exportFn).toMatch(/ElMessage\.success|exportSuccess/)
  })

  it('shows success message after import', () => {
    const importFn = source.substring(
      source.indexOf('async function onImport'),
      source.indexOf('</script>')
    )
    expect(importFn).toMatch(/ElMessage\.success|importSuccess/)
  })
})
