// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest"

import { SalesCommissionSubledgerCard } from "../sales-commission-subledger-card"
import {
  buildSalesCommissionSubledger,
  type SalesCommissionSubledgerLine,
} from "@/lib/reports/sales-commission-subledger"
import {
  buildSalesCommissionPayable,
  SALES_COMMISSION_PAYABLE_UNAVAILABLE_NOTICE,
} from "@/lib/reports/sales-commission-payable"
import { formatCurrency } from "@/lib/utils/format"
import { renderCard, unmountCard, clearRenderedCards } from "./card-test-utils"

afterEach(() => {
  clearRenderedCards()
})

function subledgerExample() {
  return buildSalesCommissionSubledger([
    {
      salesInvoiceId: 101,
      salesEmployeeId: 2,
      salesEmployeeName: "Sari",
      accruedAmount: 1_000_000,
      reversalAmount: 0,
      paidAmount: 400_000,
    },
    {
      salesInvoiceId: 102,
      salesEmployeeId: 2,
      salesEmployeeName: "Sari",
      accruedAmount: 500_000,
      reversalAmount: 500_000,
      paidAmount: 0,
    },
    {
      salesInvoiceId: 103,
      salesEmployeeId: 1,
      salesEmployeeName: "Budi",
      accruedAmount: 250_000,
      reversalAmount: 0,
      paidAmount: 300_000,
    },
  ])
}

