import { useAuthStore } from '@/store/auth'

export function usePermission() {
  const auth = useAuthStore()

  function hasPermission(code: string): boolean {
    return auth.permissions.some(p => p.permission_code === code)
  }

  function hasAnyPermission(...codes: string[]): boolean {
    return codes.some(c => hasPermission(c))
  }

  function canEdit(resource: string): boolean {
    return hasPermission(`${resource}:edit`)
  }

  return { hasPermission, hasAnyPermission, canEdit }
}
