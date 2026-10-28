import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const file = fs.readFileSync(path.resolve(__dirname, '../layouts/MainLayout.vue'), 'utf-8')

describe('MainLayout.vue — router navigation', () => {
  it('uses a method (not inline $router.push) for sidebar nav select', () => {
    // Inline $router.push in @select causes unhandled promise rejection on navigation failure
    expect(file).not.toMatch(/\$router\.push/)
  })

  it('navigates via an async function that awaits router.push', () => {
    expect(file).toMatch(/await router\.push/)
  })
})
