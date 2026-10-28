import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const source = fs.readFileSync(path.resolve(__dirname, 'Settings.vue'), 'utf-8')

describe('Settings.vue — save feedback', () => {
  it('shows success message after saveGeneral', () => {
    const saveGeneralFn = source.substring(
      source.indexOf('async function saveGeneral'),
      source.indexOf('async function saveSecurity')
    )
    expect(saveGeneralFn).toMatch(/ElMessage\.success|saveSuccess/)
  })

  it('shows success message after saveSecurity', () => {
    const saveSecurityFn = source.substring(
      source.indexOf('async function saveSecurity'),
      source.indexOf('// Dict tab')
    )
    expect(saveSecurityFn).toMatch(/ElMessage\.success|saveSuccess/)
  })
})
