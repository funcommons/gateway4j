import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

describe('RouteBindingsTable — limit feedback', () => {
  const src = fs.readFileSync(path.resolve(__dirname, 'RouteBindingsTable.vue'), 'utf-8')

  it('shows a warning message when MAX_BINDINGS is reached', () => {
    expect(src).toContain('ElMessage.warning')
    expect(src).toContain('maxBindingsReached')
  })
})
