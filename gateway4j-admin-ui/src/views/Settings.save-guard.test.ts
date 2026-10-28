import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const source = fs.readFileSync(path.resolve(__dirname, 'Settings.vue'), 'utf-8')

describe('Settings.vue — save loading guard', () => {
  it('saveGeneral blocks save while loading', () => {
    const saveGeneralFn = source.match(/async function saveGeneral\(\)[\s\S]*?^}/m)
    expect(saveGeneralFn).toBeTruthy()
    expect(saveGeneralFn![0]).toMatch(/if\s*\(\s*loading\.value\s*\)\s*return/)
  })

  it('saveSecurity blocks save while loading', () => {
    const saveSecurityFn = source.match(/async function saveSecurity\(\)[\s\S]*?^}/m)
    expect(saveSecurityFn).toBeTruthy()
    expect(saveSecurityFn![0]).toMatch(/if\s*\(\s*loading\.value\s*\)\s*return/)
  })
})
