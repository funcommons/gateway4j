import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const editorSource = fs.readFileSync(path.resolve(__dirname, 'Editor.vue'), 'utf-8')

describe('plugins/Editor.vue — JAR upload event binding', () => {
  it('uses @drop (not @change) on FcDropZone', () => {
    // FcDropZone emits 'drop' with File[], not 'change'
    // Using @change means the handler never fires — JAR upload is broken
    expect(editorSource).not.toMatch(/FcDropZone[^>]*@change/)
    expect(editorSource).toMatch(/FcDropZone[^>]*@drop/)
  })

  it('onJar handler accepts File[] (not a single File)', () => {
    // FcDropZone emits File[], so the handler must accept an array
    expect(editorSource).toMatch(/onJar.*File\[\]/)
  })
})
