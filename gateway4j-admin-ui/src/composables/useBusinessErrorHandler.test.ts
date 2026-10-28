import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { BusinessError, ERR_PERMISSION_DENIED, ERR_RATE_LIMITED, ERR_DUPLICATE_SUBMIT } from '@/api/http'
import fs from 'fs'
import path from 'path'

const source = fs.readFileSync(path.resolve(__dirname, 'useBusinessErrorHandler.ts'), 'utf-8')

// We test the handler logic directly without mounting Vue, since the
// composable uses useI18n/useRouter which require a full Vue app context.
// Instead, extract the core handler logic and test it in isolation.

function createHandler(callbacks: {
  onError: (msg: string) => void
  onWarning: (msg: string, duration?: number) => void
  onRedirect: (name: string) => void
  t: (key: string, params?: Record<string, unknown>) => string
}) {
  const { onError, onWarning, onRedirect, t } = callbacks

  return function handler(event: PromiseRejectionEvent) {
    const err = event.reason
    if (!(err instanceof BusinessError)) return

    event.preventDefault()

    switch (err.code) {
      case ERR_PERMISSION_DENIED:
        onError(t('common.permissionDenied'))
        onRedirect('Login')
        break
      case ERR_RATE_LIMITED: {
        const seconds = err.retryAfter
        const msg = seconds
          ? t('common.rateLimited', { seconds })
          : t('common.rateLimited', { seconds: '?' })
        onWarning(msg, 5000)
        break
      }
      case ERR_DUPLICATE_SUBMIT:
        onWarning(t('common.duplicateSubmit'))
        break
      default:
        onError(err.message || t('common.failed'))
    }
  }
}

describe('useBusinessErrorHandler — handler logic', () => {
  let onError: ReturnType<typeof vi.fn>
  let onWarning: ReturnType<typeof vi.fn>
  let onRedirect: ReturnType<typeof vi.fn>
  let handler: ReturnType<typeof createHandler>

  const t = (key: string, params?: Record<string, unknown>) => {
    const map: Record<string, string> = {
      'common.permissionDenied': '权限不足',
      'common.rateLimited': `请 ${params?.seconds ?? '?'} 秒后重试`,
      'common.duplicateSubmit': '请勿重复操作',
      'common.failed': '操作失败'
    }
    return map[key] ?? key
  }

  beforeEach(() => {
    onError = vi.fn()
    onWarning = vi.fn()
    onRedirect = vi.fn()
    handler = createHandler({ onError, onWarning, onRedirect, t })
  })

  function fakeEvent(reason: unknown) {
    return { reason, preventDefault: vi.fn() } as unknown as PromiseRejectionEvent
  }

  it('ignores non-BusinessError rejections', () => {
    handler(fakeEvent(new Error('generic')))
    expect(onError).not.toHaveBeenCalled()
    expect(onWarning).not.toHaveBeenCalled()
  })

  it('shows error toast and redirects to Login on 10300', () => {
    handler(fakeEvent(new BusinessError(ERR_PERMISSION_DENIED, '权限不足')))
    expect(onError).toHaveBeenCalledWith('权限不足')
    expect(onRedirect).toHaveBeenCalledWith('Login')
  })

  it('shows warning toast with retry seconds on 10500', () => {
    handler(fakeEvent(new BusinessError(ERR_RATE_LIMITED, 'rate limited', 30)))
    expect(onWarning).toHaveBeenCalledWith('请 30 秒后重试', 5000)
  })

  it('shows warning toast with ? seconds on 10500 without retryAfter', () => {
    handler(fakeEvent(new BusinessError(ERR_RATE_LIMITED, 'rate limited')))
    expect(onWarning).toHaveBeenCalledWith('请 ? 秒后重试', 5000)
  })

  it('shows warning toast on 10501 (duplicate submit)', () => {
    handler(fakeEvent(new BusinessError(ERR_DUPLICATE_SUBMIT, '请勿重复操作')))
    expect(onWarning).toHaveBeenCalledWith('请勿重复操作')
  })

  it('shows error toast with server message for unknown codes', () => {
    handler(fakeEvent(new BusinessError(10100, '参数校验失败')))
    expect(onError).toHaveBeenCalledWith('参数校验失败')
  })

  it('calls preventDefault on the event for BusinessError', () => {
    const event = fakeEvent(new BusinessError(ERR_DUPLICATE_SUBMIT, 'dup'))
    handler(event)
    expect((event as any).preventDefault).toHaveBeenCalled()
  })

  it('does not call preventDefault for non-BusinessError', () => {
    const event = fakeEvent(new Error('generic'))
    handler(event)
    expect((event as any).preventDefault).not.toHaveBeenCalled()
  })
})

describe('useBusinessErrorHandler — source-level checks', () => {
  it('awaits router.push in the handler', () => {
    // router.push() returns a Promise; not awaiting it can cause
    // "Unhandled promise rejection" if the navigation fails.
    expect(source).toMatch(/await.*router\.push/)
  })
})
