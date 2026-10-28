import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const source = fs.readFileSync(path.resolve(__dirname, 'Editor.vue'), 'utf-8')

describe('routes/Editor.vue — save success feedback', () => {
  it('shows success message after save', () => {
    // After a successful save, the user needs feedback that the operation
    // completed. The save() function must show a success message.
    expect(source).toMatch(/saveSuccess|ElMessage\.success/)
  })

  it('reloads route data after update to reflect server state', () => {
    // After updateRoute succeeds, the editor should reload the route data
    // so that status, config_version etc. reflect the server state.
    const saveFn = source.substring(
      source.indexOf('async function save()'),
      source.indexOf('onMounted(load)')
    )
    expect(saveFn).toMatch(/await load\(\)|load\(\)/)
  })
})
