import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const source = fs.readFileSync(path.resolve(__dirname, 'Canvas.vue'), 'utf-8')

describe('Canvas.vue — unsaved changes protection', () => {
  it('onUnmounted does NOT call doAutoSave (fire-and-forget is unsafe)', () => {
    // doAutoSave is async and onUnmounted is synchronous. A fire-and-forget
    // doAutoSave() in onUnmounted means the save promise may never resolve
    // before the component is destroyed — silently losing user data on failure.
    const onUnmountedCalls = source.match(/onUnmounted\(\(\)\s*=>\s*\{[\s\S]*?\}\)/g)
    expect(onUnmountedCalls).toBeTruthy()
    const body = onUnmountedCalls!.join('\n')
    expect(body).not.toMatch(/doAutoSave/)
  })

  it('onBeforeRouteLeave warns about unsaved changes', () => {
    expect(source).toMatch(/onBeforeRouteLeave/)
    const guardFn = source.match(/onBeforeRouteLeave\(\s*(?:async\s*)?\(\)\s*=>\s*\{[\s\S]*?\}\s*\)/)
    expect(guardFn).toBeTruthy()
    expect(guardFn![0]).toMatch(/dirty/)
  })
})
