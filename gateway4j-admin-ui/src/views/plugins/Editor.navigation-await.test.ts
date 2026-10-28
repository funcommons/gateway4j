import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const source = fs.readFileSync(path.resolve(__dirname, 'Editor.vue'), 'utf-8')

describe('plugins/Editor.vue — navigation uses await router.back', () => {
  it('does not use $router.back directly in template', () => {
    expect(source).not.toMatch(/\$router\.back/)
  })

  it('uses a method that calls await router.back()', () => {
    expect(source).toMatch(/await router\.back/)
  })
})
