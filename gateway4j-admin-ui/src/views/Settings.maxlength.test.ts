import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

describe('Settings — site_name maxlength', () => {
  const src = fs.readFileSync(path.resolve(__dirname, 'Settings.vue'), 'utf-8')

  it('site_name input has maxlength', () => {
    expect(src).toMatch(/site_name.*maxlength/)
  })
})
