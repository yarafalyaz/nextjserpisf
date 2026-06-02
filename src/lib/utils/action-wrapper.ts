import { getErrorMessage } from "@/lib/utils/error"
import { auth } from "@/lib/auth/auth"

/**
 * Wrapper for server actions: auto try-catch + auth check
 * Usage: export const myAction = action(async (formData) => { ... })
 * Or with permission: export const myAction = action(async (formData) => { ... }).protect("manage_sales")
 */
export function action<T extends (...args: unknown[]) => Promise<unknown>>(fn: T): T & { protect: (permission?: string) => T } {
  const wrapped = (async (...args: unknown[]) => {
    try {
      return await fn(...args)
    } catch (e: unknown) {
      console.error("[Action Error]", fn.name || "unknown", getErrorMessage(e) || e)
      return { success: false, error: getErrorMessage(e, "Terjadi kesalahan server") }
    }
  }) as T & { protect: (permission?: string) => T }

  wrapped.protect = (permission?: string) => {
    const protectedFn = (async (...args: unknown[]) => {
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
      } catch (e: unknown) {
        console.error("[Action Error]", fn.name || "unknown", getErrorMessage(e) || e)
        return { success: false, error: getErrorMessage(e, "Terjadi kesalahan server") }
      }
    }) as T & { protect: (permission?: string) => T }
    return protectedFn
  }

  return wrapped
}
