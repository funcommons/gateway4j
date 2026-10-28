import { computed, type ComputedRef } from 'vue'
import type { Component } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  DataBoard, Guide, SetUp, Upload, User, Lock, Setting
} from '@element-plus/icons-vue'
import type { NavItem } from '@/components/sdk'
import { usePermission } from '@/composables/usePermission'

export const NAV_DEFAULT_OPENEDS: string[] = ['nav-route', 'nav-plugin']

export function useSidebarNavItems(): ComputedRef<NavItem[]> {
  const { t } = useI18n()
  const { hasPermission } = usePermission()

  return computed<NavItem[]>(() => [
    {
      index: '/dashboard',
      label: t('gateway.sidebar.dashboard'),
      icon: DataBoard as unknown as Component,
    },
    {
      type: 'group' as const,
      index: 'nav-route',
      label: t('gateway.sidebar.route'),
      icon: Guide as unknown as Component,
      children: [
        { index: '/routes', label: t('gateway.sidebar.routeList') },
        { index: '/import-export', label: t('gateway.sidebar.routeImport') },
      ],
    },
    {
      type: 'group' as const,
      index: 'nav-plugin',
      label: t('gateway.sidebar.plugin'),
      icon: SetUp as unknown as Component,
      children: [
        { index: '/plugins', label: t('gateway.sidebar.pluginList') },
        { index: '/plugins/builtin', label: t('gateway.sidebar.pluginBuiltin') },
        { index: '/plugins/global', label: t('gateway.sidebar.pluginGlobal') },
      ],
    },
    {
      index: '/users',
      label: t('gateway.sidebar.user'),
      icon: User as unknown as Component,
      visible: hasPermission('system:user'),
    },
    {
      index: '/roles',
      label: t('gateway.sidebar.rolePerm'),
      icon: Lock as unknown as Component,
      visible: hasPermission('system:role'),
    },
    {
      index: '/settings',
      label: t('gateway.sidebar.settings'),
      icon: Setting as unknown as Component,
      visible: hasPermission('system:edit'),
    },
  ])
}
