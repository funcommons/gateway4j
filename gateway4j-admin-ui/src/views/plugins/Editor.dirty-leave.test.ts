import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const source = fs.readFileSync(path.resolve(__dirname, 'Editor.vue'), 'utf-8')

describe('plugins/Editor.vue — dirty leave guard', () => {
  it('tracks dirty state of the form', () => {
    expect(source).toMatch(/dirty/)
  })

  it('has onBeforeRouteLeave guard that checks dirty state', () => {
    expect(source).toMatch(/onBeforeRouteLeave/)
  })

  it('imports onBeforeRouteLeave from vue-router (not vue)', () => {
    const importLine = source.match(/import\s*\{[^}]*onBeforeRouteLeave[^}]*\}\s*from\s*['"]([^'"]+)['"]/)?.[1]
    expect(importLine).toBe('vue-router')
  })

  it('enables dirtyTracking after load completes, not before', () => {
    const loadFn = source.match(/async function loadPlugin\(\)[\s\S]*?^}/m)
    expect(loadFn).toBeTruthy()
    const body = loadFn![0]
    const trackingLine = body.indexOf('dirtyTracking = true')
    const loadingFalseLine = body.indexOf('loading.value = false')
    expect(trackingLine).toBeGreaterThan(0)
    expect(loadingFalseLine).toBeGreaterThan(0)
    // dirtyTracking=true must come after loading=false (load complete)
    expect(trackingLine).toBeGreaterThan(loadingFalseLine)
  })

  it('resets dirty to false after successful save', () => {
    const saveFn = source.match(/async function save\(\)[\s\S]*?^}/m)
    expect(saveFn).toBeTruthy()
    const body = saveFn![0]
    expect(body).toMatch(/dirty\.value\s*=\s*false/)
  })

  it('resets dirtyTracking at start of load', () => {
    const loadFn = source.match(/async function loadPlugin\(\)[\s\S]*?^}/m)
    expect(loadFn).toBeTruthy()
    const body = loadFn![0]
    expect(body).toMatch(/dirtyTracking\s*=\s*false/)
  })
})
