import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import {
  deriveTaxIdentityCompleteness,
  type TaxIdentityCompleteness,
} from "@/lib/tax/customer-tax-identity"

/**
 * Penanda kelengkapan identitas pajak pelanggan (F-2026-10-25-004-S,
 * putusan Lead §8A Q-TX-4): turunan baca-saja di master SAJA tahap 1 —
 * tanpa kolom status, tanpa antrean petugas, tanpa cron.
 * Izin: view_customers (reuse existing, tanpa key baru — §8A Q-TX-2).
 */

export interface CustomerTaxCompletenessRow {
  customerId: number
  name: string
  completeness: TaxIdentityCompleteness
}

export async function loadCustomerTaxCompleteness(customerIds?: number[]): Promise<CustomerTaxCompletenessRow[]> {
  await requirePermission("view_customers")
  const customers = await prisma.customer.findMany({
    where: {
      deletedAt: null,
      ...(customerIds?.length ? { id: { in: customerIds } } : {}),
    },
    select: { id: true, name: true, taxId: true, taxpayerName: true, nitku: true },
    orderBy: { name: "asc" },
  })
  return customers.map((c) => ({
    customerId: c.id,
    name: c.name,
    completeness: deriveTaxIdentityCompleteness({ ...c, tradeName: c.name }),
  }))
}
