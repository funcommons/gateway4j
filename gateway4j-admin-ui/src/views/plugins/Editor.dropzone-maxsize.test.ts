import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

describe('plugins/Editor.vue — FcDropZone max-size prop', () => {
  it('passes max-size (not max) to FcDropZone for JAR file size validation', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, 'Editor.vue'),
      'utf-8'
    )
    // Should use :max-size (the valid FcDropZone prop), not :max (which is ignored)
    const dropZoneMatch = source.match(/<FcDropZone[^>]*>/)
    expect(dropZoneMatch).toBeTruthy()
    const tag = dropZoneMatch![0]
    // Should NOT have :max (invalid prop)
    expect(tag).not.toMatch(/:max="/)
    // Should have :max-size with proper byte value or MAX_JAR_SIZE constant
    expect(tag).toMatch(/:max-size="/)
    expect(tag).toMatch(/MAX_JAR_SIZE|50\s*\*\s*1024\s*\*\s*1024|52428800/)
  })
})
