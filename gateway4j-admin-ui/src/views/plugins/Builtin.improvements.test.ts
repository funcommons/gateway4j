import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const source = fs.readFileSync(path.resolve(__dirname, 'Builtin.vue'), 'utf-8')

describe('plugins/Builtin.vue — improvements', () => {
  it('uses FcSkeleton (not FcEmpty) for loading state', () => {
    const loadingBlocks = source.match(/<\w+[^>]*v-if="loading"[^>]*\/?>/g) || []
    for (const block of loadingBlocks) {
      expect(block).toMatch(/FcSkeleton/)
    }
  })

  it('shows success message after saveConfig', () => {
    const saveFn = source.substring(
      source.indexOf('async function saveConfig'),
      source.indexOf('async function toggleStatus')
    )
    expect(saveFn).toMatch(/ElMessage\.success|saveSuccess/)
  })

  it('shows success message after toggleStatus', () => {
    const toggleFn = source.substring(
      source.indexOf('async function toggleStatus'),
      source.indexOf('</script>')
    )
    expect(toggleFn).toMatch(/ElMessage\.success|statusUpdateSuccess/)
  })

  it('imports FcSkeleton', () => {
    expect(source).toMatch(/FcSkeleton/)
  })
})
