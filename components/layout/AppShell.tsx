'use client'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import * as Dropdown from '@radix-ui/react-dropdown-menu'
import { Bell, Gauge, LogOut, Menu, Moon, Router as RouterIcon, Settings, ShieldAlert, Sun, Users, X, MonitorSmartphone } from 'lucide-react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState } from 'react'
import { apiFetch } from '@/lib/hooks/api'
import { useHealth, useNotifications } from '@/lib/hooks/queries'
import { useEventStream, type StreamState } from '@/lib/hooks/useEventStream'
import type { Role } from '@/lib/types'
import { cn } from '@/lib/utils/cn'
import { useCurrentUser } from './SessionContext'
import { useToast } from './Toasts'
import { useTheme } from './useTheme'

const NAV: { href: string; label: string; icon: typeof Gauge; roles?: Role[] }[] = [
  { href: '/', label: 'Overview', icon: Gauge },
  { href: '/devices', label: 'Devices', icon: MonitorSmartphone },
  { href: '/alerts', label: 'Alerts', icon: ShieldAlert },
  { href: '/router', label: 'Router', icon: RouterIcon },
  { href: '/users', label: 'Users', icon: Users, roles: ['ADMIN'] },
  { href: '/settings', label: 'Settings', icon: Settings },
]

function isActive(pathname: string, href: string) {
  return href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`)
}

function Brand() {
  return (
    <Link href="/" className="flex items-center gap-3 px-2">
      <span className="relative grid size-9 place-items-center overflow-hidden rounded-md border border-accent/40 bg-accent/5">
        <span className="absolute inset-0 origin-center animate-sweep bg-[conic-gradient(from_0deg,transparent_0deg,rgb(var(--accent)/0.45)_40deg,transparent_60deg)]" />
        <span className="absolute size-5 rounded-full border border-accent/40" />
        <span className="relative size-1.5 rounded-full bg-accent shadow-[0_0_8px_rgb(var(--accent))]" />
      </span>
      <span className="leading-tight">
        <span className="block font-display text-[15px] font-bold uppercase tracking-[0.12em]">NetWatch</span>
        <span className="block font-mono text-[10px] uppercase tracking-[0.2em] text-muted">home network</span>
      </span>
    </Link>
  )
}

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname()
  const user = useCurrentUser()
  return (
    <nav className="flex flex-col gap-0.5" aria-label="Main">
      {NAV.filter((n) => !n.roles || n.roles.includes(user.role)).map(({ href, label, icon: Icon }) => {
        const active = isActive(pathname, href)
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'group relative flex items-center gap-3 rounded px-3 py-2 text-sm transition-colors',
              active ? 'bg-accent/10 text-fg' : 'text-muted hover:bg-surface-2 hover:text-fg',
            )}
          >
            <span className={cn('absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full transition-colors', active ? 'bg-accent shadow-[0_0_8px_rgb(var(--accent))]' : 'bg-transparent')} />
            <Icon className={cn('size-4', active ? 'text-accent' : 'text-muted group-hover:text-fg')} />
            <span className="font-display font-medium tracking-wide">{label}</span>
          </Link>
        )
      })}
    </nav>
  )
}

function StreamIndicator({ state }: { state: StreamState }) {
  const health = useHealth()
  const mode = health.data?.scanner.mode
  return (
    <div className="hidden items-center gap-3 rounded border border-border bg-bg/50 px-3 py-1.5 sm:flex" title={state === 'live' ? 'Receiving live updates' : 'Reconnecting to live updates'}>
      <span className="relative flex size-2">
        {state === 'live' ? <span className="absolute inset-0 animate-pulse-ring rounded-full bg-accent" /> : null}
        <span className={cn('relative size-2 rounded-full', state === 'live' ? 'bg-accent' : 'bg-warning')} />
      </span>
      <span className="font-mono text-[11px] uppercase tracking-widest text-muted">
        {state === 'live' ? 'live' : state === 'connecting' ? 'connecting' : 'reconnecting'}
        {mode ? <span className="text-fg/70"> · {mode}</span> : null}
      </span>
    </div>
  )
}

function Bellbutton() {
  const unread = useNotifications({ isRead: false, pageSize: 1 })
  const count = unread.data?.unreadCount ?? 0
  return (
    <Link href="/alerts" className="relative grid size-9 place-items-center rounded text-muted hover:bg-surface-2 hover:text-fg" aria-label={`Notifications, ${count} unread`}>
      <Bell className="size-4" />
      {count > 0 ? (
        <span className="absolute -right-0.5 -top-0.5 min-w-[18px] rounded-full bg-warning px-1 text-center font-mono text-[10px] font-semibold leading-[18px] text-bg">{count > 99 ? '99+' : count}</span>
      ) : null}
    </Link>
  )
}

function UserMenu() {
  const user = useCurrentUser()
  const router = useRouter()
  const { theme, setTheme } = useTheme()
  const signOut = async () => {
    await apiFetch('/api/auth/logout', { method: 'POST' }).catch(() => undefined)
    router.replace('/login')
    router.refresh()
  }
  return (
    <div className="flex items-center gap-1">
      <button
        onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        className="grid size-9 place-items-center rounded text-muted hover:bg-surface-2 hover:text-fg"
        aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
      >
        {theme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
      </button>
      <Dropdown.Root>
        <Dropdown.Trigger className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-surface-2" aria-label="Account menu">
          <span className="grid size-7 place-items-center rounded-sm border border-border bg-surface-2 font-display text-xs font-bold uppercase">{(user.name ?? user.email).slice(0, 1)}</span>
          <span className="hidden text-left md:block">
            <span className="block max-w-[140px] truncate text-xs font-medium">{user.name ?? user.email}</span>
            <span className="block font-mono text-[10px] uppercase tracking-wider text-muted">{user.role}</span>
          </span>
        </Dropdown.Trigger>
        <Dropdown.Portal>
          <Dropdown.Content align="end" sideOffset={6} className="panel z-50 min-w-[220px] bg-surface p-1 shadow-xl">
            <div className="px-3 py-2">
              <p className="truncate text-sm">{user.email}</p>
              <p className="font-mono text-[10px] uppercase tracking-wider text-muted">{user.role}</p>
            </div>
            <Dropdown.Separator className="my-1 h-px bg-border" />
            <Dropdown.Item asChild>
              <Link href="/settings" className="flex cursor-pointer items-center gap-2 rounded px-3 py-2 text-sm outline-none data-[highlighted]:bg-surface-2">
                <Settings className="size-4 text-muted" /> Settings
              </Link>
            </Dropdown.Item>
            <Dropdown.Item onSelect={() => void signOut()} className="flex cursor-pointer items-center gap-2 rounded px-3 py-2 text-sm text-danger outline-none data-[highlighted]:bg-danger/10">
              <LogOut className="size-4" /> Sign out
            </Dropdown.Item>
          </Dropdown.Content>
        </Dropdown.Portal>
      </Dropdown.Root>
    </div>
  )
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const stream = useEventStream((p) => toast({ tone: 'alert', title: p.title ?? 'New alert', body: 'Open Alerts for details.' }))

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[232px_1fr]">
      <aside className="sticky top-0 hidden h-dvh flex-col gap-6 border-r border-border bg-surface/70 px-3 py-5 backdrop-blur lg:flex">
        <Brand />
        <NavList />
        <div className="mt-auto rounded border border-dashed border-border px-3 py-2 font-mono text-[10px] uppercase leading-relaxed tracking-wider text-muted">
          self-hosted
          <br />
          no data leaves your lan
        </div>
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-40 flex h-14 items-center gap-2 border-b border-border bg-bg/80 px-3 backdrop-blur sm:px-5">
          <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
            <DialogPrimitive.Trigger className="grid size-9 place-items-center rounded text-muted hover:bg-surface-2 lg:hidden" aria-label="Open navigation">
              <Menu className="size-5" />
            </DialogPrimitive.Trigger>
            <DialogPrimitive.Portal>
              <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-bg/70 backdrop-blur-sm lg:hidden" />
              <DialogPrimitive.Content className="fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col gap-6 border-r border-border bg-surface px-3 py-5 lg:hidden">
                <DialogPrimitive.Title className="sr-only">Navigation</DialogPrimitive.Title>
                <DialogPrimitive.Description className="sr-only">Main navigation</DialogPrimitive.Description>
                <div className="flex items-center justify-between">
                  <Brand />
                  <DialogPrimitive.Close className="rounded p-1 text-muted hover:bg-surface-2" aria-label="Close navigation">
                    <X className="size-5" />
                  </DialogPrimitive.Close>
                </div>
                <NavList onNavigate={() => setOpen(false)} />
              </DialogPrimitive.Content>
            </DialogPrimitive.Portal>
          </DialogPrimitive.Root>
          <div className="lg:hidden">
            <span className="font-display text-sm font-bold uppercase tracking-[0.12em]">NetWatch</span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <StreamIndicator state={stream} />
            <Bellbutton />
            <UserMenu />
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1600px] flex-1 px-3 py-5 sm:px-5 lg:px-8 lg:py-7">{children}</main>
      </div>
    </div>
  )
}

export function PageHeader({ title, eyebrow, children }: { title: string; eyebrow?: string; children?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow ? <p className="label-caps mb-1 text-accent/90">{eyebrow}</p> : null}
        <h1 className="text-2xl font-bold sm:text-3xl">{title}</h1>
      </div>
      {children ? <div className="flex flex-wrap items-center gap-2">{children}</div> : null}
    </div>
  )
}
