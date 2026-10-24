/**
 * Outstanding receivables grouped by the invoiced vehicle (plat nomor) for
 * service invoices, alongside the per-customer view (customer-receivables.ts).
 * Invoices without a vehicle fall into "Tanpa kendaraan" (regular sales).
 * Pure grouping; plate resolution stays in the loader.
 */
import { safeAdd } from "@/lib/utils/math"

import { receivableOutstanding } from "./aging-amounts"
import { agingBucket, daysOverdue, type AgingBucket } from "./aging"

export const UNASSIGNED_VEHICLE_LABEL = "Tanpa kendaraan"

export interface VehicleReceivableInvoice {
  plateLabel: string | null
  grandTotal: unknown
  paidAmount: unknown
  /** F-104-V opsional: returnCredit jurnal SalesReturn POSTED faktur ini. */
  returnCreditAmount?: unknown
  dueDate: Date | null
}

export interface VehicleReceivableRow {
  plateLabel: string
  outstanding: number
  overdue: number
  invoiceCount: number
  buckets: Record<AgingBucket, number>
}

export function groupReceivablesByVehicle(
  invoices: readonly VehicleReceivableInvoice[],
  now: Date = new Date(),
): VehicleReceivableRow[] {
  const groups = new Map<string, VehicleReceivableRow>()
  for (const inv of invoices) {
    const settled = Number(inv.paidAmount ?? 0) + Number(inv.returnCreditAmount ?? 0)
    const outstanding = receivableOutstanding(inv.grandTotal as never, settled as never)
    if (outstanding <= 0) continue
    const label = inv.plateLabel?.trim() ? inv.plateLabel : UNASSIGNED_VEHICLE_LABEL
    const row = groups.get(label) ?? {
      plateLabel: label,
      outstanding: 0,
      overdue: 0,
      invoiceCount: 0,
      buckets: {
        "Belum Jatuh Tempo": 0,
        "1–30 Hari": 0,
        "31–60 Hari": 0,
        "61–90 Hari": 0,
        "> 90 Hari": 0,
      } as Record<AgingBucket, number>,
    }
    row.outstanding = safeAdd(row.outstanding, outstanding, 2)
    if (inv.dueDate && inv.dueDate < now) row.overdue = safeAdd(row.overdue, outstanding, 2)
    if (inv.dueDate) row.buckets[agingBucket(daysOverdue(inv.dueDate, now))] = safeAdd(row.buckets[agingBucket(daysOverdue(inv.dueDate, now))], outstanding, 2)
    row.invoiceCount += 1
    groups.set(label, row)
  }
  return [...groups.values()].sort((a, b) => b.outstanding - a.outstanding)
}
