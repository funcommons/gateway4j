import { http } from './request'

const BASE_URL = '/api/v1/oem'

/** OEM 配置响应类型 */
export interface OemConfig {
  logoUrl?: string
  logoDarkUrl?: string
  companyName?: string
  title?: string
  subtitle?: string
  brand?: 'ldx2' | 'mchuan' | 'apple' | 'google' | 'manyun' | 'acme' | string
  theme?: 'light' | 'dark'
  primaryColor?: string
  successColor?: string
  warningColor?: string
  dangerColor?: string
  locale?: 'zh-CN' | 'en-US' | string
  faviconUrl?: string
  footerText?: string
  supportUrl?: string
  loginBgUrl?: string
}

/** 获取 OEM 配置 (公开接口, 无需登录)
 *
 * 后端会从 X-Forwarded-Host / Host / ?host= 三处取 host (带端口格式如 localhost:5174 也支持)
 */
export function getOemConfig(host?: string): Promise<OemConfig> {
  const params: Record<string, string> = {}
  if (host) params.host = host
  return http.get<OemConfig>(`${BASE_URL}/config`, { params })
}