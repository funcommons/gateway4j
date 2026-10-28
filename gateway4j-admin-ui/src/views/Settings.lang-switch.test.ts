import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const source = fs.readFileSync(path.resolve(__dirname, 'Settings.vue'), 'utf-8')

describe('Settings.vue — language switch on save', () => {
  it('saveGeneral updates i18n locale after saving', () => {
    // When the user changes the language setting and saves, the UI must
    // switch immediately — not require a page refresh.
    // The saveGeneral function must set i18n.global.locale.value after save.
    expect(source).toMatch(/locale\.value\s*=\s*|locale\s*=.*lang/i)
  })

  it('saveGeneral persists language to localStorage', () => {
    // The selected language must persist in localStorage (gw4j_lang)
    // so it survives page reloads.
    expect(source).toMatch(/gw4j_lang/)
  })
})
