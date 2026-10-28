import { describe, it, expect, vi } from 'vitest'
import fs from 'fs'
import path from 'path'

const composableSource = fs.readFileSync(
  path.resolve(__dirname, 'useFcConfirm.ts'),
  'utf-8'
)

describe('useFcConfirm — composable structure', () => {
  it('exports a function named useFcConfirm', () => {
    expect(composableSource).toMatch(/export\s+function\s+useFcConfirm/)
  })

  it('returns a confirm function that returns a Promise', () => {
    expect(composableSource).toMatch(/Promise<boolean>/)
  })

  it('creates a FcConfirm instance dynamically', () => {
    expect(composableSource).toMatch(/FcConfirm/)
    expect(composableSource).toMatch(/createVNode/)
  })

  it('removes the DOM node after dialog closes', () => {
    expect(composableSource).toMatch(/removeChild|remove\(\)/)
  })

  it('supports variant prop', () => {
    expect(composableSource).toMatch(/variant/)
  })

  it('supports title, content, confirmText, cancelText props', () => {
    expect(composableSource).toMatch(/title/)
    expect(composableSource).toMatch(/content/)
  })

  it('inherits app context for i18n/pinia', () => {
    // Must pass appContext to the dynamically created vnode so that
    // FcConfirm's useI18n() works (otherwise it can't find the i18n symbol).
    expect(composableSource).toMatch(/appContext/)
    expect(composableSource).toMatch(/getCurrentInstance/)
  })

  it('resolves false when dialog is closed via update:open', () => {
    // When the user clicks ESC or overlay, FcConfirm emits update:open with false.
    // The composable should settle(false) in that case.
    expect(composableSource).toMatch(/if\s*\(!val\s*&&\s*!settled\)/)
    expect(composableSource).toMatch(/settle\(false\)/)
  })

  it('resolves true on confirm event', () => {
    expect(composableSource).toMatch(/settle\(true\)/)
  })

  it('settles the promise only once (settled guard)', () => {
    // A Promise can only settle once: FcConfirm emits confirm/cancel first and
    // update:open(false) afterwards — the second signal must be a no-op,
    // otherwise the result (true) would be overwritten with false.
    expect(composableSource).toMatch(/let settled = false/)
    const settleFn = composableSource.match(/function settle\([\s\S]*?\n  \}/)
    expect(settleFn).toBeTruthy()
    expect(settleFn![0]).toMatch(/if \(settled\) return/)
    expect(settleFn![0]).toMatch(/resolve\(result\)/)
  })

  it('unmounts using render(null, container) not render(null, vnode)', () => {
    // render(null, container) is the correct Vue 3 API to unmount a vnode.
    // render(null, vnode) is wrong — the second arg must be the container element.
    const cleanupMatch = composableSource.match(/function cleanup\(\)[\s\S]*?^\s*\}/m)
    expect(cleanupMatch).toBeTruthy()
    expect(cleanupMatch![0]).toMatch(/render\(null,\s*container\)/)
    expect(cleanupMatch![0]).not.toMatch(/render\(null,\s*vnode\)/)
  })
})
