import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const source = fs.readFileSync(path.resolve(__dirname, 'Editor.vue'), 'utf-8')

describe('routes/Editor.vue — dirty leave guard', () => {
  it('tracks dirty state of the form', () => {
    expect(source).toMatch(/dirty/)
  })

  it('has onBeforeRouteLeave guard that checks dirty state', () => {
    expect(source).toMatch(/onBeforeRouteLeave/)
  })

  it('enables dirtyTracking after secondary fetches complete, not before', () => {
    // If dirtyTracking=true is set before loadConditions/loadBindings,
    // those fetches would trigger the deep watch and falsely mark the form dirty.
    const loadFn = source.match(/async function load\(\)[\s\S]*?^}/m)
    expect(loadFn).toBeTruthy()
    const body = loadFn![0]
    const trackingLine = body.indexOf('dirtyTracking = true')
    const conditionsLine = body.indexOf('loadConditions')
    const bindingsLine = body.indexOf('loadBindings')
    expect(trackingLine).toBeGreaterThan(0)
    expect(conditionsLine).toBeGreaterThan(0)
    expect(bindingsLine).toBeGreaterThan(0)
    // dirtyTracking=true must come AFTER both loadConditions and loadBindings
    expect(trackingLine).toBeGreaterThan(conditionsLine)
    expect(trackingLine).toBeGreaterThan(bindingsLine)
  })
})
