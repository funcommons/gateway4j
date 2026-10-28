import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const source = fs.readFileSync(path.resolve(__dirname, 'Global.vue'), 'utf-8')

describe('Global.vue — loading indicator', () => {
  it('imports FcSkeleton component', () => {
    expect(source).toMatch(/FcSkeleton/)
  })

  it('shows skeleton while loading', () => {
    const template = source.match(/<template>[\s\S]*?<\/template>/)?.[0]
    expect(template).toBeTruthy()
    expect(template).toMatch(/FcSkeleton/)
    expect(template).toMatch(/loading/)
  })

  it('hides plugin list while loading', () => {
    // The plugin list should be inside <template v-else> which only renders
    // when the v-if="loading" FcSkeleton is false (i.e. not loading)
    const template = source.match(/<template>[\s\S]*?<\/template>/)?.[0]
    expect(template).toBeTruthy()
    expect(template).toMatch(/v-else/)
  })
})
