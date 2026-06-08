import { auth } from "./auth";

/**
 * Require authenticated session. Throws if no session exists.
 */
export async function requireAuth() {
  const session = await auth();
  if (!session?.user) {
    throw new Error("Unauthorized: Silakan login terlebih dahulu.");
  }
  return session.user;
}

/**
 * Require specific permission. Super admin bypasses all permission checks.
 */
export async function requirePermission(permission: string) {
  const user = await requireAuth();

  // Super admin bypass
  if (user.roles.includes("super_admin")) return user;

  if (!user.permissions.includes(permission)) {
    throw new Error(
      `Forbidden: Anda tidak memiliki izin '${permission}'.`
    );
  }

  return user;
}

/**
 * Require specific role. Super admin bypasses all role checks.
 */
export async function requireRole(role: string) {
  const user = await requireAuth();

  if (!user.roles.includes(role) && !user.roles.includes("super_admin")) {
    throw new Error(
      `Forbidden: Anda tidak memiliki role '${role}'.`
    );
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
  if (!user) return false;
  if (user.roles?.includes("super_admin")) return true;
  return user.permissions?.includes(permission) ?? false;
}
