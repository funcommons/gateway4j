import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

describe('plugins/List.vue — select option i18n', () => {
  const src = fs.readFileSync(path.resolve(__dirname, 'List.vue'), 'utf-8')

  it('typeOpts uses t() for labels instead of hardcoded strings', () => {
    expect(src).toMatch(/typeBuiltin/)
    expect(src).toMatch(/typeJar/)
    expect(src).toMatch(/typeGroovy/)
    expect(src).toMatch(/typeGroup/)
    expect(src).not.toMatch(/label: 'BUILTIN'/)
    expect(src).not.toMatch(/label: 'JAR'/)
    expect(src).not.toMatch(/label: 'GROOVY'/)
    expect(src).not.toMatch(/label: 'GROUP'/)
  })

  it('statusOpts uses t() for labels instead of hardcoded strings', () => {
    expect(src).toMatch(/statusEnabled/)
    expect(src).toMatch(/statusDisabled/)
    expect(src).toMatch(/statusUninstalled/)
    expect(src).not.toMatch(/label: 'ENABLED'/)
    expect(src).not.toMatch(/label: 'DISABLED'/)
    expect(src).not.toMatch(/label: 'UNINSTALLED'/)
  })
})

describe('plugins/Editor.vue — select option i18n', () => {
  const src = fs.readFileSync(path.resolve(__dirname, 'Editor.vue'), 'utf-8')

  it('typeOpts uses t() for labels', () => {
    expect(src).toMatch(/typeBuiltin/)
    expect(src).toMatch(/typeGroovy/)
  })

  it('phaseOpts uses t() for labels', () => {
    expect(src).toMatch(/phasePre/)
    expect(src).toMatch(/phasePost/)
  })

  it('scopeOpts uses t() for labels', () => {
    expect(src).toMatch(/scopeRoute/)
    expect(src).toMatch(/scopeGlobal/)
  })
})

describe('plugin i18n keys exist in both locales', () => {
  const en: any = fs.readFileSync(path.resolve(__dirname, '../../locales/en-US.ts'), 'utf-8')
  const zh: any = fs.readFileSync(path.resolve(__dirname, '../../locales/zh-CN.ts'), 'utf-8')

  it('type labels exist', () => {
    expect(en).toMatch(/typeBuiltin/)
    expect(en).toMatch(/typeJar/)
    expect(en).toMatch(/typeGroovy/)
    expect(en).toMatch(/typeGroup/)
    expect(zh).toMatch(/typeBuiltin/)
    expect(zh).toMatch(/typeJar/)
    expect(zh).toMatch(/typeGroovy/)
    expect(zh).toMatch(/typeGroup/)
  })

  it('status labels exist', () => {
    expect(en).toMatch(/statusEnabled/)
    expect(en).toMatch(/statusDisabled/)
    expect(en).toMatch(/statusUninstalled/)
    expect(zh).toMatch(/statusEnabled/)
    expect(zh).toMatch(/statusDisabled/)
    expect(zh).toMatch(/statusUninstalled/)
  })

  it('phase/scope labels exist', () => {
    expect(en).toMatch(/phasePre/)
    expect(en).toMatch(/phasePost/)
    expect(en).toMatch(/scopeRoute/)
    expect(en).toMatch(/scopeGlobal/)
    expect(zh).toMatch(/phasePre/)
    expect(zh).toMatch(/phasePost/)
    expect(zh).toMatch(/scopeRoute/)
    expect(zh).toMatch(/scopeGlobal/)
  })
})
