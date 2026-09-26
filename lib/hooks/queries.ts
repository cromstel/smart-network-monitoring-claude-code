'use client'
/** Every server read in the UI goes through one of these hooks (AUDIT A-13). */
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  AlertRuleDTO,
  BandwidthSeriesDTO,
  CategoryDTO,
  CollectionResponse,
  CurrentBandwidthDTO,
  DeviceDTO,
  DeviceDetailDTO,
  HealthDTO,
  ItemResponse,
  NotificationDTO,
  RouterConfigDTO,
  RouterStatusDTO,
  ScanResultDTO,
  SettingsDTO,
  TopConsumerDTO,
  UserDTO,
} from '@/lib/types'
import { ApiError, apiFetch, qs } from './api'
import { alertKeys, bandwidthKeys, categoryKeys, deviceKeys, healthKeys, notificationKeys, routerKeys, settingsKeys, userKeys, type DeviceFilters } from './keys'

const LIVE = 5_000
const META = 5 * 60_000

// ---- devices --------------------------------------------------------------------------------

export function useDevices(filters: DeviceFilters) {
  return useQuery({
    queryKey: deviceKeys.list(filters),
    queryFn: () => apiFetch<CollectionResponse<DeviceDTO>>(`/api/devices${qs({ ...filters })}`),
    staleTime: LIVE,
    placeholderData: keepPreviousData,
  })
}

export function useDevice(id: string) {
  return useQuery({
    queryKey: deviceKeys.detail(id),
    queryFn: async () => (await apiFetch<ItemResponse<DeviceDetailDTO>>(`/api/devices/${id}`)).data,
    staleTime: LIVE,
  })
}

export function useDeviceBandwidth(id: string, range: string) {
  return useQuery({
    queryKey: deviceKeys.bandwidth(id, range),
    queryFn: async () => (await apiFetch<ItemResponse<BandwidthSeriesDTO>>(`/api/devices/${id}/bandwidth${qs({ range })}`)).data,
    staleTime: range === '1h' || range === '24h' ? LIVE : META,
    placeholderData: keepPreviousData,
  })
}

export function useUpdateDevice(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (patch: { deviceName?: string | null; deviceType?: string; categoryId?: string | null; isIgnored?: boolean }) =>
      apiFetch<ItemResponse<DeviceDTO>>(`/api/devices/${id}`, { method: 'PATCH', json: patch }),
    onSuccess: () => qc.invalidateQueries({ queryKey: deviceKeys.all }),
  })
}

export function useDeleteDevice() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/api/devices/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: deviceKeys.all })
      void qc.invalidateQueries({ queryKey: bandwidthKeys.all })
    },
  })
}

export function useScan() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => (await apiFetch<ItemResponse<ScanResultDTO>>('/api/devices/scan', { method: 'POST' })).data,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: deviceKeys.all })
      void qc.invalidateQueries({ queryKey: bandwidthKeys.all })
      void qc.invalidateQueries({ queryKey: healthKeys.all })
    },
  })
}

export function useCategories() {
  return useQuery({
    queryKey: categoryKeys.all,
    queryFn: async () => (await apiFetch<ItemResponse<CategoryDTO[]>>('/api/categories')).data,
    staleTime: META,
  })
}

// ---- bandwidth ------------------------------------------------------------------------------

export function useCurrentBandwidth() {
  return useQuery({
    queryKey: bandwidthKeys.current(),
    queryFn: async () => (await apiFetch<ItemResponse<CurrentBandwidthDTO>>('/api/bandwidth/current')).data,
    staleTime: LIVE,
    refetchInterval: 30_000, // safety net if the event stream drops
  })
}

export function useNetworkHistory(range: string) {
  return useQuery({
    queryKey: bandwidthKeys.history(range),
    queryFn: async () => (await apiFetch<ItemResponse<BandwidthSeriesDTO>>(`/api/bandwidth/history${qs({ range })}`)).data,
    staleTime: range === '1h' || range === '24h' ? LIVE : META,
    placeholderData: keepPreviousData,
  })
}

export function useTopConsumers(range: string, limit = 5) {
  return useQuery({
    queryKey: bandwidthKeys.top(range, limit),
    queryFn: async () => (await apiFetch<ItemResponse<TopConsumerDTO[]>>(`/api/bandwidth/top-consumers${qs({ range, limit })}`)).data,
    staleTime: 30_000,
  })
}

// ---- notifications & alerts -----------------------------------------------------------------

export interface NotificationPage extends CollectionResponse<NotificationDTO> {
  unreadCount: number
}

