import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const source = fs.readFileSync(path.resolve(__dirname, 'PluginDynamicForm.vue'), 'utf-8')

describe('PluginDynamicForm.vue — enum select branch', () => {
  it('string+enum condition is checked BEFORE the generic string condition', () => {
    // The v-if/v-else-if chain must check the more specific condition (string+enum)
    // before the generic string condition. If the generic string check comes first,
    // the enum select branch is dead code — users get a text input instead of
    // a dropdown for enum fields.
    const lines = source.split('\n')
    let genericStringLine = -1
    let enumStringLine = -1
    for (let i = 0; i < lines.length; i++) {
      // The enum branch: checks value.type === 'string' AND value.enum
      if (lines[i].includes("value.type") && lines[i].includes("'string'") && lines[i].includes("value.enum")) {
        enumStringLine = i
      }
      // The generic string branch: checks string type WITHOUT enum
      // This is the catch-all for plain string fields (no enum constraint)
      if ((lines[i].includes("v-if") || lines[i].includes("v-else-if")) && lines[i].includes("value.type") && lines[i].includes("'string'") && !lines[i].includes("value.enum")) {
        genericStringLine = i
      }
    }
    // The enum branch must come BEFORE the generic string branch
    expect(enumStringLine).toBeGreaterThan(-1)
    expect(genericStringLine).toBeGreaterThan(-1)
    expect(enumStringLine).toBeLessThan(genericStringLine)
  })
})
