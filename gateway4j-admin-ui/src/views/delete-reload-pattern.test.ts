import { describe, it, expect, beforeEach, vi } from 'vitest'
import { readFileSync } from 'fs'

describe('Delete-then-reload pattern', () => {
  it('routes/List.vue only reloads after successful delete', () => {
    const source = readFileSync('src/views/routes/List.vue', 'utf-8')
    // The del() function should call reload() inside try, not outside
    // Find the del function and check reload placement
    const delMatch = source.match(/async function del[\s\S]*?^}/m)
    expect(delMatch).toBeTruthy()
    const delFn = delMatch![0]
    // reload should be inside try block, not after catch
    const tryCatch = delFn.match(/try\s*{([\s\S]*?)}\s*catch/)
    expect(tryCatch).toBeTruthy()
    expect(tryCatch![1]).toContain('reload()')
  })

  it('routes/List.vue only reloads after successful publish', () => {
    const source = readFileSync('src/views/routes/List.vue', 'utf-8')
    const publishMatch = source.match(/async function publish[\s\S]*?^}/m)
    expect(publishMatch).toBeTruthy()
    const fn = publishMatch![0]
    const tryCatch = fn.match(/try\s*{([\s\S]*?)}\s*catch/)
    expect(tryCatch).toBeTruthy()
    expect(tryCatch![1]).toContain('reload()')
  })

  it('routes/List.vue only reloads after successful offline', () => {
    const source = readFileSync('src/views/routes/List.vue', 'utf-8')
    const offlineMatch = source.match(/async function offline[\s\S]*?^}/m)
    expect(offlineMatch).toBeTruthy()
    const fn = offlineMatch![0]
    const tryCatch = fn.match(/try\s*{([\s\S]*?)}\s*catch/)
    expect(tryCatch).toBeTruthy()
    expect(tryCatch![1]).toContain('reload()')
  })

  it('users/List.vue only reloads after successful delete', () => {
    const source = readFileSync('src/views/users/List.vue', 'utf-8')
    const delMatch = source.match(/async function del[\s\S]*?^}/m)
    expect(delMatch).toBeTruthy()
    const delFn = delMatch![0]
    const tryCatch = delFn.match(/try\s*{([\s\S]*?)}\s*catch/)
    expect(tryCatch).toBeTruthy()
    expect(tryCatch![1]).toContain('reload()')
  })
})
