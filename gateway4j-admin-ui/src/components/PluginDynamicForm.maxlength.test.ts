import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

describe('PluginDynamicForm — string input maxlength', () => {
  const src = fs.readFileSync(path.resolve(__dirname, 'PluginDynamicForm.vue'), 'utf-8')

  it('dynamic string FcInput has maxlength', () => {
    // The string-type FcInput should have maxlength for config values
    const lines = src.split('\n')
    const stringInputLine = lines.find(l => l.includes("value.type || 'string') === 'string'") && l.includes('maxlength'))
    expect(stringInputLine).toBeTruthy()
  })

  it('fallback FcInput has maxlength', () => {
    // The else-branch FcInput should also have maxlength
    const lines = src.split('\n')
    const fallbackLine = lines.find(l => l.includes('FcInput v-else') && l.includes('maxlength'))
    expect(fallbackLine).toBeTruthy()
  })
})
