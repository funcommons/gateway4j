import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const source = fs.readFileSync(path.resolve(__dirname, 'Settings.vue'), 'utf-8')

describe('Settings.vue — dirty leave guard', () => {
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
    const loadFn = source.match(/async function loadConfig\(\)[\s\S]*?^}/m)
    expect(loadFn).toBeTruthy()
    const body = loadFn![0]
    const trackingLine = body.indexOf('dirtyTracking = true')
    const loadingFalseLine = body.indexOf('loading.value = false')
    expect(trackingLine).toBeGreaterThan(0)
    expect(loadingFalseLine).toBeGreaterThan(0)
    expect(trackingLine).toBeGreaterThan(loadingFalseLine)
  })

  it('resets dirty to false after successful save', () => {
    const saveGeneralFn = source.match(/async function saveGeneral\(\)[\s\S]*?^}/m)
    expect(saveGeneralFn).toBeTruthy()
    expect(saveGeneralFn![0]).toMatch(/dirty\.value\s*=\s*false/)
    const saveSecurityFn = source.match(/async function saveSecurity\(\)[\s\S]*?^}/m)
    expect(saveSecurityFn).toBeTruthy()
    expect(saveSecurityFn![0]).toMatch(/dirty\.value\s*=\s*false/)
  })

  it('resets dirtyTracking at start of load', () => {
    const loadFn = source.match(/async function loadConfig\(\)[\s\S]*?^}/m)
    expect(loadFn).toBeTruthy()
    expect(loadFn![0]).toMatch(/dirtyTracking\s*=\s*false/)
  })
})
