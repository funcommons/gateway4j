import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

describe('List views — FcSkeleton loading indicators', () => {
  it('routes/List.vue imports FcSkeleton', () => {
    const source = fs.readFileSync(path.resolve(__dirname, 'routes/List.vue'), 'utf-8')
    expect(source).toMatch(/FcSkeleton/)
  })

  it('routes/List.vue shows skeleton while loading', () => {
    const source = fs.readFileSync(path.resolve(__dirname, 'routes/List.vue'), 'utf-8')
    // FcSkeleton with v-if="loading" should be in the source
    expect(source).toMatch(/FcSkeleton.*loading/)
  })

  it('plugins/List.vue imports FcSkeleton', () => {
    const source = fs.readFileSync(path.resolve(__dirname, 'plugins/List.vue'), 'utf-8')
    expect(source).toMatch(/FcSkeleton/)
  })

  it('plugins/List.vue shows skeleton while loading', () => {
    const source = fs.readFileSync(path.resolve(__dirname, 'plugins/List.vue'), 'utf-8')
    expect(source).toMatch(/FcSkeleton.*loading/)
  })

  it('users/List.vue imports FcSkeleton', () => {
    const source = fs.readFileSync(path.resolve(__dirname, 'users/List.vue'), 'utf-8')
    expect(source).toMatch(/FcSkeleton/)
  })

  it('users/List.vue shows skeleton while loading', () => {
    const source = fs.readFileSync(path.resolve(__dirname, 'users/List.vue'), 'utf-8')
    expect(source).toMatch(/FcSkeleton.*loading/)
  })
})
