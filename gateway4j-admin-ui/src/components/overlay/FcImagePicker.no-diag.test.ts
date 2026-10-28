import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { nextTick } from 'vue'
import { mount } from '@vue/test-utils'

// Stub the heavy SDK dependencies that FcImagePicker imports
vi.mock('@/utils', () => ({
  useRecentImages: () => ({
    images: { value: [] },
    add: vi.fn(),
    remove: vi.fn(),
    clear: vi.fn(),
    getAll: () => []
  }),
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
  resolveIcon: vi.fn(() => null),
  convertImage: vi.fn(),
  downscaleToMaxEdge: vi.fn()
}))

// Minimal DOM mocks for jsdom
beforeEach(() => {
  if (typeof URL.createObjectURL !== 'function') {
    URL.createObjectURL = vi.fn(() => 'blob:mock')
    URL.revokeObjectURL = vi.fn()
  }
})

async function getDiagLogs() {
  const FcImagePicker = (await import('@/components/overlay/FcImagePicker.vue')).default
  const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
  try {
    const wrapper = mount(FcImagePicker, {
      props: { modelValue: '' }
    })
    await nextTick()
    return logSpy.mock.calls.flat().map(String).filter((s) => s.includes('[DIAG:'))
  } finally {
    logSpy.mockRestore()
  }
}

describe('FcImagePicker — production code must not emit DIAG logs', () => {
  it('has zero [DIAG:] console.log calls in mounted state', async () => {
    const diagLogs = await getDiagLogs()
    expect(diagLogs).toEqual([])
  })

  it('source file itself contains zero [DIAG:] string literals', async () => {
    // Belt-and-suspenders: read source and assert no DIAG prefixes remain
    const fs = await import('node:fs/promises')
    const path = await import('node:path')
    const src = await fs.readFile(
      path.join(process.cwd(), 'src/components/overlay/FcImagePicker.vue'),
      'utf-8'
    )
    const diagMatches = src.match(/\[DIAG:[^\]]*\]/g) ?? []
    expect(diagMatches).toEqual([])
  })
})
