import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const source = fs.readFileSync(path.resolve(__dirname, 'PluginDynamicForm.vue'), 'utf-8')

describe('PluginDynamicForm — v-model loop prevention', () => {
  it('uses a guard flag to prevent emit-during-sync loop', () => {
    // Without the guard, the pattern is:
    //   1. props.modelValue changes → watch sets model.value = {...v}
    //   2. model changes → watch emits update:modelValue
    //   3. Parent sets v-model → props.modelValue changes → back to step 1
    // The guard (syncingFromProp) prevents step 2 from emitting during step 1.
    expect(source).toMatch(/syncingFromProp/)
    expect(source).toMatch(/if \(!syncingFromProp\)/)
  })
})
