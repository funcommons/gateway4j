import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

describe('Permission guards — function-level defense-in-depth', () => {
  const routeList = fs.readFileSync(path.resolve(__dirname, 'routes/List.vue'), 'utf-8')
  const pluginList = fs.readFileSync(path.resolve(__dirname, 'plugins/List.vue'), 'utf-8')
  const globalPlugins = fs.readFileSync(path.resolve(__dirname, 'plugins/Global.vue'), 'utf-8')
  const userList = fs.readFileSync(path.resolve(__dirname, 'users/List.vue'), 'utf-8')

  describe('routes/List.vue', () => {
    it('publish() checks canEdit("route") before API call', () => {
      const fn = routeList.substring(routeList.indexOf('async function publish'), routeList.indexOf('async function offline'))
      expect(fn).toMatch(/canEdit\('route'\)/)
    })

    it('offline() checks canEdit("route") before API call', () => {
      const fn = routeList.substring(routeList.indexOf('async function offline'), routeList.indexOf('async function del'))
      expect(fn).toMatch(/canEdit\('route'\)/)
    })

    it('del() checks canEdit("route") before API call', () => {
      const fn = routeList.substring(routeList.indexOf('async function del'), routeList.indexOf('async function onNav'))
      expect(fn).toMatch(/canEdit\('route'\)/)
    })
  })

  describe('plugins/List.vue', () => {
    it('enable() checks canEdit("plugin") before API call', () => {
      const fn = pluginList.substring(pluginList.indexOf('async function enable'), pluginList.indexOf('async function disable'))
      expect(fn).toMatch(/canEdit\('plugin'\)/)
    })

    it('disable() checks canEdit("plugin") before API call', () => {
      const fn = pluginList.substring(pluginList.indexOf('async function disable'), pluginList.indexOf('async function del'))
      expect(fn).toMatch(/canEdit\('plugin'\)/)
    })

    it('del() checks canEdit("plugin") before API call', () => {
      const fn = pluginList.substring(pluginList.indexOf('async function del'), pluginList.indexOf('async function onEdit'))
      expect(fn).toMatch(/canEdit\('plugin'\)/)
    })

    it('onEdit() checks canEdit("plugin") before navigation', () => {
      const fn = pluginList.substring(pluginList.indexOf('async function onEdit'), pluginList.indexOf('</script>'))
      expect(fn).toMatch(/canEdit\('plugin'\)/)
    })
  })

  describe('plugins/Global.vue', () => {
    it('togglePlugin() checks hasPermission("plugin:global") before API call', () => {
      const fn = globalPlugins.substring(globalPlugins.indexOf('async function togglePlugin'), globalPlugins.indexOf('async function saveSort'))
      expect(fn).toMatch(/hasPermission\('plugin:global'\)/)
    })

    it('saveSort() checks hasPermission("plugin:global") before API call', () => {
      const fn = globalPlugins.substring(globalPlugins.indexOf('async function saveSort'), globalPlugins.indexOf('function onDragStart'))
      expect(fn).toMatch(/hasPermission\('plugin:global'\)/)
    })
  })

  describe('users/List.vue', () => {
    it('save() checks canEdit("user") before API call', () => {
      const fn = userList.substring(userList.indexOf('async function save'), userList.indexOf('async function toggleStatus'))
      expect(fn).toMatch(/canEdit\('user'\)/)
    })

    it('toggleStatus() checks canEdit("user") before API call', () => {
      const fn = userList.substring(userList.indexOf('async function toggleStatus'), userList.indexOf('async function del'))
      expect(fn).toMatch(/canEdit\('user'\)/)
    })

    it('del() checks canEdit("user") before API call', () => {
      const fn = userList.substring(userList.indexOf('async function del'), userList.indexOf('function openReset'))
      expect(fn).toMatch(/canEdit\('user'\)/)
    })

    it('doReset() checks canEdit("user") before API call', () => {
      const fn = userList.substring(userList.indexOf('async function doReset'), userList.indexOf('</script>'))
      expect(fn).toMatch(/canEdit\('user'\)/)
    })
  })
})
