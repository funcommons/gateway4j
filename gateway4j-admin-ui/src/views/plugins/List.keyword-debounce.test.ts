import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const pluginsSource = fs.readFileSync(path.resolve(__dirname, 'List.vue'), 'utf-8')
const usersSource = fs.readFileSync(path.resolve(__dirname, '../users/List.vue'), 'utf-8')

describe('plugins/List.vue — keyword search debounce', () => {
  it('uses useDebounce for keyword to avoid firing API on every keystroke', () => {
    // Watching `keyword` directly causes an API call per keystroke.
    // The view should debounce keyword and watch the debounced ref instead.
    expect(pluginsSource).toMatch(/useDebounce/)
  })

  it('watches the debounced keyword, not the raw keyword ref', () => {
    // The watch that triggers reload should reference the debounced ref,
    // not the raw keyword ref that updates on every input event.
    const watchLine = pluginsSource.match(/watch\(\[.*?\].*?reload/)
    expect(watchLine).toBeTruthy()
    // Should NOT watch raw `keyword` in the array — should watch debounced version
    expect(watchLine![0]).not.toMatch(/watch\(\[.*\bkeyword\b.*\]/)
  })

  it('passes keyword to listPlugins API call', () => {
    // The keyword filter is useless if not sent to the backend.
    const reloadFn = pluginsSource.match(/async function reload\(\)[\s\S]*?^}/m)
    expect(reloadFn).toBeTruthy()
    expect(reloadFn![0]).toMatch(/keyword/)
  })
})

describe('users/List.vue — keyword search debounce', () => {
  it('uses useDebounce for keyword to avoid firing API on every keystroke', () => {
    expect(usersSource).toMatch(/useDebounce/)
  })

  it('watches the debounced keyword, not the raw keyword ref', () => {
    // Should not have a watch(keyword, ...) that fires reload directly
    const lines = usersSource.split('\n')
    const watchLines = lines.filter(l => l.includes('watch(') && l.includes('keyword') && l.includes('reload'))
    // If there's a watch on keyword, it should reference the debounced ref
    for (const line of watchLines) {
      expect(line).not.toMatch(/watch\(keyword\b/)
    }
  })
})
