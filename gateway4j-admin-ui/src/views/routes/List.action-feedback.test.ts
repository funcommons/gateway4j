import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const source = fs.readFileSync(path.resolve(__dirname, 'List.vue'), 'utf-8')

describe('routes/List.vue — action feedback', () => {
  it('shows success message after publish', () => {
    const publishFn = source.substring(
      source.indexOf('async function publish'),
      source.indexOf('async function offline')
    )
    expect(publishFn).toMatch(/ElMessage\.success|publishSuccess/)
  })

  it('shows success message after offline', () => {
    const offlineFn = source.substring(
      source.indexOf('async function offline'),
      source.indexOf('async function del')
    )
    expect(offlineFn).toMatch(/ElMessage\.success|offlineSuccess/)
  })

  it('shows success message after delete', () => {
    const delFn = source.substring(
      source.indexOf('async function del'),
      source.indexOf('async function onNav')
    )
    expect(delFn).toMatch(/ElMessage\.success|deleteSuccess/)
  })
})
