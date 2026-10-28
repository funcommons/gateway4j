import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

// Checks that all save functions guard against double-invocation by checking
// saving.value before proceeding. The Idempotency-Key header protects the
// server side, but the client should also prevent duplicate requests and
// duplicate success messages.

const views = [
  { file: 'Settings.vue', fns: ['saveGeneral', 'saveSecurity'] },
  { file: 'plugins/Editor.vue', fns: ['save'] },
  { file: 'plugins/Builtin.vue', fns: ['saveConfig'] },
  { file: 'users/List.vue', fns: ['save'] },
  { file: 'routes/Editor.vue', fns: ['save'] },
  { file: 'routes/Canvas.vue', fns: ['save'] }
]

for (const { file, fns } of views) {
  const source = fs.readFileSync(path.resolve(__dirname, file), 'utf-8')

  describe(`${file} — double-save prevention`, () => {
    for (const fn of fns) {
      it(`${fn} checks saving before proceeding`, () => {
        const fnMatch = source.match(new RegExp(`async function ${fn}\\(.*?\\)[\\s\\S]*?^}`, 'm'))
        expect(fnMatch).toBeTruthy()
        const body = fnMatch![0]
        expect(body).toMatch(/if\s*\(\s*saving\.value\s*\)\s*return/)
      })
    }
  })
}
