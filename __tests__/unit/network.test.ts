import { cidrHosts, intToIp, ipInCidr, ipToInt, isRandomizedMac, isUnicastMac, isValidCidr, isValidIpv4, normalizeMac, parseCidr } from '@/lib/utils/network'

describe('normalizeMac', () => {
  it.each([
    ['a4:83:e7:2c:11:09', 'A4:83:E7:2C:11:09'],
    ['A4-83-E7-2C-11-09', 'A4:83:E7:2C:11:09'],
    ['a4:83:e7:2c:11:9', 'A4:83:E7:2C:11:09'], // macOS drops leading zeros
    ['a483.e72c.1109', 'A4:83:E7:2C:11:09'],
    ['a483e72c1109', 'A4:83:E7:2C:11:09'],
  ])('%s -> %s', (input, out) => {
    expect(normalizeMac(input)).toBe(out)
  })
  it.each(['', 'zz:83:e7:2c:11:09', 'a4:83:e7:2c:11', 'a4:83:e7:2c:11:09:00'])('rejects %p', (input) => {
    expect(normalizeMac(input)).toBeNull()
  })
})

describe('unicast / randomised', () => {
  it('rejects broadcast, multicast and zero MACs', () => {
    expect(isUnicastMac('FF:FF:FF:FF:FF:FF')).toBe(false)
    expect(isUnicastMac('01:00:5E:00:00:FB')).toBe(false)
    expect(isUnicastMac('00:00:00:00:00:00')).toBe(false)
    expect(isUnicastMac('garbage')).toBe(false)
    expect(isUnicastMac('A4:83:E7:2C:11:09')).toBe(true)
  })
  it('detects locally administered (private) MACs', () => {
    expect(isRandomizedMac('DA:A1:19:5E:0C:83')).toBe(true)
    expect(isRandomizedMac('A4:83:E7:2C:11:09')).toBe(false)
    expect(isRandomizedMac('nope')).toBe(false)
  })
})

describe('IPv4 and CIDR', () => {
  it('validates addresses', () => {
    expect(isValidIpv4('192.168.1.1')).toBe(true)
    expect(isValidIpv4('256.1.1.1')).toBe(false)
    expect(isValidIpv4('1.2.3')).toBe(false)
  })
  it('round-trips integers', () => {
    expect(intToIp(ipToInt('10.20.30.40'))).toBe('10.20.30.40')
  })
  it.each([
    ['192.168.1.0/24', true],
    ['10.0.0.0/8', true],
    ['192.168.1.5/32', true],
    ['0.0.0.0/0', false], // too large to sweep
    ['192.168.1.0/33', false],
    ['192.168.1.0', false],
    ['hello/24', false],
  ])('isValidCidr(%s) = %s', (c, ok) => {
    expect(isValidCidr(c)).toBe(ok)
  })
  it('masks the network address', () => {
    expect(parseCidr('192.168.1.77/24')).toEqual({ network: ipToInt('192.168.1.0'), prefix: 24 })
  })
  it('checks membership', () => {
    expect(ipInCidr('192.168.1.42', '192.168.1.0/24')).toBe(true)
    expect(ipInCidr('192.168.2.42', '192.168.1.0/24')).toBe(false)
    expect(ipInCidr('bad', '192.168.1.0/24')).toBe(false)
    expect(ipInCidr('192.168.1.1', 'bad')).toBe(false)
  })
  it('enumerates usable hosts', () => {
    const hosts = cidrHosts('192.168.1.0/30')
    expect(hosts).toEqual(['192.168.1.1', '192.168.1.2'])
    expect(cidrHosts('192.168.1.0/24')).toHaveLength(254)
    expect(cidrHosts('10.0.0.0/8', 100)).toHaveLength(100)
    expect(cidrHosts('10.0.0.1/32')).toEqual(['10.0.0.1'])
    expect(cidrHosts('nope')).toEqual([])
  })
})
