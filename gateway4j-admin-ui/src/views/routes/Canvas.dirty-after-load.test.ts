import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const source = fs.readFileSync(path.resolve(__dirname, 'Canvas.vue'), 'utf-8')

describe('Canvas.vue — dirty tracking after load', () => {
  it('has a dirtyTracking guard so load does not mark canvas dirty', () => {
    // When load() sets nodes/edges, VueFlow fires onNodesChange which calls
    // markDirty(). Without a guard, this falsely marks the canvas dirty after
    // load, causing onBeforeRouteLeave to warn about unsaved changes when
    // there are none.
    expect(source).toMatch(/dirtyTracking/)
    // markDirty should check dirtyTracking before setting dirty=true
    const markDirtyFn = source.match(/function markDirty\(\)[\s\S]*?^}/m)
    expect(markDirtyFn).toBeTruthy()
    // The function should reference dirtyTracking
    expect(markDirtyFn![0]).toMatch(/dirtyTracking/)
  })

  it('load() disables dirtyTracking before setting nodes/edges', () => {
    // load() must set dirtyTracking = false before updating nodes/edges,
    // then re-enable it after the update settles.
    const loadFn = source.match(/async function load\(\)[\s\S]*?^}/m)
    expect(loadFn).toBeTruthy()
    expect(loadFn![0]).toMatch(/dirtyTracking\s*=\s*false/)
  })
})
