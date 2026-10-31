import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const source = fs.readFileSync(path.resolve(__dirname, 'Global.vue'), 'utf-8')

describe('plugins/Global.vue — action feedback', () => {
  it('shows success message after togglePlugin', () => {
    const toggleFn = source.substring(
      source.indexOf('async function togglePlugin'),
      source.indexOf('async function saveSort')
    )
    expect(toggleFn).toMatch(/toast\.success/)
  })

  it('shows success message after saveSort', () => {
    const sortFn = source.substring(
      source.indexOf('async function saveSort'),
      source.indexOf('function onDragStart')
    )
    expect(sortFn).toMatch(/toast\.success/)
  })
})
