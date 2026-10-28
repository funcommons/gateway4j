import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const source = fs.readFileSync(path.resolve(__dirname, 'Settings.vue'), 'utf-8')

describe('Settings.vue — mapFieldErrors', () => {
  it('imports mapFieldErrors', () => {
    expect(source).toMatch(/mapFieldErrors/)
  })

  it('uses mapFieldErrors in saveGeneral catch block', () => {
    const saveGeneralFn = source.substring(
      source.indexOf('async function saveGeneral'),
      source.indexOf('async function saveSecurity')
    )
    expect(saveGeneralFn).toMatch(/mapFieldErrors/)
  })

  it('uses mapFieldErrors in saveSecurity catch block', () => {
    const saveSecurityFn = source.substring(
      source.indexOf('async function saveSecurity'),
      source.indexOf('// Dict tab')
    )
    expect(saveSecurityFn).toMatch(/mapFieldErrors/)
  })
})
