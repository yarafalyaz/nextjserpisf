import { unstable_cache as cache } from "next/cache"
import { prisma } from "@/lib/db/prisma"
import { paymentMethodLabel, shippingMethodLabel } from "@/lib/utils/method-labels"

/** Active payment methods for use as form dropdown options. Cached 5 min. */
export const getActivePaymentMethods = cache(
  async (): Promise<{ code: string; name: string }[]> => {
    return prisma.paymentMethod.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { code: true, name: true },
    })
  },
  ["payment-methods-active"],
  { revalidate: 300, tags: ["payment-methods"] },
)

/** Active shipping methods for use as form dropdown options. Cached 5 min. */
export const getActiveShippingMethods = cache(
  async (): Promise<{ code: string; name: string }[]> => {
    return prisma.shippingMethod.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { code: true, name: true },
    })
  },
  ["shipping-methods-active"],
  { revalidate: 300, tags: ["shipping-methods"] },
)

/** Map of payment-method code -> name (includes inactive, for historical display). Cached 5 min. */
export const getPaymentMethodMap = cache(
  async (): Promise<Record<string, string>> => {
    const rows = await prisma.paymentMethod.findMany({ select: { code: true, name: true } })
    return Object.fromEntries(rows.map((r) => [r.code, r.name]))
  },
  ["payment-method-map"],
  { revalidate: 300, tags: ["payment-methods"] },
)

/**
 * Resolve a stored payment-method code to a friendly name.
 * Falls back to the static label map (legacy free-text codes), then the raw value.
 */
export function resolvePaymentMethodName(code?: string | null, map?: Record<string, string>): string {
  if (!code) return "-"
  return map?.[code] ?? paymentMethodLabel(code) ?? code
}

export function resolveShippingMethodName(code?: string | null, map?: Record<string, string>): string {
  if (!code) return "-"
  return map?.[code] ?? shippingMethodLabel(code) ?? code
}
