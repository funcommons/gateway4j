import { describe, it, expect, vi, beforeEach } from 'vitest'
import { convertImage, downscaleToMaxEdge, useRecentImages } from '@/composables'

// Mock URL.createObjectURL to produce deterministic ids per Blob.
let urlCounter = 0
beforeEach(() => {
  urlCounter = 0
  ;(URL as any).createObjectURL = vi.fn(() => `blob:mock-${++urlCounter}`)
  ;(URL as any).revokeObjectURL = vi.fn()
})

// In jsdom there's no real Canvas. We mock the bare minimum of HTMLCanvasElement
// + HTMLImageElement that the implementations need.
function installCanvasMock() {
  const proto = HTMLCanvasElement.prototype as any
  proto.getContext = function () {
    return {
      drawImage: vi.fn(),
      canvas: { width: 0, height: 0 }
    } as any
  }
  proto.toBlob = function (cb: (blob: Blob | null) => void, mime?: string) {
    cb(new Blob(['mock'], { type: mime || 'image/png' }))
  }
  // HTMLImageElement constructor normally loads asynchronously via src=URL.
  // We force it to call onload synchronously by intercepting the assignment.
  const imgProto = HTMLImageElement.prototype as any
  Object.defineProperty(imgProto, 'src', {
    set(_v: string) {
      // Make width/height available synchronously
      this.width = 100
      this.height = 50
      // Fire onload on next microtask
      Promise.resolve().then(() => this.onload?.call(this))
    }
  })
  // naturalWidth/Height read as our set width/height
  Object.defineProperty(imgProto, 'naturalWidth', { get() { return this.width } })
  Object.defineProperty(imgProto, 'naturalHeight', { get() { return this.height } })
}

installCanvasMock()

function makeImageFile(name = 'a.png', type = 'image/png'): File {
  // 1x1 transparent PNG
  const bytes = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0, 31, 21, 196, 137, 0, 0, 0, 13, 73, 68, 65, 84, 120, 156, 99, 0, 2, 0, 0, 5, 0, 1, 13, 10, 45, 180, 0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130]
  return new File([new Uint8Array(bytes)], name, { type })
}

describe('convertImage', () => {
  it('returns a Blob (not an empty string)', async () => {
    const file = makeImageFile()
    const result = await convertImage(file, 'image/jpeg')
    expect(result).toBeInstanceOf(Blob)
  })

  it('preserves the requested mime type on the output Blob', async () => {
    const file = makeImageFile('a.png', 'image/png')
    const result = await convertImage(file, 'image/webp')
    expect(result.type).toBe('image/webp')
  })

  it('handles a JPEG target mime', async () => {
    const file = makeImageFile()
    const result = await convertImage(file, 'image/jpeg')
    expect(result.type).toBe('image/jpeg')
  })
})

describe('downscaleToMaxEdge', () => {
  it('returns a Blob', async () => {
    const file = makeImageFile()
    // jsdom's File doesn't implement arrayBuffer — use the file directly
    const result = await downscaleToMaxEdge(file as unknown as Blob, 200)
    expect(result).toBeInstanceOf(Blob)
  })

  it('returns the input blob unchanged when already smaller than max edge', async () => {
    // mock gives 100x50; max 200 should not scale
    const blob = new Blob(['orig'], { type: 'image/png' })
    const result = await downscaleToMaxEdge(blob, 200)
    expect(result).toBe(blob) // same reference = no-op
  })

  it('returns the input blob unchanged when max edge is 0 or negative', async () => {
    const blob = new Blob(['orig'], { type: 'image/png' })
    expect(await downscaleToMaxEdge(blob, 0)).toBe(blob)
    expect(await downscaleToMaxEdge(blob, -1)).toBe(blob)
  })

  it('produces a new Blob (not the same ref) when scaling is needed', async () => {
    // For 100x50 with max 50, the image needs to be downscaled
    const blob = new Blob(['orig'], { type: 'image/png' })
    const result = await downscaleToMaxEdge(blob, 50)
    expect(result).toBeInstanceOf(Blob)
    expect(result).not.toBe(blob)
  })
})

describe('useRecentImages', () => {
  it('returns a reactive images array ref', () => {
    const r = useRecentImages()
    expect(r).toHaveProperty('images')
    expect(Array.isArray(r.images.value)).toBe(true)
  })

  it('starts with empty list', () => {
    const r = useRecentImages()
    expect(r.images.value.length).toBe(0)
  })
})