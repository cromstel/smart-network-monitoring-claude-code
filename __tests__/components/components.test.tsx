/**
 * @jest-environment jsdom
 */
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LoginForm } from '@/components/auth/LoginForm'
import { DeviceIcon } from '@/components/devices/DeviceIcon'
import { EmptyState, ErrorState } from '@/components/ui/states'
import { StatusLabel } from '@/components/ui/status-dot'
import { Segmented } from '@/components/ui/segmented'
import { displayName } from '@/lib/utils/format'
import { buildDeviceDTO } from '../helpers/factories'

const replace = jest.fn()
const refresh = jest.fn()
let search = ''
/** jsdom has no fetch Response; the client only reads status/ok/json(). */
const fakeResponse = (body: unknown, status: number) => ({ ok: status < 400, status, json: async () => body })

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace, refresh, push: jest.fn() }),
  useSearchParams: () => new URLSearchParams(search),
}))

describe('LoginForm', () => {
  afterEach(() => {
    search = ''
  })

  it('signs in and follows a same-origin ?next=', async () => {
    search = 'next=/devices'
    global.fetch = jest.fn().mockResolvedValue(fakeResponse({ data: {} }, 200)) as jest.Mock
    render(<LoginForm />)
    await userEvent.type(screen.getByLabelText('Email'), 'admin@example.com')
    await userEvent.type(screen.getByLabelText('Password'), 'correct-horse')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/devices'))
  })

  it('refuses an off-site ?next= (open redirect)', async () => {
    search = 'next=//evil.example'
    global.fetch = jest.fn().mockResolvedValue(fakeResponse({ data: {} }, 200)) as jest.Mock
    render(<LoginForm />)
    await userEvent.type(screen.getByLabelText('Email'), 'a@b.c')
    await userEvent.type(screen.getByLabelText('Password'), 'x')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/'))
  })

  it('shows the server message on failure', async () => {
    global.fetch = jest.fn().mockResolvedValue(fakeResponse({ error: 'UNAUTHENTICATED', message: 'Invalid email or password.' }, 401)) as jest.Mock
    render(<LoginForm />)
    await userEvent.type(screen.getByLabelText('Email'), 'a@b.c')
    await userEvent.type(screen.getByLabelText('Password'), 'x')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password.')
  })
})

describe('presentational components', () => {
  it('shows the MAC address when no name or hostname is set', () => {
    const d = buildDeviceDTO({ deviceName: null, hostname: null, macAddress: 'A4:83:E7:2C:11:09' })
    render(<p>{displayName(d)}</p>)
    expect(screen.getByText('A4:83:E7:2C:11:09')).toBeInTheDocument()
  })

  it('status label names the state in text, not only colour', () => {
    render(<StatusLabel status="idle" />)
    expect(screen.getByText('idle')).toBeInTheDocument()
  })

  it('error state offers a retry', async () => {
    const retry = jest.fn()
    render(<ErrorState error={new Error('Request failed (500)')} onRetry={retry} />)
    expect(screen.getByRole('alert')).toHaveTextContent('Request failed (500)')
    await userEvent.click(screen.getByRole('button', { name: /retry/i }))
    expect(retry).toHaveBeenCalled()
  })

  it('empty state explains what would fill it', () => {
    render(<EmptyState title="No devices discovered yet">The first scan runs at startup.</EmptyState>)
    expect(screen.getByText('No devices discovered yet')).toBeInTheDocument()
    expect(screen.getByText('The first scan runs at startup.')).toBeInTheDocument()
  })

  it('segmented control is a keyboard-reachable radiogroup', async () => {
    const onChange = jest.fn()
    render(<Segmented label="Time range" value="24h" options={['1h', '24h', '7d'] as const} onChange={onChange} />)
    expect(screen.getByRole('radio', { name: '24h' })).toHaveAttribute('aria-checked', 'true')
    await userEvent.click(screen.getByRole('radio', { name: '7d' }))
    expect(onChange).toHaveBeenCalledWith('7d')
  })

  it('flags unknown devices visually', () => {
    const { container } = render(<DeviceIcon type="phone" unknown />)
    expect(container.firstChild).toHaveClass('text-warning')
  })
})
