import { hasPermission } from "@/lib/auth/permissions"
import type { ReactNode } from "react"

/**
 * Renders children only if the current user has the given permission.
 * Super admin always passes.
 *
 * Usage:
 *   <CanCreate permission="create_items">
 *     <Link href="/master/barang/tambah">+ Tambah Barang</Link>
 *   </CanCreate>
 */
export async function CanCreate({
  permission,
  children,
}: {
  permission: string
  children: ReactNode
}) {
  if (await hasPermission(permission)) {
    return <>{children}</>
  }
  return null
}
