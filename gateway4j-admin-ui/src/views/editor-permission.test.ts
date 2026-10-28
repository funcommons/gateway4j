import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const routeEditor = fs.readFileSync(path.resolve(__dirname, 'routes/Editor.vue'), 'utf-8')
const routeCanvas = fs.readFileSync(path.resolve(__dirname, 'routes/Canvas.vue'), 'utf-8')
const pluginEditor = fs.readFileSync(path.resolve(__dirname, 'plugins/Editor.vue'), 'utf-8')

describe('Editor views — permission guards', () => {
  describe('routes/Editor.vue', () => {
    it('imports usePermission from composables', () => {
      expect(routeEditor).toMatch(/import.*usePermission.*from.*@\/composables/)
    })

    it('save button is guarded by canEdit("route")', () => {
      const saveBtn = routeEditor.match(/FcButton[^>]*@click="save"[^>]*>/s)
      expect(saveBtn).toBeTruthy()
      const context = routeEditor.substring(Math.max(0, routeEditor.indexOf('@click="save"') - 200), routeEditor.indexOf('@click="save"') + 50)
      expect(context).toMatch(/canEdit\('route'\)/)
    })

    it('publish button is guarded by canEdit("route")', () => {
      const publishBtn = routeEditor.match(/FcButton[^>]*@click="publish"[^>]*>/s)
      expect(publishBtn).toBeTruthy()
      const context = routeEditor.substring(Math.max(0, routeEditor.indexOf('@click="publish"') - 200), routeEditor.indexOf('@click="publish"') + 50)
      expect(context).toMatch(/canEdit\('route'\)/)
    })

    it('offline button is guarded by canEdit("route")', () => {
      const offlineBtn = routeEditor.match(/FcButton[^>]*@click="offline"[^>]*>/s)
      expect(offlineBtn).toBeTruthy()
      const context = routeEditor.substring(Math.max(0, routeEditor.indexOf('@click="offline"') - 200), routeEditor.indexOf('@click="offline"') + 50)
      expect(context).toMatch(/canEdit\('route'\)/)
    })

    it('save() has function-level canEdit guard', () => {
      const fn = routeEditor.substring(routeEditor.indexOf('async function save'), routeEditor.indexOf('async function publish'))
      expect(fn).toMatch(/canEdit\('route'\)/)
    })
  })

  describe('routes/Canvas.vue', () => {
    it('imports usePermission from composables', () => {
      expect(routeCanvas).toMatch(/import.*usePermission.*from.*@\/composables/)
    })

    it('save button is guarded by canEdit("route")', () => {
      const saveBtn = routeCanvas.match(/FcButton[^>]*@click="save"[^>]*>/s)
      expect(saveBtn).toBeTruthy()
      const context = routeCanvas.substring(Math.max(0, routeCanvas.indexOf('@click="save"') - 200), routeCanvas.indexOf('@click="save"') + 50)
      expect(context).toMatch(/canEdit\('route'\)/)
    })

    it('save() has function-level canEdit guard', () => {
      const fn = routeCanvas.substring(routeCanvas.indexOf('async function save'), routeCanvas.indexOf('async function publish'))
      expect(fn).toMatch(/canEdit\('route'\)/)
    })
  })

  describe('plugins/Editor.vue', () => {
    it('imports usePermission from composables', () => {
      expect(pluginEditor).toMatch(/import.*usePermission.*from.*@\/composables/)
    })

    it('save button is guarded by canEdit("plugin")', () => {
      const saveBtn = pluginEditor.match(/FcButton[^>]*@click="save"[^>]*>/s)
      expect(saveBtn).toBeTruthy()
      const context = pluginEditor.substring(Math.max(0, pluginEditor.indexOf('@click="save"') - 200), pluginEditor.indexOf('@click="save"') + 50)
      expect(context).toMatch(/canEdit\('plugin'\)/)
    })

    it('save() has function-level canEdit guard', () => {
      const fn = pluginEditor.substring(pluginEditor.indexOf('async function save'), pluginEditor.indexOf('</script>'))
      expect(fn).toMatch(/canEdit\('plugin'\)/)
    })
  })
})
