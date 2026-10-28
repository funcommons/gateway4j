import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const source = fs.readFileSync(path.resolve(__dirname, 'Editor.vue'), 'utf-8')

describe('plugins/Editor.vue — save success feedback', () => {
  it('shows success message after save', () => {
    // After a successful save, the user needs feedback that the operation
    // completed. The save() function must show a success message.
    expect(source).toMatch(/saveSuccess|ElMessage\.success/)
  })

  it('reloads plugin data after update to reflect server state', () => {
    // After updatePlugin succeeds, the editor should reload the plugin data
    // so that status, config etc. reflect the server state.
    const saveFn = source.substring(
      source.indexOf('async function save()'),
      source.indexOf('onMounted(loadPlugin)')
    )
    expect(saveFn).toMatch(/await loadPlugin\(\)|loadPlugin\(\)/)
  })
})
