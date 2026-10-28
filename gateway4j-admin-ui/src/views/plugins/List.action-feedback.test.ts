import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const source = fs.readFileSync(path.resolve(__dirname, 'List.vue'), 'utf-8')

describe('plugins/List.vue — action feedback', () => {
  it('shows success message after enable', () => {
    const enableFn = source.substring(
      source.indexOf('async function enable'),
      source.indexOf('async function disable')
    )
    expect(enableFn).toMatch(/ElMessage\.success|enableSuccess/)
  })

  it('shows success message after disable', () => {
    const disableFn = source.substring(
      source.indexOf('async function disable'),
      source.indexOf('async function del')
    )
    expect(disableFn).toMatch(/ElMessage\.success|disableSuccess/)
  })

  it('shows success message after delete', () => {
    const delFn = source.substring(
      source.indexOf('async function del'),
      source.indexOf('async function onEdit')
    )
    expect(delFn).toMatch(/ElMessage\.success|deleteSuccess/)
  })
})
