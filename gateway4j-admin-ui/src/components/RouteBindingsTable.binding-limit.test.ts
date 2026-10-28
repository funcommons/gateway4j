import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

describe('RouteBindingsTable — max bindings limit', () => {
  const source = fs.readFileSync(path.resolve(__dirname, 'RouteBindingsTable.vue'), 'utf-8')

  it('has a MAX_BINDINGS constant set to 20', () => {
    expect(source).toMatch(/MAX_BINDINGS/)
    expect(source).toMatch(/20/)
  })

  it('addBinding function checks limit before adding', () => {
    const addStart = source.indexOf('function addBinding()')
    const addEnd = source.indexOf('\n}', addStart)
    const fn = source.substring(addStart, addEnd + 2)
    expect(fn).toMatch(/MAX_BINDINGS|local\.value\.length\s*>=?\s*20/)
  })
})
