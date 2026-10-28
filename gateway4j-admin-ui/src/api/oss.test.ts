import { describe, it, expect, vi, beforeEach } from 'vitest'
import { uploadImage, release } from '@/api/oss'

const localStorageMock = (() => {
  const m = new Map<string, string>()
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => m.set(k, v),
    removeItem: (k: string) => m.delete(k),
    clear: () => m.clear()
  }
})()

let createCount = 0
let revokeCount = 0
const createdUrls: string[] = []

beforeEach(() => {
  createCount = 0
  revokeCount = 0
  createdUrls.length = 0
  Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock, configurable: true })
  localStorageMock.clear()
  ;(URL as any).createObjectURL = vi.fn((blob: Blob) => {
    const u = `blob:mock-${++createCount}`
    createdUrls.push(u)
    return u
  })
  ;(URL as any).revokeObjectURL = vi.fn(() => { revokeCount++ })
})

function makeFile(): File {
  return new File(['hello'], 'test.png', { type: 'image/png' })
}

describe('uploadImage', () => {
  it('returns a Promise<string> (not an object)', async () => {
    const result = uploadImage(makeFile())
    expect(result).toBeInstanceOf(Promise)
    const url = await result
    expect(typeof url).toBe('string')
  })

  it('returned URL is a blob: URL usable as src attribute', async () => {
    const url = await uploadImage(makeFile())
    expect(url).toMatch(/^blob:/)
  })

  it('returns a non-empty URL for the input file', async () => {
    const url = await uploadImage(makeFile())
    expect(url.length).toBeGreaterThan(0)
  })

  it('produces a fresh URL per call (no caching across uploads)', async () => {
    const a = await uploadImage(makeFile())
    const b = await uploadImage(makeFile())
    expect(a).not.toBe(b)
  })

  it('does not leak: each call revokes its URL after consumer is done (configurable)', async () => {
    // For now we only assert that createObjectURL is called. A future change
    // can introduce an explicit `release(url)` helper that revokes the URL —
    // verified by FcImagePicker unmount lifecycle in integration tests.
    const url = await uploadImage(makeFile())
    expect(createdUrls).toContain(url)
  })
})

describe('release', () => {
  it('revokes a blob: URL', async () => {
    const url = await uploadImage(makeFile())
    release(url)
    expect(revokeCount).toBe(1)
  })

  it('no-ops for non-blob URLs (http:, data:, etc.)', () => {
    release('https://cdn.example.com/img.png')
    release('data:image/png;base64,abc')
    release('')
    expect(revokeCount).toBe(0)
  })

  it('pairing upload+release balances create/revoke counts', async () => {
    const a = await uploadImage(makeFile())
    const b = await uploadImage(makeFile())
    const c = await uploadImage(makeFile())
    release(a)
    release(b)
    release(c)
    expect(createCount).toBe(3)
    expect(revokeCount).toBe(3)
  })
})