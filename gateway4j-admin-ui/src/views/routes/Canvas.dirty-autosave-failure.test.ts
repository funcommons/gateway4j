import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const source = fs.readFileSync(path.resolve(__dirname, 'Canvas.vue'), 'utf-8')

describe('Canvas.vue — autoSave dirty flag on failure', () => {
  it('doAutoSave must NOT clear dirty flag before the save succeeds', () => {
    // If dirty=false is set before the await saveCanvas(), a failed auto-save
    // silently clears the dirty flag, causing onBeforeRouteLeave to skip the
    // unsaved-changes warning — data loss.
    const doAutoSaveFn = source.match(/async function doAutoSave\(\)[\s\S]*?^}/m)
    expect(doAutoSaveFn).toBeTruthy()
    const body = doAutoSaveFn![0]
    const dirtyFalsePos = body.indexOf('dirty = false')
    const awaitSavePos = body.indexOf('await saveCanvas')
    // dirty = false must come AFTER the await, not before it
    expect(dirtyFalsePos).toBeGreaterThan(awaitSavePos)
  })

  it('doAutoSave must restore dirty=true in catch block if save fails', () => {
    // When saveCanvas fails, dirty must be set back to true so the
    // onBeforeRouteLeave guard still warns about unsaved changes.
    const doAutoSaveFn = source.match(/async function doAutoSave\(\)[\s\S]*?^}/m)
    expect(doAutoSaveFn).toBeTruthy()
    const body = doAutoSaveFn![0]
    // There should be a catch block that sets dirty = true
    expect(body).toMatch(/catch[\s\S]*?dirty\s*=\s*true/)
  })
})
