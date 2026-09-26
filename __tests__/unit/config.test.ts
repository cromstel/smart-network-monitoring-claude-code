import { getConfig, resetConfigForTests } from '@/lib/config'

const saved = { ...process.env }
afterEach(() => {
  process.env = { ...saved }
  resetConfigForTests()
})

it('fails fast with a message naming the bad variable', () => {
  process.env.ENCRYPTION_KEY = 'short'
  resetConfigForTests()
  expect(() => getConfig()).toThrow(/ENCRYPTION_KEY: must be 64 hex characters/)
})

it('rejects a scan interval outside 30s–1h and a malformed subnet', () => {
  process.env.SCAN_INTERVAL_SECONDS = '5'
  process.env.NETWORK_SUBNET = '192.168.1.0'
  resetConfigForTests()
  expect(() => getConfig()).toThrow(/SCAN_INTERVAL_SECONDS[\s\S]*NETWORK_SUBNET|NETWORK_SUBNET[\s\S]*SCAN_INTERVAL_SECONDS/)
})

it('parses defaults and booleans', () => {
  process.env.AUTO_MIGRATE = 'false'
  resetConfigForTests()
  const cfg = getConfig()
  expect(cfg.AUTO_MIGRATE).toBe(false)
  expect(cfg.SCANNER_MODE).toBe('simulated')
  expect(getConfig()).toBe(cfg) // validated once
})
