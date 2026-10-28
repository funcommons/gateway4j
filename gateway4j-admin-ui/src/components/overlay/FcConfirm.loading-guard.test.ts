import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const source = fs.readFileSync(path.resolve(__dirname, 'FcConfirm.vue'), 'utf-8')

describe('FcConfirm — loading state blocks dismissal', () => {
  it('disables ESC close when loading is true', () => {
    // When loading=true, the dialog must not be closeable via ESC because
    // the async operation is still in progress. The user should not be able
    // to dismiss the dialog and think the operation was cancelled.
    expect(source).toMatch(/close-on-press-escape.*!loading/)
  })

  it('hides the close (X) button when loading is true', () => {
    expect(source).toMatch(/show-close.*!loading/)
  })

  it('close() function guards against loading state', () => {
    const closeFn = source.match(/function close\([\s\S]*?\}/)
    expect(closeFn).toBeTruthy()
    expect(closeFn![0]).toMatch(/loading/)
  })
})
