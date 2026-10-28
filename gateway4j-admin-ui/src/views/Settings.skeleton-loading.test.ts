import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const source = fs.readFileSync(path.resolve(__dirname, 'Settings.vue'), 'utf-8')

describe('Settings.vue — skeleton loading state', () => {
  it('uses FcSkeleton (not FcEmpty) for loading state', () => {
    // PRD: use Skeleton placeholder during data loading, not plain text.
    // The loading state in general/security tabs should use FcSkeleton,
    // not FcEmpty with "processing" text.
    const loadingBlocks = source.match(/<\w+[^>]*v-if="loading"[^>]*\/?>/g) || []
    for (const block of loadingBlocks) {
      expect(block).toMatch(/FcSkeleton/)
    }
  })

  it('imports FcSkeleton', () => {
    expect(source).toMatch(/FcSkeleton/)
  })
})