export function useNotifications(filters: { isRead?: boolean; type?: string; page?: number; pageSize?: number }) {
  return useQuery({
    queryKey: notificationKeys.list(filters),
    queryFn: () => apiFetch<NotificationPage>(`/api/notifications${qs(filters)}`),
    staleTime: LIVE,
    placeholderData: keepPreviousData,
  })
}

export function useMarkNotification() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, isRead }: { id: string; isRead: boolean }) => apiFetch(`/api/notifications/${id}`, { method: 'PATCH', json: { isRead } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: notificationKeys.all }),
  })
}

export function useMarkAllRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => apiFetch('/api/notifications/read-all', { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: notificationKeys.all }),
  })
}

export function useAlertRules() {
  return useQuery({
    queryKey: alertKeys.all,
    queryFn: async () => (await apiFetch<ItemResponse<AlertRuleDTO[]>>('/api/alerts')).data,
    staleTime: 30_000,
  })
}

export function useCreateAlertRule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { alertType: string; deviceId: string | null; threshold?: number | null; isActive?: boolean }) =>
      apiFetch<ItemResponse<AlertRuleDTO>>('/api/alerts', { method: 'POST', json: body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: alertKeys.all }),
  })
}

export function useUpdateAlertRule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...patch }: { id: string; isActive?: boolean; threshold?: number | null; deviceId?: string | null }) =>
      apiFetch<ItemResponse<AlertRuleDTO>>(`/api/alerts/${id}`, { method: 'PATCH', json: patch }),
    onSuccess: () => qc.invalidateQueries({ queryKey: alertKeys.all }),
  })
}

export function useDeleteAlertRule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiFetch(`/api/alerts/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: alertKeys.all }),
  })
}

// ---- settings, router, users ---------------------------------------------------------------

export function useSettings() {
  return useQuery({
    queryKey: settingsKeys.all,
    queryFn: async () => (await apiFetch<ItemResponse<SettingsDTO>>('/api/settings')).data,
    staleTime: META,
  })
}

export function useUpdateSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (patch: Partial<SettingsDTO>) => (await apiFetch<ItemResponse<SettingsDTO>>('/api/settings', { method: 'PATCH', json: patch })).data,
    onSuccess: (data) => qc.setQueryData(settingsKeys.all, data),
  })
}

export function useRouterConfig(enabled: boolean) {
  return useQuery({
    queryKey: routerKeys.config(),
    queryFn: async () => (await apiFetch<ItemResponse<RouterConfigDTO | null>>('/api/router/config')).data,
    enabled,
    staleTime: META,
  })
}

export function useRouterStatus() {
  return useQuery({
    queryKey: routerKeys.status(),
    queryFn: async (): Promise<RouterStatusDTO> => {
      try {
        return (await apiFetch<ItemResponse<RouterStatusDTO>>('/api/router/status')).data
      } catch (err) {
        // 503 carries the degraded status in details: show it rather than failing the panel.
        if (err instanceof ApiError && err.code === 'ROUTER_UNREACHABLE' && err.details) return err.details as RouterStatusDTO
        throw err
      }
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  })
}

export function useSaveRouterConfig() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => apiFetch<ItemResponse<RouterConfigDTO>>('/api/router/config', { method: 'PUT', json: body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: routerKeys.all }),
  })
}

export function useTestRouter() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (body: Record<string, unknown>) =>
      (await apiFetch<ItemResponse<{ reachable: boolean; modelNumber: string | null; firmwareVersion: string | null; message: string }>>('/api/router/test', { method: 'POST', json: body })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: routerKeys.all }),
  })
}

export function useUsers() {
  return useQuery({
    queryKey: userKeys.all,
    queryFn: async () => (await apiFetch<ItemResponse<UserDTO[]>>('/api/users')).data,
    staleTime: 30_000,
  })
}

export function useCreateUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { email: string; password: string; name?: string | null; role: string }) => apiFetch('/api/users', { method: 'POST', json: body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: userKeys.all }),
  })
}

export function useUpdateUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...patch }: { id: string; role?: string; isActive?: boolean; name?: string | null; password?: string }) =>
      apiFetch(`/api/users/${id}`, { method: 'PATCH', json: patch }),
    onSuccess: () => qc.invalidateQueries({ queryKey: userKeys.all }),
  })
}

export function useDeleteUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiFetch(`/api/users/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: userKeys.all }),
  })
}

export function useHealth() {
  return useQuery({
    queryKey: healthKeys.all,
    queryFn: () => apiFetch<HealthDTO>('/api/health'),
    staleTime: 15_000,
    refetchInterval: 30_000,
  })
}
