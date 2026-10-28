import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('styles stub files', () => {
  const root = resolve(__dirname, '..')
  const sdkRoot = resolve(root, 'components')

  it('themes.scss exists and defines --app-bg-page, --app-text tokens', () => {
    const p = resolve(root, 'styles/themes.scss')
    const src = readFileSync(p, 'utf8')
    expect(src).toContain('--app-bg-page')
    expect(src).toContain('--app-text')
  })

  it('app-aliases.scss exists and defines all required --app aliases', () => {
    const p = resolve(root, 'styles/app-aliases.scss')
    const src = readFileSync(p, 'utf8')
    expect(src).toMatch(/--app-bg-page/)
    expect(src).toMatch(/--app-text/)
    expect(src).toMatch(/--app-primary/)
    expect(src).toMatch(/--app-radius-md/)
  })

  it('SDK theme.scss imports both stubs', () => {
    const p = resolve(sdkRoot, 'theme/theme.scss')
    const src = readFileSync(p, 'utf8')
    expect(src).toContain("@use '@/styles/themes'")
    expect(src).toContain("@use '@/styles/app-aliases'")
  })

  it('mixins.scss stub exists for SDK component imports', () => {
    const p = resolve(root, 'styles/mixins.scss')
    expect(readFileSync(p, 'utf8').length).toBeGreaterThan(10)
  })
})
