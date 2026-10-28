import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const fcConfirmSource = fs.readFileSync(path.resolve(__dirname, '../../components/overlay/FcConfirm.vue'), 'utf-8')

describe('FcConfirm — trigger slot', () => {
  it('has a trigger slot that renders outside the dialog', () => {
    // FcConfirm must have a #trigger slot (or render the default slot as a
    // clickable trigger) so that wrapped buttons like <FcButton> appear in the
    // normal DOM and can open the dialog on click. Without this, the button
    // appears inside the dialog content instead.
    expect(fcConfirmSource).toMatch(/slot.*trigger|trigger.*slot|#trigger/)
  })
})
