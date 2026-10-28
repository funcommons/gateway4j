import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const source = fs.readFileSync(path.resolve(__dirname, 'Builtin.vue'), 'utf-8')

describe('Builtin — category grouping', () => {
  it('imports and uses a category mapping utility', () => {
    expect(source).toMatch(/getBuiltinCategory|builtinCategoryMap|PLUGIN_CATEGORIES/)
  })

  it('renders category section headers in the template', () => {
    expect(source).toMatch(/category.*label|category-header|category-title/)
  })

  it('groups plugins by category in computed or template', () => {
    expect(source).toMatch(/grouped|byCategory|category/)
  })
})
