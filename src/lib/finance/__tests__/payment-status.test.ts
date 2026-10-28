import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
  PAYMENT_REVERSED,
  activeSalesPaymentWhere,
  activeVendorPaymentWhere,
  isReversedPayment,
} from "../payment-status"
import { hasRealSettlement, salesOrderHasRealSettlement } from "@/lib/services/sales-settlement.service"
import type { TxClient } from "@/lib/db/prisma"

/**
 * FIN-BR-008 (t_9a24236e): reversal TIDAK menghapus baris pembayaran, jadi
 * setiap pembaca yang menghitung uang wajib menyaring `status = "reversed"`.
 * Tes ini mengunci dua hal: helper saringan itu sendiri, dan fakta bahwa
 * pembaca-pembaca uang benar-benar memakainya (kalau saringan dicabut dari
 * salah satu berkas, tes sumber di bawah MERAH).
 */

type Row = { salesInvoiceId?: number; status?: string; paymentMethod?: string; salesInvoice?: { salesOrderId?: number } }

/**
 * Klien tiruan yang MENGHORMATI `where` (bukan sekadar mengembalikan angka),
 * supaya perilaku `hasRealSettlement` sesudah reversal benar-benar teruji.
 */
function fakeClient(rows: Row[]) {
  const match = (row: Row, where: Record<string, unknown>): boolean => {
    for (const [key, cond] of Object.entries(where)) {
      if (key === "NOT") {
        const not = cond as Record<string, unknown>
        if (Object.entries(not).every(([k, v]) => row[k as keyof Row] === v)) return false
        continue
      }
      if (key === "salesInvoice") {
        const rel = cond as Record<string, unknown>
        if (Object.entries(rel).some(([k, v]) => (row.salesInvoice as Record<string, unknown> | undefined)?.[k] !== v)) return false
        continue
      }
      const value = row[key as keyof Row]
      if (cond && typeof cond === "object" && "not" in (cond as Record<string, unknown>)) {
        if (value === (cond as { not: unknown }).not) return false
        continue
      }
      if (value !== cond) return false
    }
    return true
  }
  const whereCalls: Record<string, unknown>[] = []
  const client = {
    salesPayment: {
      count: async ({ where }: { where: Record<string, unknown> }) => {
        whereCalls.push(where)
        return rows.filter((r) => match(r, where)).length
      },
    },
  }
  return { client: client as unknown as TxClient, whereCalls }
}

describe("FIN-BR-008 — helper penyaring pembayaran reversed", () => {
  it("menambahkan status not reversed dan mempertahankan filter pemanggil", () => {
    expect(activeSalesPaymentWhere({ salesInvoiceId: 7 })).toEqual({
      salesInvoiceId: 7,
      status: { not: PAYMENT_REVERSED },
    })
    expect(activeSalesPaymentWhere()).toEqual({ status: { not: PAYMENT_REVERSED } })
    expect(activeVendorPaymentWhere({ status: "completed" })).toEqual({
      status: { not: PAYMENT_REVERSED },
    })
  })

  it("mengenali baris reversed tanpa peduli status lain", () => {
    expect(isReversedPayment({ status: "reversed" })).toBe(true)
    expect(isReversedPayment({ status: "posted" })).toBe(false)
    expect(isReversedPayment(null)).toBe(false)
  })
})

describe("FIN-BR-008 — hasRealSettlement menghitung ulang sesudah reversal", () => {
  it("true bila ada pembayaran posted non-DP", async () => {
    const { client } = fakeClient([
      { salesInvoiceId: 1, status: "posted", paymentMethod: "transfer" },
    ])
    await expect(hasRealSettlement(1, client)).resolves.toBe(true)
  })

  it("false bila satu-satunya pembayaran sudah reversed (baris tetap ada)", async () => {
    const { client, whereCalls } = fakeClient([
      { salesInvoiceId: 1, status: "reversed", paymentMethod: "transfer" },
    ])
    await expect(hasRealSettlement(1, client)).resolves.toBe(false)
    expect(whereCalls[0]).toMatchObject({ status: { not: PAYMENT_REVERSED } })
  })

  it("DP saja tetap bukan settlement walau statusnya posted", async () => {
    const { client } = fakeClient([
      { salesInvoiceId: 1, status: "posted", paymentMethod: "down_payment" },
      { salesInvoiceId: 1, status: "reversed", paymentMethod: "down_payment" },
    ])
    await expect(hasRealSettlement(1, client)).resolves.toBe(false)
  })

  it("pesanan penjualan ikut terbuka lagi sesudah pembayaran dibatalkan", async () => {
    const { client } = fakeClient([
      { status: "reversed", paymentMethod: "transfer", salesInvoice: { salesOrderId: 9 } },
    ])
    await expect(salesOrderHasRealSettlement(9, client)).resolves.toBe(false)
  })
})

/**
 * Penjaga sumber: berkas pembaca uang WAJIB memakai helper, bukan menulis
 * `status: { not: "reversed" }` sendiri-sendiri. Kalau saringan dicabut dari
 * salah satu berkas, daftar di bawah gagal cocok -> MERAH.
 */
describe("FIN-BR-008 — semua pembaca uang memakai saringan terpusat", () => {
  const pembaca = [
    "src/actions/sales.actions.ts",
    "src/lib/hooks/accounting.hook.ts",
    "src/lib/hooks/down-payment.hook.ts",
    "src/lib/reports/bank-movements-data.ts",
    "src/lib/reports/customer-credit-queue-data.ts",
    "src/lib/reports/customer-statement-data.ts",
    "src/lib/reports/ledger-cash-data.ts",
    "src/lib/reports/withholding-certificates-data.ts",
    "src/lib/services/customer-credit.service.ts",
    "src/lib/services/sales-invoice-posting.service.ts",
    "src/lib/services/sales-settlement.service.ts",
  ]

  it.each(pembaca)("%s memakai activeSalesPaymentWhere", (berkas) => {
    const isi = readFileSync(join(process.cwd(), berkas), "utf8")
    expect(isi).toContain('from "@/lib/finance/payment-status"')
    expect(isi).toContain("activeSalesPaymentWhere(")
  })
})
