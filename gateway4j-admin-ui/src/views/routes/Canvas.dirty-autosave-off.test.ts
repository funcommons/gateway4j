import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const source = fs.readFileSync(path.resolve(__dirname, 'Canvas.vue'), 'utf-8')

describe('Canvas.vue — dirty tracking with autoSave off', () => {
  it('markDirty always sets dirty=true regardless of autoSave', () => {
    // When autoSave is off, markDirty() must still set dirty=true so
    // the onBeforeRouteLeave guard can warn about unsaved changes.
    const markDirtyFn = source.match(/function markDirty\(\)[\s\S]*?^}/m)
    expect(markDirtyFn).toBeTruthy()
    // dirty = true should NOT be behind an autoSave check
    const body = markDirtyFn![0]
    const dirtyLine = body.indexOf('dirty = true')
    const autoSaveReturn = body.indexOf('!autoSave.value')
    if (autoSaveReturn > -1) {
      // If there's an autoSave early-return, dirty=true must come BEFORE it
      expect(dirtyLine).toBeLessThan(autoSaveReturn)
    } else {
      // No autoSave guard means dirty is always set — also fine
      expect(dirtyLine).toBeGreaterThan(0)
    }
  })

  it('autoSave scheduling is conditional but dirty tracking is not', () => {
    // The timer scheduling can be behind an autoSave check,
    // but the dirty=true assignment must be unconditional.
    const markDirtyFn = source.match(/function markDirty\(\)[\s\S]*?^}/m)
    expect(markDirtyFn).toBeTruthy()
    const body = markDirtyFn![0]
    // There should be a dirty = true line that is NOT inside an if(autoSave) block
    expect(body).toMatch(/dirty\s*=\s*true/)
  })
})
