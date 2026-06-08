import { prisma } from "@/lib/db/prisma"
import { paymentMethodLabel, shippingMethodLabel } from "@/lib/utils/method-labels"

/** Active payment methods for use as form dropdown options. */
export async function getActivePaymentMethods(): Promise<{ code: string; name: string }[]> {
  return prisma.paymentMethod.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    select: { code: true, name: true },
  })
}

/** Active shipping methods for use as form dropdown options. */
export async function getActiveShippingMethods(): Promise<{ code: string; name: string }[]> {
  return prisma.shippingMethod.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    select: { code: true, name: true },
  })
}

/** Map of payment-method code -> name (includes inactive, for historical display). */
export async function getPaymentMethodMap(): Promise<Record<string, string>> {
  const rows = await prisma.paymentMethod.findMany({ select: { code: true, name: true } })
  return Object.fromEntries(rows.map((r) => [r.code, r.name]))
}

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
