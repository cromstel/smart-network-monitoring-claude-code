/**
 * Minimal AsusWRT HTTP client (PRD F-41): the same login.cgi / appGet.cgi endpoints the
 * official mobile app uses. Credentials are passed in at construction, held only for the
 * life of the call, and never logged (the logger redacts `password`).
 */
import type { RouterCredentials } from '@/lib/types'
import { normalizeMac } from '@/lib/utils/network'

const USER_AGENT = 'asusrouter-Android-DUTUtil-1.0.0.245'
const TIMEOUT_MS = 5000

export class RouterHttpError extends Error {
  constructor(
    message: string,
    readonly kind: 'unreachable' | 'auth' | 'protocol',
  ) {
    super(message)
    this.name = 'RouterHttpError'
  }
}

export interface AsusClientEntry {
  mac: string
  ip: string
  name: string | null
  rssi: number | null
  online: boolean
}

export interface RouterInfo {
  modelNumber: string | null
  firmwareVersion: string | null
  macAddress: string | null
}

type FetchLike = (input: string, init: RequestInit) => Promise<Response>

export class AsusClient {
  private token: string | null = null

  constructor(
    private readonly creds: RouterCredentials,
    private readonly fetchImpl: FetchLike = (i, init) => fetch(i, init),
  ) {}

  private url(path: string): string {
    const port = this.creds.port === 80 ? '' : `:${this.creds.port}`
    const scheme = this.creds.port === 443 || this.creds.port === 8443 ? 'https' : 'http'
    return `${scheme}://${this.creds.routerIp}${port}${path}`
  }

  private async post(path: string, body: string, attempt = 0): Promise<Response> {
    try {
      return await this.fetchImpl(this.url(path), {
        method: 'POST',
        headers: {
          'User-Agent': USER_AGENT,
          'Content-Type': 'application/x-www-form-urlencoded',
          ...(this.token ? { Cookie: `asus_token=${this.token}` } : {}),
        },
        body,
        signal: AbortSignal.timeout(TIMEOUT_MS),
        redirect: 'manual',
      })
    } catch (err) {
      if (attempt < 1) return this.post(path, body, attempt + 1)
      throw new RouterHttpError(err instanceof Error ? `router unreachable: ${err.message}` : 'router unreachable', 'unreachable')
    }
  }

  private async json(res: Response): Promise<Record<string, unknown>> {
    const text = await res.text()
    try {
      const parsed: unknown = JSON.parse(text)
      if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>
    } catch {
      // fall through
    }
    throw new RouterHttpError('router returned an unexpected response', 'protocol')
  }

  async login(): Promise<void> {
    const auth = Buffer.from(`${this.creds.username}:${this.creds.password}`).toString('base64')
    const res = await this.post('/login.cgi', `login_authorization=${encodeURIComponent(auth)}`)
    const body = await this.json(res)
    const token = body.asus_token
    if (typeof token !== 'string' || token.length === 0) {
      throw new RouterHttpError('router rejected the credentials', 'auth')
    }
    this.token = token
  }

  private async hook(hooks: string): Promise<Record<string, unknown>> {
    if (!this.token) await this.login()
    const res = await this.post('/appGet.cgi', `hook=${encodeURIComponent(hooks)}`)
    return this.json(res)
  }

  async getInfo(): Promise<RouterInfo> {
    const body = await this.hook('nvram_get(productid);nvram_get(firmver);nvram_get(buildno);nvram_get(lan_hwaddr)')
    const str = (k: string) => (typeof body[k] === 'string' && (body[k] as string).length > 0 ? (body[k] as string) : null)
    const firm = [str('firmver'), str('buildno')].filter(Boolean).join('.')
    const mac = str('lan_hwaddr')
    return { modelNumber: str('productid'), firmwareVersion: firm || null, macAddress: mac ? normalizeMac(mac) : null }
  }

  async getClients(): Promise<AsusClientEntry[]> {
    const body = await this.hook('get_clientlist()')
    const list = body.get_clientlist
    if (!list || typeof list !== 'object') throw new RouterHttpError('client list missing from router response', 'protocol')
    const out: AsusClientEntry[] = []
    for (const [key, value] of Object.entries(list as Record<string, unknown>)) {
      const mac = normalizeMac(key)
      if (!mac || !value || typeof value !== 'object') continue
      const v = value as Record<string, unknown>
      const ip = typeof v.ip === 'string' ? v.ip : ''
      if (!ip) continue
      const rssiRaw = Number(v.rssi)
      const nick = typeof v.nickName === 'string' && v.nickName.trim() ? v.nickName.trim() : null
      const name = typeof v.name === 'string' && v.name.trim() ? v.name.trim() : null
      out.push({
        mac,
        ip,
        name: nick ?? name,
        rssi: Number.isFinite(rssiRaw) && rssiRaw < 0 ? rssiRaw : null,
        online: v.isOnline === undefined ? true : String(v.isOnline) === '1',
      })
    }
    return out
  }
}
