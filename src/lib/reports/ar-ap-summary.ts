import { safeAdd, safeSubtract, type SafeMathInput } from "@/lib/utils/math"

export interface PartyMoney { count: number; billed: number; paid: number; outstanding: number }

function addTo(map: Map<string, PartyMoney>, name: string, billed: number, paid: number, outstanding: number) {
  const e = map.get(name) ?? { count: 0, billed: 0, paid: 0, outstanding: 0 }
  e.count += 1
  e.billed = safeAdd(e.billed, billed, 2)
  e.paid = safeAdd(e.paid, paid, 2)
  e.outstanding = safeAdd(e.outstanding, outstanding, 2)
  map.set(name, e)
}

/** Agregasi AR per pelanggan, presisi sen. */
export function buildArByCustomer(invoices: readonly { customerName: string; grandTotal: SafeMathInput; paidAmount: SafeMathInput }[]): Map<string, PartyMoney> {
  const m = new Map<string, PartyMoney>()
  for (const inv of invoices) {
    const billed = safeSubtract(inv.grandTotal, 0, 2)
    const paid = safeSubtract(inv.paidAmount, 0, 2)
    addTo(m, inv.customerName, billed, paid, safeSubtract(billed, paid, 2))
  }
  return m
}

/** Agregasi AP per pemasok NETO withholding, presisi sen. */
export function buildApByVendor(bills: readonly { vendorName: string; grandTotal: SafeMathInput; withholdingAmount: SafeMathInput; paidAmount: SafeMathInput }[]): Map<string, PartyMoney> {
  const m = new Map<string, PartyMoney>()
  for (const b of bills) {
    const billed = safeSubtract(b.grandTotal, b.withholdingAmount ?? 0, 2)
    const paid = safeSubtract(b.paidAmount, 0, 2)
    addTo(m, b.vendorName, billed, paid, safeSubtract(billed, paid, 2))
  }
  return m
}

export function sumOutstanding(rows: readonly (readonly [string, PartyMoney])[]): number {
  return rows.reduce((s, [, r]) => safeAdd(s, r.outstanding, 2), 0)
}
