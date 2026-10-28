import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const viewDir = path.resolve(__dirname)

describe('No window.confirm in view files', () => {
  it('no view uses window.confirm (should use useFcConfirm instead)', () => {
    const vueFiles = fs.readdirSync(viewDir, { recursive: true })
      .filter((f): f is string => typeof f === 'string' && f.endsWith('.vue'))
      .map(f => path.join(viewDir, f))

    const violations: string[] = []
    for (const file of vueFiles) {
      const source = fs.readFileSync(file, 'utf-8')
      if (source.includes('window.confirm')) {
        violations.push(path.relative(viewDir, file))
      }
    }
    expect(violations).toEqual([])
  })
})
