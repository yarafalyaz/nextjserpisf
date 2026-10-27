import { prisma } from "@/lib/db/prisma"

/** Pelaku penugasan: peran + izin efektif dari sesi (`requirePermission`). */
export type GrantActor = { roles: string[]; permissions: string[] }

type GrantDb = {
  role: Pick<typeof prisma.role, "findMany">
  permission: Pick<typeof prisma.permission, "findMany">
}

function permissionName(permission: unknown): string | null {
  if (typeof permission === "string") return permission
  if (permission && typeof permission === "object" && "name" in permission) {
    const name = (permission as { name: unknown }).name
    return typeof name === "string" ? name : null
  }
  return null
}

// Least-privilege guard for granting bare permissions (role create/edit):
// a non-super-admin must not attach a permission they don't already hold.
// Without this, a manage_roles holder could mint/modify a role carrying
// manage_users / approve_workflows / etc. and escalate beyond their own
// permission set (a privesc that bypasses the super_admin-name check,
// since the role need not be named super_admin). super_admin bypasses.
// Returns an error message when disallowed, otherwise null.
export async function assertCanGrantPermissions(
  actor: GrantActor,
  permissionIds: number[],
  db: GrantDb = prisma,
): Promise<string | null> {
  if (actor.roles.includes("super_admin")) return null
  if (permissionIds.length === 0) return null
  const requested = await db.permission.findMany({
    where: { id: { in: permissionIds } },
    select: { name: true },
  })
  const held = new Set(actor.permissions ?? [])
  const missing = requested.filter((p) => !held.has(p.name)).map((p) => p.name)
  if (missing.length > 0) {
    return `Anda tidak dapat memberikan izin yang tidak Anda miliki: ${missing.join(", ")}`
  }
  return null
}

// Least-privilege guard for assigning whole roles to a user: a
// non-super-admin must not assign any role whose permission set is not a
// subset of their own. Blocking only the literal `super_admin` name left
// `admin` (nearly the full catalog) assignable by a delegated manage_users
// holder. The literal super_admin block stays as an extra layer: that role
// is never assignable by a non-super-admin, even if its permissions happen
// to be a subset. super_admin bypasses. Returns an error message when
// disallowed, otherwise null.
export async function assertCanGrantRoles(
  actor: GrantActor,
  roleIds: number[],
  db: GrantDb = prisma,
): Promise<string | null> {
  if (actor.roles.includes("super_admin")) return null
  if (roleIds.length === 0) return null
  const requested = await db.role.findMany({
    where: { id: { in: roleIds } },
    select: { name: true, permissions: { select: { name: true } } },
  })
  if (requested.some((r) => r.name === "super_admin")) {
    return "Hanya super admin yang dapat memberikan role super admin"
  }
  const held = new Set(actor.permissions ?? [])
  const missing: string[] = []
  const seen = new Set<string>()
  for (const role of requested) {
    const permissions = (role as { permissions?: unknown[] }).permissions ?? []
    for (const permission of permissions) {
      const name = permissionName(permission)
      if (name && !held.has(name) && !seen.has(name)) {
        seen.add(name)
        missing.push(name)
      }
    }
  }
  if (missing.length > 0) {
    return `Anda tidak dapat memberikan izin yang tidak Anda miliki: ${missing.join(", ")}`
  }
  return null
}
