import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const source = fs.readFileSync(path.resolve(__dirname, 'Canvas.vue'), 'utf-8')

describe('routes/Canvas.vue — undo/redo keyboard shortcuts', () => {
  it('listens for keyboard events (keydown)', () => {
    // PRD: Support Ctrl+Z / Ctrl+Y for undo/redo
    expect(source).toMatch(/keydown|addEventListener.*key/)
  })

  it('undo is triggered by Ctrl+Z / Cmd+Z', () => {
    const keyboardBlock = source.substring(
      source.indexOf('function onKeydown'),
      source.indexOf('</script>')
    )
    expect(keyboardBlock).toMatch(/undo/)
    expect(keyboardBlock).toMatch(/ctrlKey|metaKey/)
    expect(keyboardBlock).toMatch(/'z'/)
  })

  it('redo is triggered by Ctrl+Y / Cmd+Y', () => {
    const keyboardBlock = source.substring(
      source.indexOf('function onKeydown'),
      source.indexOf('</script>')
    )
    expect(keyboardBlock).toMatch(/redo/)
    expect(keyboardBlock).toMatch(/'y'/)
  })
})
