/** Query key factories. The SSE hook invalidates through these — never by string guessing. */
export interface DeviceFilters {
  status?: string
  type?: string
  search?: string
  sort?: string
  order?: string
  page?: number
  pageSize?: number
}

export const deviceKeys = {
  all: ['devices'] as const,
  list: (f: DeviceFilters) => [...deviceKeys.all, 'list', f] as const,
  detail: (id: string) => [...deviceKeys.all, 'detail', id] as const,
  bandwidth: (id: string, range: string) => [...deviceKeys.all, 'bandwidth', id, range] as const,
}

export const bandwidthKeys = {
  all: ['bandwidth'] as const,
  current: () => [...bandwidthKeys.all, 'current'] as const,
  history: (range: string) => [...bandwidthKeys.all, 'history', range] as const,
  top: (range: string, limit: number) => [...bandwidthKeys.all, 'top', range, limit] as const,
}

export const notificationKeys = {
  all: ['notifications'] as const,
  list: (f: Record<string, unknown>) => [...notificationKeys.all, 'list', f] as const,
}

export const alertKeys = { all: ['alerts'] as const }
export const settingsKeys = { all: ['settings'] as const }
export const routerKeys = { all: ['router'] as const, config: () => ['router', 'config'] as const, status: () => ['router', 'status'] as const }
export const userKeys = { all: ['users'] as const, me: ['me'] as const }
export const categoryKeys = { all: ['categories'] as const }
export const healthKeys = { all: ['health'] as const }
