import { describe, it, expect } from 'vitest'
import fs from 'fs'

import path from 'path'

const routerSrc = fs.readFileSync(
  path.join(import.meta.dirname, 'index.ts'),
  'utf-8'
)

describe('Router permission levels — ImportExport & Settings', () => {
  it('ImportExport route requires route:edit (not route:read)', () => {
    const importExportLine = routerSrc.match(/path:\s*['"]import-export['"][\s\S]*?permission:\s*['"]([^'"]+)['"]/)?.[1]
    expect(importExportLine).toBe('route:edit')
  })

  it('Settings route keeps system:read (read-only page, save buttons guard system:edit)', () => {
    const settingsLine = routerSrc.match(/path:\s*['"]settings['"][\s\S]*?permission:\s*['"]([^'"]+)['"]/)?.[1]
    expect(settingsLine).toBe('system:read')
  })

  it('Roles route keeps user:read (read-only page)', () => {
    const rolesLine = routerSrc.match(/path:\s*['"]roles['"][\s\S]*?permission:\s*['"]([^'"]+)['"]/)?.[1]
    expect(rolesLine).toBe('user:read')
  })
})
