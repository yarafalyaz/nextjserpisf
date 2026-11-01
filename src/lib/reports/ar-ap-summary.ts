import { safeAdd, safeSubtract, type SafeMathInput } from "@/lib/utils/math"

export interface PartyMoney { count: number; billed: number; paid: number; outstanding: number }

export interface PartyMoneyRow extends PartyMoney {
  partyId: number
  name: string
}

/** Kunci agregasi adalah id pihak, BUKAN nama: `Customer.name`/`Vendor.name`
 * bukan kolom unik (yang unik hanya slug/code), jadi dua pelanggan/vendor
 * berbeda dengan nama identik akan tergabung satu baris (count, tagihan,
 * bayar, sisa menyatu) bila kunci nama yang dipakai. */
function addTo(
  map: Map<number, PartyMoneyRow>,
  id: number,
  name: string,
  billed: number,
  paid: number,
  outstanding: number,
) {
  const e = map.get(id) ?? { partyId: id, name, count: 0, billed: 0, paid: 0, outstanding: 0 }
  e.count += 1
  e.billed = safeAdd(e.billed, billed, 2)
  e.paid = safeAdd(e.paid, paid, 2)
  e.outstanding = safeAdd(e.outstanding, outstanding, 2)
  map.set(id, e)
}

/** Agregasi AR per pelanggan, presisi sen. `returnCreditAmount` opsional
 * (F-104-V): pengurang outstanding per faktur dari jurnal SalesReturn
 * POSTED — BUKAN bagian `paid` (kolom Sudah Dibayar tetap murni). */
export function buildArByCustomer(invoices: readonly { customerId: number; customerName: string; grandTotal: SafeMathInput; paidAmount: SafeMathInput; returnCreditAmount?: SafeMathInput }[]): PartyMoneyRow[] {
  const m = new Map<number, PartyMoneyRow>()
  for (const inv of invoices) {
    const billed = safeSubtract(inv.grandTotal, 0, 2)
    const paid = safeSubtract(inv.paidAmount, 0, 2)
    const settled = safeAdd(paid, safeSubtract(inv.returnCreditAmount ?? 0, 0, 2), 2)
    addTo(m, inv.customerId, inv.customerName, billed, paid, safeSubtract(billed, settled, 2))
  }
  return [...m.values()]
}

/** Agregasi AP per pemasok NETO withholding, presisi sen. Sisa dari
 * balanceDue kanonis bila kolom dipasok (loader produksi selalu). */
export function buildApByVendor(bills: readonly { vendorId: number; vendorName: string; grandTotal: SafeMathInput; withholdingAmount: SafeMathInput; paidAmount: SafeMathInput; balanceDue?: SafeMathInput | null }[]): PartyMoneyRow[] {
  const m = new Map<number, PartyMoneyRow>()
  for (const b of bills) {
    const billed = safeSubtract(b.grandTotal, b.withholdingAmount ?? 0, 2)
    const paid = safeSubtract(b.paidAmount, 0, 2)
    const outstanding =
      b.balanceDue != null && Number.isFinite(Number(b.balanceDue))
        ? safeSubtract(b.balanceDue, 0, 2)
        : safeSubtract(billed, paid, 2)
    addTo(m, b.vendorId, b.vendorName, billed, paid, outstanding)
  }
  return [...m.values()]
}

export function sumOutstanding(rows: readonly PartyMoney[]): number {
  return rows.reduce((s, r) => safeAdd(s, r.outstanding, 2), 0)
}
