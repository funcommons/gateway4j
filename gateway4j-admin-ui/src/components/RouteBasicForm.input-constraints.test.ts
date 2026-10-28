import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

describe('RouteBasicForm — sort_order input type', () => {
  const src = fs.readFileSync(path.resolve(__dirname, 'RouteBasicForm.vue'), 'utf-8')

  it('uses el-input-number for sort_order (not FcInput type=number)', () => {
    // el-input-number with :min/:max prevents invalid input at the widget level,
    // while FcInput type="number" only validates on blur.
    expect(src).toContain('el-input-number')
    expect(src).toMatch(/sort_order.*:min="1"/)
    expect(src).toMatch(/sort_order.*:max="9999"/)
  })

  it('does not use FcInput for sort_order', () => {
    // The old pattern was: FcInput v-model.number="local.sort_order" type="number"
    expect(src).not.toContain('v-model.number="local.sort_order"')
  })
})

describe('RouteBasicForm — path/upstream maxlength', () => {
  const src = fs.readFileSync(path.resolve(__dirname, 'RouteBasicForm.vue'), 'utf-8')

  it('path input has maxlength constraint (VARCHAR 500)', () => {
    expect(src).toMatch(/local\.path.*maxlength/)
  })

  it('upstream_url input has maxlength constraint (VARCHAR 500)', () => {
    expect(src).toMatch(/local\.upstream_url.*maxlength/)
  })
})
