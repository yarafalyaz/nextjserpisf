import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import path from "node:path"

/**
 * Ratchet kontrak `onDelete` relasi dokumen keuangan (audit 2026-11-17).
 *
 * Tanpa `onDelete` eksplisit, Prisma memakai default: relasi WAJIB → Restrict,
 * relasi OPSIONAL → SetNull. Default itu tampak aman sampai terbukti tidak:
 * FK `vendor_payments_vendor_bill_id_fkey` ternyata SET NULL, sehingga
 * hard-delete tagihan vendor akan diam-diam melepas tautan pembayaran yang
 * sudah menunjuknya — fakta finansial hilang tanpa jejak.
 *
 * Aturan: setiap `@relation(fields: [...])` pada model berikut WAJIB menulis
 * `onDelete`. Daftar model sengaja eksplisit supaya berkas baru yang memuat
 * dokumen keuangan tidak lolos diam-diam.
 */

const SCHEMA = readFileSync(path.join(process.cwd(), "prisma", "schema.prisma"), "utf8")

/** Model yang memuat fakta keuangan: pembayaran, tagihan, faktur, kredit. */
const FINANCE_MODELS = [
  "SalesInvoice",
  "SalesPayment",
  "SalesReturn",
  "SalesLateFee",
  "SalesLateFeePayment",
  "VendorBill",
  "VendorPayment",
  "VendorCredit",
  "CustomerCredit",
  "PurchaseReturn",
  "InvoiceExchange",
  "InvoiceExchangeItem",
  "Expense",
  "Payroll",
  "Journal",
  "JournalEntry",
] as const

function modelBlock(name: string): string | null {
  const re = new RegExp(`^model ${name} \\{[\\s\\S]*?^\\}`, "m")
  const m = re.exec(SCHEMA)
  return m ? m[0] : null
}

describe("onDelete eksplisit pada relasi dokumen keuangan", () => {
  it("setiap model keuangan yang diperiksa memang ada di skema", () => {
    const hilang = FINANCE_MODELS.filter((m) => modelBlock(m) == null)
    expect(hilang).toEqual([])
  })

  it("tidak ada @relation ber-fields tanpa onDelete", () => {
    const offenders: string[] = []
    let checked = 0
    for (const model of FINANCE_MODELS) {
      const block = modelBlock(model)
      if (!block) continue
      for (const line of block.split("\n")) {
        if (!line.includes("@relation(fields:")) continue
        checked += 1
        if (!line.includes("onDelete")) {
          offenders.push(`${model}: ${line.trim()}`)
        }
      }
    }
    expect(offenders).toEqual([])
    // Asersi non-vakum: relasi benar-benar terbaca.
    expect(checked).toBeGreaterThan(20)
  })

  it("FK pembayaran vendor ke tagihan memakai Restrict (bukan SetNull default)", () => {
    // Kasus nyata yang memicu guard ini: pembayaran yang sudah menunjuk
    // tagihan tidak boleh kehilangan tautannya saat tagihan dihapus.
    const block = modelBlock("VendorPayment")
    expect(block).toBeTruthy()
    const line = (block as string)
      .split("\n")
      .find((l) => l.includes("@relation(fields: [vendorBillId]"))
    expect(line).toBeTruthy()
    expect(line).toContain("onDelete: Restrict")
  })
})
