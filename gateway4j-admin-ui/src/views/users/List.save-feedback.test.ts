import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const source = fs.readFileSync(path.resolve(__dirname, 'List.vue'), 'utf-8')

describe('users/List.vue — save feedback', () => {
  it('shows success message after create/update', () => {
    // After a successful save, the user needs feedback.
    expect(source).toMatch(/ElMessage\.success|saveSuccess/)
  })

  it('shows success message after password reset', () => {
    // After a successful password reset, the user needs feedback.
    const resetFn = source.substring(
      source.indexOf('async function doReset'),
      source.indexOf('</script>')
    )
    expect(resetFn).toMatch(/ElMessage\.success|resetSuccess/)
  })

  it('uses mapFieldErrors for field-level error rendering', () => {
    // When the server returns field-level errors, they should be mapped
    // to el-form fields for inline display.
    expect(source).toMatch(/mapFieldErrors/)
  })
})
