import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

describe('RouteConditionsTable — max conditions limit', () => {
  const source = fs.readFileSync(path.resolve(__dirname, 'RouteConditionsTable.vue'), 'utf-8')

  it('has a MAX_CONDITIONS constant set to 50', () => {
    expect(source).toMatch(/MAX_CONDITIONS/)
    expect(source).toMatch(/50/)
  })

  it('onAdd function checks limit before adding', () => {
    const addStart = source.indexOf('function onAdd()')
    const addEnd = source.indexOf('\n}', addStart)
    const fn = source.substring(addStart, addEnd + 2)
    expect(fn).toMatch(/MAX_CONDITIONS|local\.value\.length\s*>=?\s*50/)
  })
})
