export * from './useBodyScrollLock'
export * from './useLocalStorage'
export * from './useOneShotHandoff'
export * from './useSidebarNavItems'
export * from './useTempBox'
export * from './useToggle'
export * from './useOutsideClickClose'

// SDK composables (真相源在 @/components/sdk, 此处转发以便老代码继续 from '@/composables')
// 业务侧新代码请直接:  import { useResponsive, useEventListener, ... } from '@/components/sdk'
export { useResponsive, watchViewport, BREAKPOINTS, type Viewport } from '@/components/sdk'
export { useEventListener } from '@/components/sdk'
