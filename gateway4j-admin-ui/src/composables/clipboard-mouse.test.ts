import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useClipboard, useMouse } from '@/composables'

describe('useClipboard', () => {
  const originalClipboard = (navigator as any).clipboard
  const originalExec = document.execCommand

  beforeEach(() => {
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: vi.fn().mockResolvedValue(undefined),
        readText: vi.fn().mockResolvedValue('pasted-text')
      },
      configurable: true,
      writable: true
    })
  })

  afterEach(() => {
    Object.defineProperty(navigator, 'clipboard', {
      value: originalClipboard,
      configurable: true,
      writable: true
    })
    if (originalExec) document.execCommand = originalExec
  })

  it('copy() returns undefined on success', async () => {
    const { copy } = useClipboard()
    expect(await copy('hello')).toBeUndefined()
  })

  it('copy() delegates to navigator.clipboard.writeText', async () => {
    const { copy } = useClipboard()
    await copy('payload')
    expect((navigator as any).clipboard.writeText).toHaveBeenCalledWith('payload')
  })

  it('paste() returns the clipboard contents', async () => {
    const { paste } = useClipboard()
    expect(await paste()).toBe('pasted-text')
  })

  it('paste() falls back to execCommand when clipboard API unavailable', async () => {
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true })
    const execSpy = vi.fn().mockReturnValue('legacy-paste')
    document.execCommand = execSpy as any
    const { paste } = useClipboard()
    const result = await paste()
    expect(execSpy).toHaveBeenCalledWith('paste')
    expect(result).toBe('legacy-paste')
  })

  it('copy() falls back to execCommand when clipboard API unavailable', async () => {
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true })
    const execSpy = vi.fn().mockReturnValue(true)
    document.execCommand = execSpy as any
    const { copy } = useClipboard()
    await copy('text')
    expect(execSpy).toHaveBeenCalledWith('copy')
  })
})

describe('useMouse', () => {
  it('returns reactive x/y refs', () => {
    const { x, y } = useMouse()
    expect(x.value).toBe(0)
    expect(y.value).toBe(0)
  })

  it('updates x/y on mousemove event', () => {
    const m = useMouse()
    const ev = new MouseEvent('mousemove', { clientX: 100, clientY: 200 })
    window.dispatchEvent(ev)
    expect(m.x.value).toBe(100)
    expect(m.y.value).toBe(200)
  })

  it('multiple events keep updating', () => {
    const m = useMouse()
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 10, clientY: 20 }))
    expect(m.x.value).toBe(10)
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 50, clientY: 60 }))
    expect(m.x.value).toBe(50)
    expect(m.y.value).toBe(60)
  })
})