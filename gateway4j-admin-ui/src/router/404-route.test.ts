import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

describe('router/index.ts — 404 catch-all route', () => {
  it('has a catch-all route that redirects unknown paths', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, 'index.ts'),
      'utf-8'
    )
    // Should have a catch-all route (path: '/:pathMatch(.*)*' or similar)
    expect(source).toMatch(/pathMatch|:pathMatch|catchAll|404|not.found/i)
  })
})
