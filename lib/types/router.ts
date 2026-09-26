export const ROUTER_TYPES = ['asus', 'tplink', 'netgear', 'generic'] as const
export type RouterType = (typeof ROUTER_TYPES)[number]

/** Router configuration as the app may see it. There is deliberately no password field. */
export interface RouterConfig {
  id: string
  routerType: RouterType
  routerName: string | null
  routerIp: string
  port: number
  username: string
  hasPassword: boolean
  macAddress: string | null
  modelNumber: string | null
  firmwareVersion: string | null
  isConnected: boolean
  lastCheckAt: Date | null
  lastSuccessAt: Date | null
  createdAt: Date
  updatedAt: Date
}

/** Only the router service ever holds this shape, and only at the moment of use. */
export interface RouterCredentials {
  routerType: RouterType
  routerIp: string
  port: number
  username: string
  password: string
}
