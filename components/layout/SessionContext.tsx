'use client'
import { createContext, useContext } from 'react'
import type { Role, UserDTO } from '@/lib/types'

const SessionContext = createContext<UserDTO | null>(null)

export function SessionProvider({ user, children }: { user: UserDTO; children: React.ReactNode }) {
  return <SessionContext.Provider value={user}>{children}</SessionContext.Provider>
}

export function useCurrentUser(): UserDTO {
  const user = useContext(SessionContext)
  if (!user) throw new Error('useCurrentUser must be used inside the dashboard')
  return user
}

/** UI affordance only — every route re-checks the role server-side. */
export function useCan(roles: readonly Role[]): boolean {
  return roles.includes(useCurrentUser().role)
}
