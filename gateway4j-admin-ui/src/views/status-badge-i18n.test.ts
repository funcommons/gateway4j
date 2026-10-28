import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

describe('Status badge label i18n', () => {
  it('users/List.vue translates status label', () => {
    const src = fs.readFileSync(path.resolve(__dirname, 'users/List.vue'), 'utf-8')
    expect(src).toMatch(/common\.enabled/)
    expect(src).toMatch(/common\.disabled/)
    expect(src).not.toMatch(/:label="row\.status"/)
  })

  it('plugins/List.vue translates status label in table view', () => {
    const src = fs.readFileSync(path.resolve(__dirname, 'plugins/List.vue'), 'utf-8')
    expect(src).toMatch(/plugin\.statusEnabled/)
    expect(src).toMatch(/plugin\.statusDisabled/)
    expect(src).toMatch(/plugin\.statusUninstalled/)
  })

  it('plugins/List.vue translates status label in grouped view', () => {
    const src = fs.readFileSync(path.resolve(__dirname, 'plugins/List.vue'), 'utf-8')
    expect(src).not.toMatch(/:label="item\.status"/)
  })

  it('dashboard/Index.vue translates status label', () => {
    const src = fs.readFileSync(path.resolve(__dirname, 'dashboard/Index.vue'), 'utf-8')
    expect(src).toMatch(/monitor\.healthy/)
    expect(src).toMatch(/monitor\.errorRoute/)
    expect(src).toMatch(/monitor\.circuitOpen/)
    expect(src).not.toMatch(/:label="row\.status"/)
  })
})
