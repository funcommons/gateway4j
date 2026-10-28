import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

describe('RouteConditionsTable.vue — typeOptions i18n', () => {
  it('uses i18n translation keys for condition type labels instead of hardcoded English', () => {
    const src = fs.readFileSync(path.join(import.meta.dirname, 'RouteConditionsTable.vue'), 'utf-8')
    const typeOptionsBlock = src.match(/const typeOptions[\s\S]*?\]/)
    expect(typeOptionsBlock).toBeTruthy()
    // Should use t() for labels, not hardcoded strings
    expect(typeOptionsBlock![0]).toContain("t('route.condTypeHeader')")
    expect(typeOptionsBlock![0]).toContain("t('route.condTypePath')")
    expect(typeOptionsBlock![0]).toContain("t('route.condTypeQuery')")
    expect(typeOptionsBlock![0]).toContain("t('route.condTypeBody')")
    expect(typeOptionsBlock![0]).toContain("t('route.condTypeGroovy')")
    // Should NOT contain hardcoded English labels
    expect(typeOptionsBlock![0]).not.toMatch(/label:\s*'Header'/)
    expect(typeOptionsBlock![0]).not.toMatch(/label:\s*'Path'/)
    expect(typeOptionsBlock![0]).not.toMatch(/label:\s*'Query'/)
    expect(typeOptionsBlock![0]).not.toMatch(/label:\s*'Body'/)
  })
})
