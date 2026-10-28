import { describe, it, expect } from 'vitest'
import zhCN from '@/locales/zh-CN'
import enUS from '@/locales/en-US'

describe('i18n — CHANGING route status keys', () => {
  it('zh-CN has statusChanging key', () => {
    expect(zhCN.route.statusChanging).toBeDefined()
    expect(typeof zhCN.route.statusChanging).toBe('string')
  })

  it('en-US has statusChanging key', () => {
    expect(enUS.route.statusChanging).toBeDefined()
    expect(typeof enUS.route.statusChanging).toBe('string')
  })

  it('both locales have the same route status keys', () => {
    const zhKeys = Object.keys(zhCN.route).filter(k => k.startsWith('status'))
    const enKeys = Object.keys(enUS.route).filter(k => k.startsWith('status'))
    expect(zhKeys.sort()).toEqual(enKeys.sort())
  })
})
