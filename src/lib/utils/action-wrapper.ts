import { auth } from "@/lib/auth/auth"

/**
 * Wrapper for server actions: auto try-catch + auth check
 * Usage: export const myAction = action(async (formData) => { ... })
 * Or with permission: export const myAction = action(async (formData) => { ... }).protect("manage_sales")
 */
export function action<T extends (...args: any[]) => Promise<any>>(fn: T): T & { protect: (permission?: string) => T } {
  const wrapped = (async (...args: any[]) => {
    try {
      return await fn(...args)
    } catch (e: any) {
      console.error("[Action Error]", fn.name || "unknown", e?.message || e)
      return { success: false, error: e?.message || "Terjadi kesalahan server" }
    }
  }) as T & { protect: (permission?: string) => T }

  wrapped.protect = (permission?: string) => {
    const protectedFn = (async (...args: any[]) => {
      try {
        // Auth check
        const session = await auth()
        if (!session?.user?.id) {
          return { success: false, error: "Silakan login terlebih dahulu" }
        }
        // Optional permission check
        if (permission) {
          const { requirePermission } = await import("@/lib/auth/permissions")
          await requirePermission(permission)
        }
        return await fn(...args)
      } catch (e: any) {
        console.error("[Action Error]", fn.name || "unknown", e?.message || e)
        return { success: false, error: e?.message || "Terjadi kesalahan server" }
      }
    }) as T & { protect: (permission?: string) => T }
    return protectedFn
  }

  return wrapped
}
