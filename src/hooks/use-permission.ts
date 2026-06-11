"use client"

import { useSession } from "next-auth/react"

/**
 * Hook to check if the current user has a specific permission.
 * Reads from the JWT session — no extra DB call needed.
 * Returns true if the user is super_admin (bypass) or has the permission.
 */
export function usePermission(permission: string): boolean {
  const { data: session } = useSession()
  if (!session?.user) return false
  if (session.user.roles?.includes("super_admin")) return true
  return session.user.permissions?.includes(permission) ?? false
}

/**
 * Hook to check if the current user has ANY of the given permissions.
 */
export function useAnyPermission(permissions: string[]): boolean {
  const { data: session } = useSession()
  if (!session?.user) return false
  if (session.user.roles?.includes("super_admin")) return true
  return permissions.some((p) => session.user.permissions?.includes(p))
}

/**
 * Hook to check if the current user has a specific role.
 */
export function useRole(role: string): boolean {
  const { data: session } = useSession()
  if (!session?.user) return false
  return session.user.roles?.includes(role) ?? false
}
