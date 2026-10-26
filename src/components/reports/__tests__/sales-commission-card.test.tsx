// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest"

import { SalesCommissionCard } from "../sales-commission-card"
import { buildSalesCommissionRecap, SALES_COMMISSION_NOTICE } from "@/lib/reports/sales-commission"
import { renderCard, unmountCard, clearRenderedCards } from "./card-test-utils"

afterEach(() => {
  clearRenderedCards()
})

function reportExample() {
  return buildSalesCommissionRecap([
    { salesEmployeeId: 2, salesEmployeeName: "Sari", grandTotal: 1_000_000, commissionPercent: 0 },
    { salesEmployeeId: 1, salesEmployeeName: "Budi", grandTotal: 500_000, commissionPercent: 0 },
    { salesEmployeeId: 2, salesEmployeeName: "Sari", grandTotal: 250_000, commissionPercent: 0 },
    { salesEmployeeId: null, salesEmployeeName: null, grandTotal: 700_000, commissionPercent: 0 },
  ])
}

describe("SalesCommissionCard F-2026-10-22-053-S", () => {
  it("notice verbatim utuh + angka loader persis + ember eksplisit", () => {
    const { container, root } = renderCard(
      <SalesCommissionCard report={reportExample()} selectedSalesEmployeeId={null} />,
    )
    const text = container.textContent ?? ""
    expect(text).toContain(SALES_COMMISSION_NOTICE)
    // Penjaga literal AC-KOM-1 (BUKAN konstanta impor): ubah string builder
    // SALES_COMMISSION_NOTICE = tes ini MERAH.
    expect(text).toContain(
      "Rekap informatif dari snapshot penjual di faktur lunas — bukan utang komisi, bukan dasar jurnal atau pembayaran. Persen 0 berarti tarif belum diatur untuk baris itu. Basis komisi adalah DPP faktur (total faktur dikurangi PPN), dikurangi retur selesai pada masa berjalan.",
    )
    // Penanda ekspor: notice verbatim terbawa ke PDF/CSV via ExportButtons.
    expect(
      container.querySelector("[data-report-narration]")?.getAttribute("data-report-narration"),
    ).toBe(
      "Rekap informatif dari snapshot penjual di faktur lunas — bukan utang komisi, bukan dasar jurnal atau pembayaran. Persen 0 berarti tarif belum diatur untuk baris itu. Basis komisi adalah DPP faktur (total faktur dikurangi PPN), dikurangi retur selesai pada masa berjalan.",
    )
    expect(text).toContain("Sari")
    expect(text).toContain("Budi")
    expect(text).toContain("Rp 1.250.000")
    expect(text).toContain("Rp 500.000")
    expect(text).toContain("Tanpa penjual tercatat")
    expect(text).toContain("Rp 700.000")
    expect(text).toContain("Total Basis Faktur Lunas")
    expect(text).toContain("Rp 2.450.000")
    expect(text).toContain("Total Estimasi Komisi")
    // Urutan builder paidBase desc: Sari sebelum Budi.
    expect(text.indexOf("Sari")).toBeLessThan(text.indexOf("Budi"))
    unmountCard(root)
  })

  it("persen 0 jujur: estimasi 0 tampil, tanpa kolom persen turunan", () => {
    const { container, root } = renderCard(
      <SalesCommissionCard report={reportExample()} selectedSalesEmployeeId={null} />,
    )
    const text = container.textContent ?? ""
    expect(text).toContain("Rp 0")
    expect(text).not.toContain("%")
    unmountCard(root)
  })

  it("filter penjual tampil-saja: baris lain + ember hilang, total masa loader utuh", () => {
    const { container, root } = renderCard(
      <SalesCommissionCard report={reportExample()} selectedSalesEmployeeId={2} />,
    )
    const text = container.textContent ?? ""
    expect(text).toContain("Sari")
    expect(text).toContain("Rp 1.250.000")
    expect(text).not.toContain("Budi")
    expect(text).not.toContain("Tanpa penjual tercatat")
    // Total masa tetap angka loader utuh (BR-KOM-04), bukan jumlah baris tampil.
    expect(text).toContain("Rp 2.450.000")
    expect(text).toContain("sudah termasuk faktur tanpa penjual")
    unmountCard(root)
  })

  it("nama penjual kosong dari builder tampil —, bukan tebakan", () => {
    const report = buildSalesCommissionRecap([
      { salesEmployeeId: 9, salesEmployeeName: null, grandTotal: 100_000, commissionPercent: 0 },
    ])
    const { container, root } = renderCard(
      <SalesCommissionCard report={report} selectedSalesEmployeeId={null} />,
    )
    expect(container.textContent ?? "").toContain("—")
    unmountCard(root)
  })

  it("kosong: notice tetap tampil + kata kosong, tanpa tabel", () => {
    const { container, root } = renderCard(
      <SalesCommissionCard report={buildSalesCommissionRecap([])} selectedSalesEmployeeId={null} />,
    )
    const text = container.textContent ?? ""
    expect(text).toContain(SALES_COMMISSION_NOTICE)
    expect(text).toContain("Tidak ada faktur lunas pada masa ini.")
    expect(container.querySelector("table")).toBeNull()
    unmountCard(root)
  })

  it("tanpa aksi uang: nol tombol/tautan/form mutasi", () => {
    const { container, root } = renderCard(
      <SalesCommissionCard report={reportExample()} selectedSalesEmployeeId={null} />,
    )
    expect(container.querySelectorAll("button, a, form, input")).toHaveLength(0)
    unmountCard(root)
  })

  it("036-S: DPP + pengurang retur + komisi bersih tampil verbatim dari loader", () => {
    // Fixture builder: DPP = 1.110.000 − 110.000 = 1.000.000; estimasi 5% =
    // 50.000; retur DPP 200.000 × 5% = 10.000; bersih 40.000. Kartu hanya
    // menampilkan angka builder — hitungan ada di builder, bukan di sini.
    const report = buildSalesCommissionRecap(
      [{ salesEmployeeId: 1, salesEmployeeName: "Budi", grandTotal: 1_110_000, taxAmount: 110_000, commissionPercent: 5 }],
      [{ salesEmployeeId: 1, salesEmployeeName: "Budi", returnDppTotal: 200_000, commissionPercent: 5 }],
    )
    const { container, root } = renderCard(
      <SalesCommissionCard report={report} selectedSalesEmployeeId={null} />,
    )
    const text = container.textContent ?? ""
    expect(text).toContain("Basis DPP Faktur Lunas")
    expect(text).toContain("Pengurang Retur")
    expect(text).toContain("Estimasi Komisi Bersih")
    expect(text).toContain("Rp 1.110.000")
    expect(text).toContain("Rp 1.000.000")
    expect(text).toContain("Rp 50.000")
    expect(text).toContain("Rp 10.000")
    expect(text).toContain("Rp 40.000")
    expect(text).toContain("Total Basis DPP Faktur Lunas")
    expect(text).toContain("Total Pengurang Retur")
    expect(text).toContain("Total Estimasi Komisi Bersih")
    unmountCard(root)
  })
})
