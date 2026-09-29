import { redirect } from "next/navigation";
import { auth } from "./auth";

/**
 * Require authenticated session. Redirects to /login if not signed in.
 */
export async function requireAuth() {
  const session = await auth();
  if (!session?.user || session.user.isActive === false) {
    redirect("/login");
  }
  return session.user;
}

/**
 * Require specific permission. Super admin bypasses all permission checks.
 * On miss, redirects to dashboard (/) instead of throwing — halaman forbidden
 * langsung dialihkan, tidak muncul "Terjadi Kesalahan".
 */
export async function requirePermission(permission: string) {
  const user = await requireAuth();

  // Super admin bypass
  if (user.roles.includes("super_admin")) return user;

  if (!user.permissions.includes(permission)) {
    redirect("/");
  }

  return user;
}

/**
 * Require specific role. Super admin bypasses all role checks.
 */
export async function requireRole(role: string) {
  const user = await requireAuth();

  if (!user.roles.includes(role) && !user.roles.includes("super_admin")) {
    redirect("/");
  }

  return user;
}

/**
 * Non-throwing permission check for API routes (which should return 403, not 500).
 * Returns false when unauthenticated or lacking the permission. Super admin bypasses.
 */
export async function hasPermission(permission: string): Promise<boolean> {
  const session = await auth();
  const user = session?.user;
  if (!user || user.isActive === false) return false;
  if (user.roles?.includes("super_admin")) return true;
  return user.permissions?.includes(permission) ?? false;
}
