import { describe, it, expect, beforeEach, vi } from 'vitest'
import fs from 'fs'
import path from 'path'

const source = fs.readFileSync(path.resolve(__dirname, 'Editor.vue'), 'utf-8')

describe('plugins/Editor.vue — JAR file upload in save()', () => {
  it('includes jar_file in createPlugin payload when plugin_type is JAR', () => {
    // When creating a JAR plugin, the save() function must send the JAR file
    // to the server. The current code only sends JSON fields and omits
    // form.value.jar_file entirely. This means JAR plugin creation silently
    // creates a plugin record without the actual JAR binary — the plugin
    // cannot be loaded at runtime.
    //
    // Check that the save() function references jar_file when building
    // the create payload for JAR type.
    const saveFunction = source.match(/async function save\(\)[\s\S]*?^}/m)
    expect(saveFunction).toBeTruthy()
    const body = saveFunction![0]

    // The createPlugin call should include jar_file for JAR type
    expect(body).toMatch(/jar_file/)
  })

  it('uses FormData or multipart when jar_file is present', () => {
    // JAR file upload requires multipart/form-data, not JSON.
    // The save() function should construct a FormData when jar_file is set.
    expect(source).toMatch(/FormData/)
  })
})
