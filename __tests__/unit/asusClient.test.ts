import { AsusClient, RouterHttpError } from '@/lib/services/router/asusClient'
import { AsusScanner } from '@/lib/services/scanners/asusScanner'

const creds = { routerType: 'asus' as const, routerIp: '192.168.1.1', port: 80, username: 'admin', password: 'pw' }

function fakeFetch(routes: Record<string, unknown>) {
  const calls: { url: string; init: RequestInit }[] = []
  const impl = async (url: string, init: RequestInit) => {
    calls.push({ url, init })
    const path = new URL(url).pathname
    const body = routes[path]
    if (body instanceof Error) throw body
    return { text: async () => (typeof body === 'string' ? body : JSON.stringify(body)) } as Response
  }
  return { impl, calls }
}

it('logs in with base64 credentials and sends the token cookie on hooks', async () => {
  const f = fakeFetch({
    '/login.cgi': { asus_token: 'tok123' },
    '/appGet.cgi': { productid: 'RT-AX88U', firmver: '3.0.0.4', buildno: '388_24198', lan_hwaddr: '04:d9:f5:aa:bb:cc' },
  })
  const client = new AsusClient(creds, f.impl)
  const info = await client.getInfo()
  expect(info).toEqual({ modelNumber: 'RT-AX88U', firmwareVersion: '3.0.0.4.388_24198', macAddress: '04:D9:F5:AA:BB:CC' })
  expect(String(f.calls[0]?.init.body)).toContain(encodeURIComponent(Buffer.from('admin:pw').toString('base64')))
  expect((f.calls[1]?.init.headers as Record<string, string>).Cookie).toBe('asus_token=tok123')
  expect(f.calls[0]?.url).toBe('http://192.168.1.1/login.cgi')
})

it('parses the client list: nickname over name, RSSI, online flag', async () => {
  const f = fakeFetch({
    '/login.cgi': { asus_token: 't' },
    '/appGet.cgi': {
      get_clientlist: {
        maclist: ['A4:83:E7:2C:11:09'],
        'a4:83:e7:2c:11:09': { ip: '192.168.1.42', name: 'iPhone', nickName: "Ana's phone", rssi: '-52', isOnline: '1' },
        'DC:A6:32:0F:44:E1': { ip: '192.168.1.2', name: 'pihole', nickName: '', rssi: '0', isOnline: '0' },
        'bad-mac': { ip: '192.168.1.3' },
      },
    },
  })
  const clients = await new AsusClient(creds, f.impl).getClients()
  expect(clients).toEqual([
    { mac: 'A4:83:E7:2C:11:09', ip: '192.168.1.42', name: "Ana's phone", rssi: -52, online: true },
    { mac: 'DC:A6:32:0F:44:E1', ip: '192.168.1.2', name: 'pihole', rssi: null, online: false },
  ])
})

it('classifies failures: bad credentials, garbage, unreachable (retried once)', async () => {
  await expect(new AsusClient(creds, fakeFetch({ '/login.cgi': { error_status: '3' } }).impl).login()).rejects.toMatchObject({ kind: 'auth' })
  await expect(new AsusClient(creds, fakeFetch({ '/login.cgi': '<html>' }).impl).login()).rejects.toMatchObject({ kind: 'protocol' })
  const down = fakeFetch({ '/login.cgi': new Error('ECONNREFUSED') })
  const err = await new AsusClient(creds, down.impl).login().catch((e: unknown) => e)
  expect(err).toBeInstanceOf(RouterHttpError)
  expect(err).toMatchObject({ kind: 'unreachable' })
  expect(down.calls).toHaveLength(2)
})

it('uses https for 443 and keeps non-default ports', async () => {
  const f = fakeFetch({ '/login.cgi': { asus_token: 't' } })
  await new AsusClient({ ...creds, port: 443 }, f.impl).login()
  expect(f.calls[0]?.url).toBe('https://192.168.1.1:443/login.cgi')
})

describe('AsusScanner', () => {
  it('is unavailable without a router, or for a router type with no client', async () => {
    const none = new AsusScanner(async () => null)
    expect(await none.isAvailable()).toBe(false)
    expect(none.unavailableReason()).toMatch(/no router/)
    const tp = new AsusScanner(async () => ({ ...creds, routerType: 'tplink' }))
    expect(await tp.isAvailable()).toBe(false)
    expect(tp.unavailableReason()).toMatch(/tplink/)
    await expect(none.scan()).rejects.toThrow('no router')
  })
})
