import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const source = fs.readFileSync(path.resolve(__dirname, 'Editor.vue'), 'utf-8')

describe('plugins/Editor.vue — JAR plugin requires file', () => {
  it('save() rejects JAR plugin creation when no jar_file is selected', () => {
    // When creating a JAR plugin, the user must select a JAR file.
    // If they select type=JAR but don't upload a file, save() should show
    // an error instead of sending an incomplete JSON request to the server.
    //
    // The save() function has:
    //   if (form.value.plugin_type === 'JAR' && form.value.jar_file) { FormData }
    //   else { JSON payload }
    // When plugin_type=JAR and jar_file=null, it falls through to the else
    // branch — a bug. The fix should add a guard before the FormData check:
    //   if (form.value.plugin_type === 'JAR' && !form.value.jar_file) { error; return }
    //
    // Extract just the save() function body
    const saveStart = source.indexOf('async function save()')
    const saveEnd = source.indexOf('async function goBack()')
    expect(saveStart).toBeGreaterThan(-1)
    expect(saveEnd).toBeGreaterThan(saveStart)
    const saveFn = source.slice(saveStart, saveEnd)

    // Check: does the save function guard against JAR type without file?
    // Look for a pattern like: plugin_type === 'JAR' && !jar_file or similar
    // The guard must come BEFORE the create call
    const createIdx = saveFn.indexOf('createPlugin')
    const beforeCreate = saveFn.slice(0, createIdx)
    const hasJarGuard = /plugin_type.*JAR.*!.*jar_file|JAR.*jar_file.*required|jar_file.*JAR.*null/i.test(beforeCreate)
    expect(hasJarGuard).toBe(true)
  })
})
