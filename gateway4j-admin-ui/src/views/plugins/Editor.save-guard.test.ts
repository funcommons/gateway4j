import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const source = fs.readFileSync(path.resolve(__dirname, 'Editor.vue'), 'utf-8')

describe('plugins/Editor.vue — save guard during loading', () => {
  it('blocks save while loading', () => {
    // Don't save until form data is loaded — the user might click save
    // before the plugin data arrives, which would overwrite server data
    // with empty defaults.
    const saveFn = source.substring(
      source.indexOf('async function save()'),
      source.indexOf('onMounted(loadPlugin)')
    )
    expect(saveFn).toMatch(/if\s*\(\s*loading\.value\s*\)/)
  })
})
