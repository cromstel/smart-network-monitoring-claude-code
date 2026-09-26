import { hasNetRaw, parseArpScan, parseNeighbourTable } from '@/lib/services/scanners/arpScanner'
import { SimulatedScanner } from '@/lib/services/scanners/simulatedScanner'
import { SIMULATED_ROSTER, isPresent, mulberry32, sampleRate } from '@/lib/services/scanners/simulatedRoster'
import { fallbackOrder } from '@/lib/services/scanners/registry'
import { inferDeviceType } from '@/lib/utils/deviceType'

describe('ARP output parsing', () => {
  it('parses arp-scan --plain', () => {
    expect(parseArpScan('192.168.1.1\t04:d9:f5:aa:bb:cc\tASUSTek\n192.168.1.42\ta4:83:e7:2c:11:09\tApple\n\n')).toEqual([
      { ip: '192.168.1.1', mac: '04:D9:F5:AA:BB:CC' },
      { ip: '192.168.1.42', mac: 'A4:83:E7:2C:11:09' },
    ])
  })
  it('parses Linux ip neigh and skips FAILED entries', () => {
    const out = '192.168.1.1 dev eth0 lladdr 04:d9:f5:aa:bb:cc REACHABLE\n192.168.1.9 dev eth0  FAILED\n'
    expect(parseNeighbourTable(out)).toEqual([{ ip: '192.168.1.1', mac: '04:D9:F5:AA:BB:CC' }])
  })
  it('parses Windows arp -a', () => {
    const out = 'Interface: 192.168.1.5 --- 0x7\n  Internet Address      Physical Address      Type\n  192.168.1.1           04-d9-f5-aa-bb-cc     dynamic\n'
    expect(parseNeighbourTable(out)).toEqual([{ ip: '192.168.1.1', mac: '04:D9:F5:AA:BB:CC' }])
  })
  it('parses macOS arp -a with dropped leading zeros', () => {
    const out = '? (192.168.1.42) at a4:83:e7:2c:11:9 on en0 ifscope [ethernet]\n? (192.168.1.8) at (incomplete) on en0\n'
    expect(parseNeighbourTable(out)).toEqual([{ ip: '192.168.1.42', mac: 'A4:83:E7:2C:11:09' }])
  })
})

describe('CAP_NET_RAW probe (AUDIT A-16)', () => {
  it('accepts root', () => expect(hasNetRaw(null, 0)).toBe(true))
  it('reads bit 13 of CapEff', () => {
    expect(hasNetRaw('Name:\tnode\nCapEff:\t0000000000002000\n', 1000)).toBe(true)
    expect(hasNetRaw('CapEff:\t00000000a80425fb\n', 1000)).toBe(true)
    expect(hasNetRaw('CapEff:\t0000000000000000\n', 1000)).toBe(false)
    expect(hasNetRaw(null, 1000)).toBe(false)
  })
})

describe('fallback chain (PRD F-07)', () => {
  it('tries the preferred scanner, then asus, arp, simulated — each once', () => {
    expect(fallbackOrder('arp')).toEqual(['arp', 'asus', 'simulated'])
    expect(fallbackOrder('asus')).toEqual(['asus', 'arp', 'simulated'])
    expect(fallbackOrder('simulated')).toEqual(['simulated', 'asus', 'arp'])
  })
})

describe('simulated scanner', () => {
  it('reports present roster devices with growing cumulative counters', async () => {
    let now = new Date('2026-09-24T20:00:00Z')
    const scanner = new SimulatedScanner(SIMULATED_ROSTER, mulberry32(1), () => now)
    expect(await scanner.isAvailable()).toBe(true)
    const first = await scanner.scan('10.0.0.0/24')
    expect(first.length).toBeGreaterThan(8)
    expect(first.every((d) => d.ipAddress.startsWith('10.0.0.'))).toBe(true)
    now = new Date(now.getTime() + 30_000)
    const second = await scanner.scan('10.0.0.0/24')
    const laptop1 = first.find((d) => d.hostname === 'work-laptop')
    const laptop2 = second.find((d) => d.hostname === 'work-laptop')
    expect(BigInt(laptop2?.downloadBytes ?? '0')).toBeGreaterThan(BigInt(laptop1?.downloadBytes ?? '0'))
  })
  it('periodic devices come and go', () => {
    const guest = SIMULATED_ROSTER.find((d) => d.presence.kind === 'periodic')
    if (!guest) throw new Error('roster has no periodic device')
    const base = Date.UTC(2026, 8, 24, 0, 0)
    const states = new Set(Array.from({ length: 90 }, (_, m) => isPresent(guest, new Date(base + m * 60_000))))
    expect(states).toEqual(new Set([true, false]))
  })
  it('rates are non-negative', () => {
    const rand = mulberry32(7)
    for (const d of SIMULATED_ROSTER) {
      const r = sampleRate(d, new Date('2026-09-24T20:00:00Z'), rand)
      expect(r.downMbps).toBeGreaterThanOrEqual(0)
      expect(r.upMbps).toBeGreaterThanOrEqual(0)
    }
  })
})

describe('device type inference', () => {
  it.each([
    ['anas-iphone', null, 'phone'],
    ['Living-Room-TV', null, 'tv'],
    [null, 'Espressif Inc.', 'iot'],
    [null, 'Raspberry Pi Trading Ltd', 'server'],
    ['PS5', 'Sony Interactive Entertainment Inc.', 'console'],
    [null, null, 'unknown'],
  ])('%s / %s -> %s', (host, vendor, type) => {
    expect(inferDeviceType(host, vendor)).toBe(type)
  })
})
