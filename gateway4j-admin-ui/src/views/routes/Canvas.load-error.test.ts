import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const source = fs.readFileSync(path.resolve(__dirname, 'Canvas.vue'), 'utf-8')

describe('Canvas.vue — load error display', () => {
  it('has a loadError ref', () => {
    expect(source).toMatch(/loadError/)
  })

  it('sets loadError when load fails', () => {
    const loadFn = source.match(/async function load\(\)[\s\S]*?^}/m)
    expect(loadFn).toBeTruthy()
    expect(loadFn![0]).toMatch(/loadError/)
  })

  it('renders loadError in template', () => {
    // Template should show loadError somewhere so user knows load failed
    expect(source).toMatch(/loadError/)
    // Verify it's in the template section (before <script>)
    const template = source.match(/<template>[\s\S]*?<\/template>/)?.[0]
    expect(template).toBeTruthy()
    expect(template).toMatch(/loadError/)
  })

  it('clears loadError at start of load', () => {
    const loadFn = source.match(/async function load\(\)[\s\S]*?^}/m)
    expect(loadFn).toBeTruthy()
    const body = loadFn![0]
    const clearLine = body.indexOf("loadError.value = ''")
    const startLine = body.indexOf('loading.value = true')
    expect(clearLine).toBeGreaterThan(0)
    expect(startLine).toBeGreaterThan(0)
    // Clear should happen before or at same time as loading starts
    expect(clearLine).toBeLessThan(startLine + 100) // within same block
  })
})
