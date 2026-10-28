import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const source = fs.readFileSync(path.resolve(__dirname, 'List.vue'), 'utf-8')

describe('plugins/List.vue — navigation uses await router.push', () => {
  it('does not use $router.push directly in template', () => {
    expect(source).not.toMatch(/\$router\.push/)
  })

  it('uses a method that calls await router.push', () => {
    expect(source).toMatch(/await router\.push/)
  })
})
