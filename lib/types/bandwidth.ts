export interface BandwidthMetric {
  id: string
  deviceId: string
  timestamp: Date
  uploadSpeed: number // Mbps
  downloadSpeed: number // Mbps
  uploadTotal: string // bytes, cumulative — string: exceeds Number.MAX_SAFE_INTEGER
  downloadTotal: string
}

export interface BandwidthHourly {
  id: string
  deviceId: string
  hourStart: Date
  avgUploadSpeed: number
  avgDownloadSpeed: number
  peakUploadSpeed: number
  peakDownloadSpeed: number
  bytesUploaded: string
  bytesDownloaded: string
  sampleCount: number
}

export interface BandwidthPoint {
  timestamp: Date
  uploadMbps: number
  downloadMbps: number
  uploadBytes: string // bytes transferred during the interval ending at timestamp
  downloadBytes: string
}

export type BandwidthRange = '1h' | '24h' | '7d' | '30d'
export type BandwidthResolution = 'raw' | 'hourly'

export interface NetworkMetric {
  id: string
  timestamp: Date
  totalBandwidthUp: number
  totalBandwidthDown: number
  activeDevices: number
  onlineDevices: number
  peakBandwidthUp: number
  peakBandwidthDown: number
}

export interface ScanHistory {
  id: string
  scannerName: string
  scanDurationMs: number
  deviceCount: number
  successCount: number
  failureCount: number
  status: 'success' | 'partial' | 'failed'
  errorMessage: string | null
  createdAt: Date
}
