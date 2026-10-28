// Feature flag configuration.
//
// Resolution order (first match wins):
//   1. URL query: ?feature=<key>&value=true|false   (debug override)
//   2. localStorage 'gw4j_features' JSON map
//   3. Default: true (features are opt-out, not opt-in)
//
// Examples:
//   localStorage.setItem('gw4j_features', JSON.stringify({ darkMode: false }))
//   location.search = '?feature=darkMode&value=true'   // URL wins

const STORAGE_KEY = 'gw4j_features'

function readUrlOverride(key: string): boolean | undefined {
  if (typeof window === 'undefined') return undefined
  const params = new URLSearchParams(window.location.search)
  const feature = params.get('feature')
  if (feature !== key) return undefined
  const value = params.get('value')
  if (value === 'true') return true
  if (value === 'false') return false
  return undefined
}

function readStorageMap(): Record<string, boolean> {
  if (typeof localStorage === 'undefined') return {}
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object') return parsed as Record<string, boolean>
  } catch {
    // fall through
  }
  return {}
}

export function isFeatureEnabled(name: string): boolean {
  const urlVal = readUrlOverride(name)
  if (urlVal !== undefined) return urlVal
  const map = readStorageMap()
  if (name in map) return map[name] === true
  return true
}

export const features = {
  isFeatureEnabled,
  all: readStorageMap
}

export default features