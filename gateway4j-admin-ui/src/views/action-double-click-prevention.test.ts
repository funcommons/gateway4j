import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

// Action functions (publish, offline, export, validate, import, reset) should
// check their respective flag before proceeding to prevent double-invocation.

const checks = [
  // H7b T2：publish 拆成两段 —— publish() 只开弹窗，真正的提交守卫在 onPublishConfirm
  { file: 'routes/Editor.vue', fn: 'onPublishConfirm', flag: 'publishing' },
  { file: 'routes/Editor.vue', fn: 'offline', flag: 'offlining' },
  { file: 'routes/ImportExport.vue', fn: 'onExport', flag: 'exporting' },
  { file: 'routes/ImportExport.vue', fn: 'onValidate', flag: 'validating' },
  { file: 'routes/ImportExport.vue', fn: 'onImport', flag: 'importing' },
  { file: 'users/List.vue', fn: 'doReset', flag: 'resetting' }
]

for (const { file, fn, flag } of checks) {
  const source = fs.readFileSync(path.resolve(__dirname, file), 'utf-8')

  describe(`${file} — ${fn}() double-click prevention`, () => {
    it(`${fn} checks ${flag} before proceeding`, () => {
      const fnMatch = source.match(new RegExp(`async function ${fn}\\(.*?\\)[\\s\\S]*?^}`, 'm'))
      expect(fnMatch).toBeTruthy()
      const body = fnMatch![0]
      expect(body).toMatch(new RegExp(`if\\s*\\(\\s*${flag}\\.value\\s*\\)\\s*return`))
    })
  })
}
