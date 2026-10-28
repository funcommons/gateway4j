import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

describe('Tabs labels — i18n reactivity', () => {
  const viewDirs = ['dashboard', 'plugins', 'routes', 'users', 'Settings']
  const viewFiles = [
    { name: 'dashboard/Index.vue', path: path.resolve(__dirname, 'dashboard/Index.vue') },
    { name: 'plugins/Global.vue', path: path.resolve(__dirname, 'plugins/Global.vue') },
    { name: 'plugins/Editor.vue', path: path.resolve(__dirname, 'plugins/Editor.vue') },
    { name: 'routes/Editor.vue', path: path.resolve(__dirname, 'routes/Editor.vue') },
    { name: 'routes/ImportExport.vue', path: path.resolve(__dirname, 'routes/ImportExport.vue') },
    { name: 'Settings.vue', path: path.resolve(__dirname, 'Settings.vue') },
    { name: 'users/Roles.vue', path: path.resolve(__dirname, 'users/Roles.vue') },
  ]

  it('tabs should be computed so labels update on locale change', () => {
    for (const { name, path: fpath } of viewFiles) {
      if (!fs.existsSync(fpath)) continue
      const source = fs.readFileSync(fpath, 'utf-8')
      // Find the tabs definition — should use computed()
      const tabsMatch = source.match(/const tabs\s*=\s*(computed\s*\(\s*\(\)\s*=>\s*)?/)
      if (tabsMatch) {
        // If tabs uses t(), it must be wrapped in computed() for reactivity
        const tabsBlock = source.substring(source.indexOf('const tabs'), source.indexOf('const tabs') + 200)
        const usesT = tabsBlock.includes("t('") || tabsBlock.includes('t("')
        if (usesT) {
          expect(tabsMatch[1], `${name}: tabs uses t() but is not computed`).toBeTruthy()
        }
      }
    }
  })
})
