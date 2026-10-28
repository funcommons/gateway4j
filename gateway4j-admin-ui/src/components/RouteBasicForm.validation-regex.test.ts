import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

describe('RouteBasicForm — validation regex correctness', () => {
  const src = fs.readFileSync(path.resolve(__dirname, 'RouteBasicForm.vue'), 'utf-8')

  it('path regex anchors at end and requires at least one char after /', () => {
    // In source: /^\/[^\s]+$/ — the + requires at least one char, $ anchors at end
    expect(src).toContain('/^\\/')
    expect(src).toContain('[^\\s]+$/')
  })

  it('path regex does not use zero-or-more quantifier for path segment', () => {
    // Old pattern /^\/[^\s]*/ allows bare "/" — must use + instead
    expect(src).not.toContain('[^\\s]*/,')
  })

  it('upstream_url regex anchors at end and rejects whitespace', () => {
    // In source: /^https?:\/\/\S+$/ — \S+ not .+, and $ anchor
    expect(src).toContain('/^https?:')
    expect(src).toContain('\\S+$/')
  })

  it('upstream_url regex does not use unanchored .+ pattern', () => {
    // Old pattern /^https?:\/\/.+/ allows trailing whitespace
    expect(src).not.toContain('.+/, message')
  })
})
