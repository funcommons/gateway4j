import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

describe('Dashboard — flow node status i18n', () => {
  const src = fs.readFileSync(path.resolve(__dirname, 'Index.vue'), 'utf-8')

  it('does not display raw n.status in flow node label', () => {
    expect(src).not.toMatch(/n\.status \|\| ''/)
  })

  it('uses i18n for status in flow node label', () => {
    expect(src).toMatch(/monitor\.healthy|monitor\.errorRoute|monitor\.circuitOpen/)
  })
})
