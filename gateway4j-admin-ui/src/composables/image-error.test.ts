import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { convertImage, downscaleToMaxEdge } from '@/composables'

// Mock URL.createObjectURL to produce deterministic ids per Blob.
let urlCounter = 0
beforeEach(() => {
  urlCounter = 0
  ;(URL as any).createObjectURL = vi.fn(() => `blob:mock-${++urlCounter}`)
  ;(URL as any).revokeObjectURL = vi.fn()
})

// Helper: configure HTMLCanvasElement + Image with controllable behavior.
type ImageBehavior = 'success' | 'error' | 'context-null' | 'toBlob-null'

function installCanvasMock(behavior: ImageBehavior = 'success', dims: { w: number; h: number } = { w: 100, h: 50 }) {
  const proto = HTMLCanvasElement.prototype as any
  proto.getContext = function () {
    if (behavior === 'context-null') return null
    return {
      drawImage: vi.fn(),
      canvas: { width: 0, height: 0 }
    } as any
  }
  proto.toBlob = function (cb: (blob: Blob | null) => void, mime?: string) {
    if (behavior === 'toBlob-null') cb(null)
    else cb(new Blob(['mock'], { type: mime || 'image/png' }))
  }
  const imgProto = HTMLImageElement.prototype as any
  Object.defineProperty(imgProto, 'src', {
    set(_v: string) {
      this.width = dims.w
      this.height = dims.h
      if (behavior === 'error') {
        Promise.resolve().then(() => this.onerror?.call(this, new Event('error')))
      } else {
        Promise.resolve().then(() => this.onload?.call(this))
      }
    }
  })
  Object.defineProperty(imgProto, 'naturalWidth', { get() { return this.width } })
  Object.defineProperty(imgProto, 'naturalHeight', { get() { return this.height } })
}

function makeFile(): File {
  return new File(['x'], 'a.png', { type: 'image/png' })
}

afterEach(() => {
  // reset Image prototype for next test
  // (cannot `delete` because defineProperty was non-configurable by default)
  Object.defineProperty(HTMLImageElement.prototype, 'src', {
    set: undefined,
    get: undefined,
    configurable: true
  })
})

describe('convertImage — error paths', () => {
  it('rejects when Image fails to load (broken blob URL)', async () => {
    installCanvasMock('error')
    const file = makeFile()
    await expect(convertImage(file)).rejects.toThrow(/failed to load image/)
  })

  it('rejects when getContext returns null', async () => {
    installCanvasMock('context-null')
    const file = makeFile()
    await expect(convertImage(file)).rejects.toThrow(/failed to acquire 2d context/)
  })

  it('rejects when toBlob returns null', async () => {
    installCanvasMock('toBlob-null')
    const file = makeFile()
    await expect(convertImage(file)).rejects.toThrow(/toBlob returned null/)
  })

  it('does not throw synchronously (always returns a Promise)', () => {
    installCanvasMock('success')
    const file = makeFile()
    // No throw — just returns a Promise
    expect(() => convertImage(file)).not.toThrow()
  })
})

describe('downscaleToMaxEdge — error paths', () => {
  it('rejects when Image fails to load', async () => {
    installCanvasMock('error', { w: 200, h: 100 })  // larger than max to force canvas path
    const blob = new Blob(['x'], { type: 'image/png' })
    await expect(downscaleToMaxEdge(blob, 50)).rejects.toThrow(/failed to load image/)
  })

  it('rejects when getContext returns null', async () => {
    installCanvasMock('context-null', { w: 200, h: 100 })
    const blob = new Blob(['x'], { type: 'image/png' })
    await expect(downscaleToMaxEdge(blob, 50)).rejects.toThrow(/failed to acquire 2d context/)
  })

  it('rejects when toBlob returns null', async () => {
    installCanvasMock('toBlob-null', { w: 200, h: 100 })
    const blob = new Blob(['x'], { type: 'image/png' })
    await expect(downscaleToMaxEdge(blob, 50)).rejects.toThrow(/toBlob returned null/)
  })
})
