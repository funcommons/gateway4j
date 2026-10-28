import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

describe('plugins/Builtin.vue — card status indicator', () => {
  const source = fs.readFileSync(path.resolve(__dirname, 'Builtin.vue'), 'utf-8')

  it('each builtin plugin card shows a status indicator (FcStatusBadge or FcSwitch)', () => {
    // PRODUCT.md F-PLUGIN-003: each card shows status switch
    // The card template should include a status indicator element
    // Check that the card area (inside v-for loop) has a status display
    const cardSection = source.substring(
      source.indexOf('v-for="item in cat.plugins"'),
      source.indexOf('</FcSectionCard>', source.indexOf('v-for="item in cat.plugins"'))
    )
    const hasStatusBadge = cardSection.includes('FcStatusBadge') || cardSection.includes('FcSwitch')
    expect(hasStatusBadge, 'Builtin plugin card should show status indicator').toBe(true)
  })

  it('card status reflects item.status (ENABLED/DISABLED)', () => {
    // The status indicator should reference item.status
    const cardSection = source.substring(
      source.indexOf('v-for="item in cat.plugins"'),
      source.indexOf('</FcSectionCard>', source.indexOf('v-for="item in cat.plugins"'))
    )
    const hasStatusRef = cardSection.includes('item.status')
    expect(hasStatusRef, 'Card status indicator should reference item.status').toBe(true)
  })
})
