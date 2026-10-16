/**
 * Sales analytics aggregation (per barang / pelanggan / merek + monthly trend).
 *
 * Pure by design (no Prisma) so grouping and the monthly trend can be unit
 * tested; the page only maps Prisma rows onto these inputs.
 */

import { safeAdd } from "@/lib/utils/math"
import { formatPeriod } from "@/lib/utils/format"

export type SalesDimension = "barang" | "pelanggan" | "merek"

export const SALES_DIMENSIONS: { value: SalesDimension; label: string }[] = [
  { value: "barang", label: "Per Barang" },
  { value: "pelanggan", label: "Per Pelanggan" },
  { value: "merek", label: "Per Merek" },
]

export interface SalesLine {
  itemKey: string | null
  itemLabel: string
  brandName: string | null
  customerId: number
  customerName: string
  qty: number
  /** Line revenue (after discount). */
  revenue: number
}

export interface SalesGroupRow {
  key: string
  label: string
  qty: number
  revenue: number
  lineCount: number
}

/** Group invoice lines by the chosen dimension, largest revenue first. */
export function aggregateSales(lines: SalesLine[], dimension: SalesDimension): SalesGroupRow[] {
  const groups = new Map<string, SalesGroupRow>()

  for (const line of lines) {
    let key: string
    let label: string
    if (dimension === "barang") {
      key = line.itemKey ?? "__none__"
      label = line.itemKey ? line.itemLabel : "(tanpa barang)"
    } else if (dimension === "pelanggan") {
      key = `customer:${line.customerId}`
      label = line.customerName
    } else {
      key = line.brandName ?? "__none__"
      label = line.brandName ?? "(tanpa merek)"
    }

    const existing = groups.get(key) ?? { key, label, qty: 0, revenue: 0, lineCount: 0 }
    existing.qty = safeAdd(existing.qty, line.qty, 2)
    existing.revenue = safeAdd(existing.revenue, line.revenue, 2)
    existing.lineCount += 1
    groups.set(key, existing)
  }

  return Array.from(groups.values()).sort((a, b) => b.revenue - a.revenue)
}

export interface MonthlySalesRow {
  /** YYYY-MM */
  month: string
  label: string
  revenue: number
  invoiceCount: number
}

/** Monthly revenue trend, ascending by month. */
export function monthlySales(invoices: { date: Date; grandTotal: number }[]): MonthlySalesRow[] {
  const buckets = new Map<string, MonthlySalesRow>()

  for (const invoice of invoices) {
    const month = `${invoice.date.getFullYear()}-${String(invoice.date.getMonth() + 1).padStart(2, "0")}`
    const existing = buckets.get(month) ?? { month, label: formatPeriod(month), revenue: 0, invoiceCount: 0 }
    existing.revenue = safeAdd(existing.revenue, invoice.grandTotal, 2)
    existing.invoiceCount += 1
    buckets.set(month, existing)
  }

  return Array.from(buckets.values()).sort((a, b) => a.month.localeCompare(b.month))
}
