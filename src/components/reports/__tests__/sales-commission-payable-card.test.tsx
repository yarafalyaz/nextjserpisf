// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest"

import { SalesCommissionPayableCard } from "../sales-commission-payable-card"
import {
  buildSalesCommissionPayable,
  SALES_COMMISSION_PAYABLE_NOTICE,
} from "@/lib/reports/sales-commission-payable"
import { renderCard, unmountCard, clearRenderedCards } from "./card-test-utils"

afterEach(() => {
  clearRenderedCards()
})

function payableExample() {
  return buildSalesCommissionPayable(
    [
      {
        salesInvoiceId: 10,
        salesEmployeeId: 2,
        salesEmployeeName: "Sari",
        accruedAmount: 100000,
        reversalAmount: 25000,
        paidAmount: 50000,
      },
      {
        salesInvoiceId: 11,
        salesEmployeeId: 2,
        salesEmployeeName: "Sari",
        accruedAmount: 40000,
        reversalAmount: 0,
        paidAmount: 0,
      },
      {
        salesInvoiceId: 12,
        salesEmployeeId: 1,
        salesEmployeeName: "Budi",
        accruedAmount: 30000,
        reversalAmount: 0,
        paidAmount: 10000,
      },
      {
        salesInvoiceId: 20,
        salesEmployeeId: 3,
        salesEmployeeName: "Rina",
        accruedAmount: 10000,
        reversalAmount: 15000,
        paidAmount: 0,
      },
      {
        salesInvoiceId: 21,
        salesEmployeeId: 3,
        salesEmployeeName: "Rina",
        accruedAmount: 10000,
        reversalAmount: 4000,
        paidAmount: 10000,
      },
    ],
    { ledgerAvailable: true },
  )
}

describe("SalesCommissionPayableCard F-2026-10-25-037-S §5", () => {
  it("ledger live: notice + angka builder persis, saldo negatif tidak di-clamp, rekonsiliasi tampil beralasan", () => {
    const { container, root } = renderCard(<SalesCommissionPayableCard report={payableExample()} />)
    const text = container.textContent ?? ""
    expect(text).toContain(SALES_COMMISSION_PAYABLE_NOTICE)
    // Penjaga literal (bukan konstanta tautologis): ubah string builder = MERAH.
    expect(text).toContain(
      "Saldo utang komisi tercatat dari subledger dan jurnal komisi (tahap 3) — terpisah dari rekap informatif; rekap bukan utang dan keduanya direkonsiliasi per faktur, tidak disamakan paksa.",
    )
    expect(
      container.querySelector("[data-report-narration]")?.getAttribute("data-report-narration"),
    ).toBe(SALES_COMMISSION_PAYABLE_NOTICE)
    // Agregat per penjual dari builder (Sari 140000/25000/50000/65000).
    expect(text).toContain("Sari")
    expect(text).toContain("Rp 140.000")
    expect(text).toContain("Rp 25.000")
    expect(text).toContain("Rp 50.000")
    expect(text).toContain("Rp 65.000")
    // Rina: saldo −5.000 + −4.000 = Rp -9.000 tampil apa adanya (BR-KOM37-08);
    // format repo formatCurrency menaruh tanda minus sesudah "Rp".
    expect(text).toContain("Rina")
    expect(text).toContain("Rp -9.000")
    // Total builder: 65.000 + 20.000 − 9.000.
    expect(text).toContain("Total Saldo Utang Komisi")
    expect(text).toContain("Rp 76.000")
    // Baris rekonsiliasi = baris alasan, tidak disembunyikan.
    expect(text).toContain("Baris Rekonsiliasi")
    expect(text).toContain("lawan-melebihi-akrual")
    expect(text).toContain("saldo-negatif-retur-sesudah-terbayar")
    expect(text).toContain("20")
    expect(text).toContain("21")
    // Urutan builder per id penjual: Budi(1) sebelum Sari(2) sebelum Rina(3).
    expect(text.indexOf("Budi")).toBeLessThan(text.indexOf("Sari"))
    expect(text.indexOf("Sari")).toBeLessThan(text.indexOf("Rina"))
    unmountCard(root)
  })

  it("ledger belum live: label belum-tersedia verbatim, tanpa tabel saldo", () => {
    const report = buildSalesCommissionPayable(
      [
        {
          salesInvoiceId: 1,
          salesEmployeeId: 9,
          salesEmployeeName: "X",
          accruedAmount: 999,
          reversalAmount: 0,
          paidAmount: 0,
        },
      ],
      { ledgerAvailable: false },
    )
    const { container, root } = renderCard(<SalesCommissionPayableCard report={report} />)
    const text = container.textContent ?? ""
    expect(text).toContain(
      "Subledger dan jurnal utang komisi belum tersedia (inti tahap 3 belum live) — saldo utang komisi terbaca 0; rekap informatif tetap bukan utang.",
    )
    expect(container.querySelector("table")).toBeNull()
    expect(text).not.toContain("Total Saldo Utang Komisi")
    unmountCard(root)
  })

  it("nama penjual kosong dari builder tampil status eksplisit, bukan sel kosong", () => {
    const report = buildSalesCommissionPayable(
      [
        {
          salesInvoiceId: 30,
          salesEmployeeId: 9,
          salesEmployeeName: null,
          accruedAmount: 10000,
          reversalAmount: 0,
          paidAmount: 0,
        },
      ],
      { ledgerAvailable: true },
    )
    const { container, root } = renderCard(<SalesCommissionPayableCard report={report} />)
    const text = container.textContent ?? ""
    expect(text).toContain("Nama penjual tidak tercatat")
    expect(text).toContain("Rp 10.000")
    unmountCard(root)
  })

  it("ledger live tanpa baris: empty state tercatat, tanpa tabel", () => {
    const report = buildSalesCommissionPayable([], { ledgerAvailable: true })
    const { container, root } = renderCard(<SalesCommissionPayableCard report={report} />)
    const text = container.textContent ?? ""
    expect(text).toContain(SALES_COMMISSION_PAYABLE_NOTICE)
    expect(text).toContain("Belum ada saldo utang komisi tercatat pada subledger.")
    expect(container.querySelector("table")).toBeNull()
    unmountCard(root)
  })
})
