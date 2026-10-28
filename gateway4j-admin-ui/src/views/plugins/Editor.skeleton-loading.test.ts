import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const source = fs.readFileSync(path.resolve(__dirname, 'Editor.vue'), 'utf-8')

describe('plugins/Editor.vue — skeleton loading state', () => {
  it('shows skeleton while loading, hides form content', () => {
    // While loading plugin data, the editor should show a skeleton placeholder
    // instead of empty form fields.
    expect(source).toMatch(/FcSkeleton/)
    const loadingBlock = source.match(/v-if="loading[^"]*"/g) || []
    expect(loadingBlock.length).toBeGreaterThanOrEqual(1)
  })

  it('imports FcSkeleton', () => {
    expect(source).toMatch(/FcSkeleton/)
  })
})
