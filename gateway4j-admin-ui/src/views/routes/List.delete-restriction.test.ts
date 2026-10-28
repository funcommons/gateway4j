import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const source = fs.readFileSync(path.resolve(__dirname, 'List.vue'), 'utf-8')

// Extract the action column template
const actionStart = source.indexOf("label=\"t('common.more')\"")
const actionEnd = source.indexOf('</el-table-column>', actionStart)
const actionCol = source.slice(actionStart, actionEnd)

describe('routes/List.vue — delete restricted by status', () => {
  it('delete button only appears for DRAFT and OFFLINE routes', () => {
    // PRD state machine: only DRAFT and OFFLINE routes can be deleted.
    // PUBLISHED and CHANGING routes must not show the delete button.
    // The FcConfirm+FcButton for delete must have a v-if restricting it.
    expect(actionCol).toMatch(/v-if.*DRAFT.*OFFLINE|v-if.*OFFLINE.*DRAFT/)
  })

  it('delete button is NOT unconditionally visible', () => {
    // The delete button must NOT be visible for all statuses
    const hasUnconditionalDelete = /<FcConfirm[^>]*>\s*<FcButton[^>]*type="danger"/.test(actionCol) &&
      !actionCol.match(/FcConfirm[^>]*v-if/)
    expect(hasUnconditionalDelete).toBe(false)
  })
})