describe("SalesCommissionSubledgerCard F-2026-10-25-049-S", () => {
  it("saldo per penerima + total tampil verbatim builder (negatif tidak di-clamp)", () => {
    const view = subledgerExample()
    const { container, root } = renderCard(
      <SalesCommissionSubledgerCard payable={view.payable} lineStatuses={view.lineStatuses} />,
    )
    const text = container.textContent ?? ""
    expect(text).toContain("Sari")
    expect(text).toContain("Budi")
    // Agregat server: Sari 1.500.000-500.000-400.000=600.000; Budi -50.000; total 550.000.
    expect(view.payable.rows.find((r) => r.salesEmployeeId === 2)?.balance).toBe(600_000)
    expect(view.payable.rows.find((r) => r.salesEmployeeId === 1)?.balance).toBe(-50_000)
    expect(text).toContain(formatCurrency(600_000))
    expect(text).toContain(formatCurrency(-50_000))
    expect(text).toContain(formatCurrency(550_000))
    expect(text).toContain("Total Saldo Subledger Komisi")
    expect(text).toContain("210212")
    expect(text).not.toContain("210207")
    // Notice builder verbatim (bukan parafrase UI).
    expect(text).toContain(view.payable.notice)
    expect(
      container.querySelector("[data-report-narration]")?.getAttribute("data-report-narration"),
    ).toBe(view.payable.notice)
    unmountCard(root)
  })

  it("status baris = label status turunan server per (faktur, penerima)", () => {
    const view = subledgerExample()
    const { container, root } = renderCard(
      <SalesCommissionSubledgerCard payable={view.payable} lineStatuses={view.lineStatuses} />,
    )
    const text = container.textContent ?? ""
    // 101 PARTIALLY_PAID, 102 REVERSED, 103 OVERPAID_NEGATIVE (builder server).
    expect(view.lineStatuses.map((l) => l.status)).toEqual([
      "PARTIALLY_PAID",
      "REVERSED",
      "OVERPAID_NEGATIVE",
    ])
    expect(text).toContain("Terbayar Sebagian")
    expect(text).toContain("Dibalik Penuh")
    expect(text).toContain("Kelebihan Bayar (Saldo Negatif)")
    // Kode mentah server tidak bocor sebagai label tampil.
    expect(text).not.toContain("PARTIALLY_PAID")
    expect(text).not.toContain("OVERPAID_NEGATIVE")
    unmountCard(root)
  })

  it("penerima asing tidak bocor: baris di luar payload tidak dirender", () => {
    const view = subledgerExample()
    const { container, root } = renderCard(
      <SalesCommissionSubledgerCard payable={view.payable} lineStatuses={view.lineStatuses} />,
    )
    const text = container.textContent ?? ""
    expect(text).not.toContain("Zulkifli")
    expect(text).not.toContain("104")
    unmountCard(root)
  })

  it("ledger belum tersedia: notice UNAVAILABLE verbatim, tanpa tabel saldo 0", () => {
    const payable = buildSalesCommissionPayable([], { ledgerAvailable: false })
    const { container, root } = renderCard(
      <SalesCommissionSubledgerCard payable={payable} lineStatuses={[]} />,
    )
    const text = container.textContent ?? ""
    expect(text).toContain(SALES_COMMISSION_PAYABLE_UNAVAILABLE_NOTICE)
    expect(text).toContain(
      "Subledger dan jurnal utang komisi belum tersedia (inti tahap 3 belum live) — saldo utang komisi terbaca 0; rekap informatif tetap bukan utang.",
    )
    expect(container.querySelector("table")).toBeNull()
    expect(text).not.toContain("Total Saldo Subledger Komisi")
    unmountCard(root)
  })

  it("ledger tersedia tapi kosong: teks kosong jujur, tanpa tabel", () => {
    const payable = buildSalesCommissionPayable([], { ledgerAvailable: true })
    const lineStatuses: SalesCommissionSubledgerLine[] = []
    const { container, root } = renderCard(
      <SalesCommissionSubledgerCard payable={payable} lineStatuses={lineStatuses} />,
    )
    const text = container.textContent ?? ""
    expect(text).toContain("Belum ada baris subledger komisi tercatat per penerima.")
    expect(container.querySelector("table")).toBeNull()
    unmountCard(root)
  })

  it("nama penerima kosong = status eksplisit, bukan sel kosong", () => {
    const view = buildSalesCommissionSubledger([
      {
        salesInvoiceId: 201,
        salesEmployeeId: 9,
        salesEmployeeName: null,
        accruedAmount: 100_000,
        reversalAmount: 0,
        paidAmount: 0,
      },
    ])
    const { container, root } = renderCard(
      <SalesCommissionSubledgerCard payable={view.payable} lineStatuses={view.lineStatuses} />,
    )
    const text = container.textContent ?? ""
    expect(text).toContain("Nama penjual tidak tercatat")
    expect(text).toContain("Terakru")
    unmountCard(root)
  })

  it("rekonsiliasi server tampil berlabel Indonesia + penerima terkait", () => {
    const view = subledgerExample()
    const { container, root } = renderCard(
      <SalesCommissionSubledgerCard payable={view.payable} lineStatuses={view.lineStatuses} />,
    )
    const text = container.textContent ?? ""
    expect(view.payable.reconciliations.length).toBeGreaterThan(0)
    expect(text).toContain("Baris Rekonsiliasi")
    expect(text).toContain("Saldo negatif — retur sesudah komisi terbayar")
    unmountCard(root)
  })

  it("filter penerima tampil-saja: penerima lain hilang, total server utuh", () => {
    const view = subledgerExample()
    const { container, root } = renderCard(
      <SalesCommissionSubledgerCard
        payable={view.payable}
        lineStatuses={view.lineStatuses}
        selectedSalesEmployeeId={2}
      />,
    )
    const text = container.textContent ?? ""
    expect(text).toContain("Sari")
    expect(text).not.toContain("Budi")
    expect(text).toContain(formatCurrency(550_000))
    expect(text).toContain("filter hanya menyaring penerima yang tampil")
    unmountCard(root)
  })

  it("baca-saja: nol tombol/tautan/form/input mutasi", () => {
    const view = subledgerExample()
    const { container, root } = renderCard(
      <SalesCommissionSubledgerCard payable={view.payable} lineStatuses={view.lineStatuses} />,
    )
    expect(container.querySelectorAll("button, a, form, input, select, textarea")).toHaveLength(0)
    unmountCard(root)
  })
})
