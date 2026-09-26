export type ScannerName = 'simulated' | 'arp' | 'asus'

export interface DiscoveredDevice {
  macAddress: string // uppercase, colon-separated
  ipAddress: string
  hostname?: string
  signalStrength?: number
  /**
   * Cumulative byte counters from the device's perspective, as decimal strings.
   * Only scanners that can see traffic (simulated, router API with traffic stats) set these;
   * ARP cannot, and the dashboard says so rather than inventing numbers.
   */
  uploadBytes?: string
  downloadBytes?: string
}

export interface Scanner {
  readonly name: ScannerName
  isAvailable(): Promise<boolean>
  scan(subnet: string): Promise<DiscoveredDevice[]>
  /** Short human-readable reason after isAvailable() returned false. */
  unavailableReason?(): string | null
}
