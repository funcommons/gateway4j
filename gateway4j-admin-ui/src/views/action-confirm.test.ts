import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

describe('Destructive action confirmation dialogs', () => {
  it('routes/List.vue: publish() has confirmation', () => {
    const source = fs.readFileSync(path.resolve(__dirname, 'routes/List.vue'), 'utf-8')
    // publish() should have a confirmation before executing
    const publishFn = source.match(/async function publish[\s\S]*?^}/m)
    expect(publishFn).toBeTruthy()
    expect(publishFn![0]).toMatch(/confirm|Confirm/)
  })

  it('routes/List.vue: offline() has confirmation', () => {
    const source = fs.readFileSync(path.resolve(__dirname, 'routes/List.vue'), 'utf-8')
    const offlineFn = source.match(/async function offline[\s\S]*?^}/m)
    expect(offlineFn).toBeTruthy()
    expect(offlineFn![0]).toMatch(/confirm|Confirm/)
  })

  it('users/List.vue: toggleStatus() has confirmation', () => {
    const source = fs.readFileSync(path.resolve(__dirname, 'users/List.vue'), 'utf-8')
    const toggleFn = source.match(/async function toggleStatus[\s\S]*?^}/m)
    expect(toggleFn).toBeTruthy()
    expect(toggleFn![0]).toMatch(/confirm|Confirm/)
  })

  it('plugins/Global.vue: togglePlugin() has confirmation', () => {
    const source = fs.readFileSync(path.resolve(__dirname, 'plugins/Global.vue'), 'utf-8')
    const toggleFn = source.match(/async function togglePlugin[\s\S]*?^}/m)
    expect(toggleFn).toBeTruthy()
    expect(toggleFn![0]).toMatch(/confirm|Confirm/)
  })

  it('plugins/Builtin.vue: toggleStatus() has confirmation', () => {
    const source = fs.readFileSync(path.resolve(__dirname, 'plugins/Builtin.vue'), 'utf-8')
    const toggleFn = source.match(/async function toggleStatus[\s\S]*?^}/m)
    expect(toggleFn).toBeTruthy()
    expect(toggleFn![0]).toMatch(/confirm|Confirm/)
  })

  it('plugins/List.vue: disable() has confirmation', () => {
    const source = fs.readFileSync(path.resolve(__dirname, 'plugins/List.vue'), 'utf-8')
    const disableFn = source.match(/async function disable[\s\S]*?^}/m)
    expect(disableFn).toBeTruthy()
    expect(disableFn![0]).toMatch(/confirm|Confirm/)
  })
})
