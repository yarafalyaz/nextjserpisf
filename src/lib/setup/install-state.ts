import { basePrisma } from "@/lib/db/prisma"

/**
 * Whether the application has been installed yet (first-run detection).
 *
 * "Installed" means at least one user exists. A brand-new database — or one
 * whose schema has not been pushed yet — counts as NOT installed, which routes
 * the visitor to the setup wizard instead of an unusable login screen.
 *
 * `basePrisma` is used because this runs before any session/soft-delete
 * concerns exist.
 */
export async function isInstalled(): Promise<boolean> {
  try {
    const count = await basePrisma.user.count()
    return count > 0
  } catch {
    // Table missing / DB unreachable → treat as not installed.
    return false
  }
}
