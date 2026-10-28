import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const source = fs.readFileSync(path.resolve(__dirname, 'Canvas.vue'), 'utf-8')

describe('routes/Canvas.vue — save feedback', () => {
  it('shows success message after save', () => {
    const saveFn = source.substring(
      source.indexOf('async function save()'),
      source.indexOf('function onKeydown')
    )
    expect(saveFn).toMatch(/ElMessage\.success|saveSuccess/)
  })
})
