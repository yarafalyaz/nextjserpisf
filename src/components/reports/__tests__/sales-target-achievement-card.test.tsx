// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest"

import { SalesTargetAchievementCard } from "../sales-target-achievement-card"
import { SalesTargetReconciliationCard } from "../sales-target-reconciliation-card"
import {
  buildSalesTargetAchievement,
  buildSalesTargetPeriodReconciliation,
  SALES_TARGET_NOTICE,
} from "@/lib/reports/sales-target-achievement"
import { renderCard, unmountCard, clearRenderedCards } from "./card-test-utils"

afterEach(() => {
  clearRenderedCards()
})

const RANGE = { start: new Date("2026-10-01T00:00:00Z"), end: new Date("2026-10-31T23:59:59Z") }

function reportExample() {
  return buildSalesTargetAchievement({
    range: RANGE,
    targets: [
      {
        id: 1,
        salesEmployeeId: 2,
        salesEmployeeName: "Sari",
        periodStart: new Date("2026-10-01T00:00:00Z"),
        periodEnd: new Date("2026-10-31T00:00:00Z"),
        targetAmount: 1_000_000,
        notes: null,
        modifiedAfterPeriodStartAt: null,
      },
      {
        id: 2,
        salesEmployeeId: 1,
        salesEmployeeName: "Budi",
        periodStart: new Date("2026-09-15T00:00:00Z"),
        periodEnd: new Date("2026-10-15T00:00:00Z"),
        targetAmount: 2_000_000,
        notes: null,
        modifiedAfterPeriodStartAt: new Date("2026-10-05T00:00:00Z"),
      },
    ],
    invoices: [
      { salesEmployeeId: 2, salesEmployeeName: "Sari", date: new Date("2026-10-10T00:00:00Z"), grandTotal: 750_000 },
      { salesEmployeeId: 1, salesEmployeeName: "Budi", date: new Date("2026-10-10T00:00:00Z"), grandTotal: 500_000 },
      { salesEmployeeId: 3, salesEmployeeName: "Citra", date: new Date("2026-10-12T00:00:00Z"), grandTotal: 300_000 },
      { salesEmployeeId: null, salesEmployeeName: null, date: new Date("2026-10-12T00:00:00Z"), grandTotal: 200_000 },
    ],
  })
}

function targetRow(container: HTMLElement, name: string) {
  const row = [...container.querySelectorAll("tbody tr")].find((tr) =>
    (tr.textContent ?? "").includes(name),
  )
  if (!row) throw new Error(`Baris tidak ditemukan: ${name}`)
  return [...row.querySelectorAll("td")].map((td) => td.textContent ?? "")
}

function reportWithReturns() {
  return buildSalesTargetAchievement({
    range: RANGE,
    targets: [
      {
        id: 1,
        salesEmployeeId: 2,
        salesEmployeeName: "Sari",
        periodStart: new Date("2026-10-01T00:00:00Z"),
        periodEnd: new Date("2026-10-31T00:00:00Z"),
        targetAmount: 1_000_000,
        notes: null,
        modifiedAfterPeriodStartAt: null,
      },
    ],
    invoices: [
      {
        id: 11,
        salesEmployeeId: 2,
        salesEmployeeName: "Sari",
        date: new Date("2026-10-10T00:00:00Z"),
        grandTotal: 750_000,
        subtotal: 750_000,
        discount: 0,
        taxAmount: 0,
      },
    ],
    returns: [
      {
        id: 51,
        date: new Date("2026-10-15T00:00:00Z"),
        salesInvoiceId: 11,
        lines: [{ qty: 1, price: 200_000, returnDpp: 200_000, returnVat: 0 }],
      },
    ],
  })
}

describe("SalesTargetAchievementCard F-2026-10-22-088-S", () => {
  it("kolom verbatim + notice verbatim + angka builder persis", () => {
    const { container, root } = renderCard(<SalesTargetAchievementCard report={reportExample()} />)
    const text = container.textContent ?? ""
    expect(text).toContain(SALES_TARGET_NOTICE)
    expect(text).toContain(
      "Laporan informatif dari snapshot penjual di faktur lunas — bukan dasar bonus, jurnal, atau pembayaran. Retur penjualan selesai (completed) mengurangi pencapaian pada periode tanggal retur.",
    )
    expect(
      container.querySelector("[data-report-narration]")?.getAttribute("data-report-narration"),
    ).toBe(SALES_TARGET_NOTICE)
    for (const col of ["Penjual", "Periode Target", "Target (Rp)", "Bruto Lunas (Rp)", "Retur (Rp)", "Pencapaian Neto (Rp)", "Pencapaian (%)", "Selisih (Rp)", "Faktur Lunas"]) {
      expect(text).toContain(col)
    }
    expect(text).toContain("Sari")
    expect(text).toContain("Rp 750.000")
    expect(text).toContain("75,00%")
    expect(text).toContain("Rp -250.000")
    // Tanpa retur: komponen retur tampil Rp 0 dari builder, neto = bruto.
    expect(targetRow(container, "Sari")).toEqual([
      "Sari",
      "01/10/2026 – 31/10/2026",
      "Rp 1.000.000",
      "Rp 750.000",
      "Rp 0",
      "0",
      "Rp 750.000",
      "75,00%",
      "Rp -250.000",
      "1",
    ])
    unmountCard(root)
  })

  it("komponen bruto/retur/neto per sel + total, retur terhitung 1", () => {
    const { container, root } = renderCard(<SalesTargetAchievementCard report={reportWithReturns()} />)
    expect(targetRow(container, "Sari")).toEqual([
      "Sari",
      "01/10/2026 – 31/10/2026",
      "Rp 1.000.000",
      "Rp 750.000",
      "Rp 200.000",
      "1",
      "Rp 550.000",
      "55,00%",
      "Rp -450.000",
      "1",
    ])
    const foot = [...container.querySelectorAll("tfoot td")].map((td) => td.textContent ?? "")
    expect(foot).toEqual([
      "Total",
      "",
      "Rp 1.000.000",
      "Rp 750.000",
      "Rp 200.000",
      "",
      "Rp 550.000",
      "55,00%",
      "",
      "",
    ])
    unmountCard(root)
  })

  it("neto negatif tampil negatif per sel, tidak di-floor ke 0", () => {
    const report = buildSalesTargetAchievement({
      range: RANGE,
      targets: [
        {
          id: 1,
          salesEmployeeId: 2,
          salesEmployeeName: "Sari",
          periodStart: new Date("2026-10-01T00:00:00Z"),
          periodEnd: new Date("2026-10-31T00:00:00Z"),
          targetAmount: 1_000_000,
          notes: null,
          modifiedAfterPeriodStartAt: null,
        },
      ],
      invoices: [
        {
          id: 11,
          salesEmployeeId: 2,
          salesEmployeeName: "Sari",
          date: new Date("2026-10-10T00:00:00Z"),
          grandTotal: 100_000,
          subtotal: 100_000,
          discount: 0,
          taxAmount: 0,
        },
        {
          id: 12,
          salesEmployeeId: 2,
          salesEmployeeName: "Sari",
          date: new Date("2026-09-10T00:00:00Z"),
          grandTotal: 500_000,
          subtotal: 500_000,
          discount: 0,
          taxAmount: 0,
        },
      ],
      returns: [
        {
          id: 52,
          date: new Date("2026-10-15T00:00:00Z"),
          salesInvoiceId: 12,
          lines: [{ qty: 1, price: 400_000, returnDpp: 400_000, returnVat: 0 }],
        },
      ],
    })
    const { container, root } = renderCard(<SalesTargetAchievementCard report={report} />)
    const cells = targetRow(container, "Sari")
    expect(cells[3]).toBe("Rp 100.000")
    expect(cells[4]).toBe("Rp 400.000")
    expect(cells[6]).toBe("Rp -300.000")
    expect(cells[6]).not.toBe("Rp 0")
    unmountCard(root)
  })

  it("temuan plafon bernama tampil; tanpa temuan seksi absen", () => {
    const clamped = buildSalesTargetAchievement({
      range: RANGE,
      targets: [
        {
          id: 1,
          salesEmployeeId: 2,
          salesEmployeeName: "Sari",
          periodStart: new Date("2026-10-01T00:00:00Z"),
          periodEnd: new Date("2026-10-31T00:00:00Z"),
          targetAmount: 20_000_000,
          notes: null,
          modifiedAfterPeriodStartAt: null,
        },
      ],
      invoices: [
        {
          id: 301,
          salesEmployeeId: 2,
          salesEmployeeName: "Sari",
          date: new Date("2026-10-10T00:00:00Z"),
          grandTotal: 11_100_000,
          subtotal: 10_000_000,
          discount: 0,
          taxAmount: 1_100_000,
        },
      ],
      returns: [
        {
          id: 53,
          date: new Date("2026-10-15T00:00:00Z"),
          salesInvoiceId: 301,
          lines: [{ qty: 1, price: 12_210_000, returnDpp: 11_100_000, returnVat: 1_110_000 }],
        },
      ],
    })
    const { container, root } = renderCard(<SalesTargetAchievementCard report={clamped} />)
    const text = container.textContent ?? ""
    expect(text).toContain("Temuan plafon pengurang per faktur")
    expect(text).toContain("Faktur #301")
    expect(text).toContain("Rp 12.210.000")
    expect(text).toContain("Rp 11.100.000")
    unmountCard(root)

    const clean = renderCard(<SalesTargetAchievementCard report={reportWithReturns()} />)
    expect(clean.container.textContent ?? "").not.toContain("Temuan plafon pengurang per faktur")
    unmountCard(clean.root)
  })

  it("periode tidak utuh: lencana verbatim + persen/selisih kosong bukan 0%", () => {
    const { container, root } = renderCard(<SalesTargetAchievementCard report={reportExample()} />)
    const text = container.textContent ?? ""
    expect(text).toContain("Periode target tidak utuh — persen tidak dihitung")
    expect(text).toContain("Target diubah 05/10/2026")
    // Budi persen null -> sel persennya kosong; persen tampil hanya Sari + total perusahaan.
    const percents = [...container.querySelectorAll("td")].map((td) => td.textContent ?? "").filter((t) => t.includes("%"))
    expect(percents).toEqual(["75,00%", "75,00%"])
    unmountCard(root)
  })

  it("tanpa target + ember tanpa penjual verbatim, persen kosong", () => {
    const { container, root } = renderCard(<SalesTargetAchievementCard report={reportExample()} />)
    const text = container.textContent ?? ""
    expect(text).toContain("Citra")
    expect(text).toContain("Tanpa target")
    expect(text).toContain("Tanpa penjual (dokumen lama)")
    expect(text).toContain("Rp 300.000")
    expect(text).toContain("Rp 200.000")
    unmountCard(root)
  })

  it("kosong: notice tetap + teks kosong, tanpa tabel", () => {
    const empty = buildSalesTargetAchievement({ range: RANGE, targets: [], invoices: [] })
    const { container, root } = renderCard(<SalesTargetAchievementCard report={empty} />)
    const text = container.textContent ?? ""
    expect(text).toContain(SALES_TARGET_NOTICE)
    expect(text).toContain("Tidak ada target atau faktur lunas pada masa ini.")
    expect(container.querySelector("table")).toBeNull()
    unmountCard(root)
  })

  it("tanpa kata bonus/insentif terutang sebagai klaim UI", () => {
    const { container, root } = renderCard(<SalesTargetAchievementCard report={reportExample()} />)
    const text = container.textContent ?? ""
    expect(text).not.toMatch(/insentif terutang|bonus terutang/i)
    unmountCard(root)
  })
})

describe("SalesTargetAchievementCard legacy F-131-V MEDIUM-1", () => {
  it("penanda per baris + nominal legacy + rincian legacyReturns; baris snapshot murni absen", () => {
    const report = buildSalesTargetAchievement({
      range: RANGE,
      targets: [
        {
          id: 1,
          salesEmployeeId: 2,
          salesEmployeeName: "Sari",
          periodStart: new Date("2026-10-01T00:00:00Z"),
          periodEnd: new Date("2026-10-31T00:00:00Z"),
          targetAmount: 1_000_000,
          notes: null,
          modifiedAfterPeriodStartAt: null,
        },
      ],
      invoices: [
        {
          id: 11,
          salesEmployeeId: 2,
          salesEmployeeName: "Sari",
          date: new Date("2026-10-10T00:00:00Z"),
          grandTotal: 1_110_000,
          subtotal: 1_000_000,
          discount: 0,
          taxAmount: 110_000,
        },
      ],
      returns: [
        {
          id: 61,
          date: new Date("2026-10-15T00:00:00Z"),
          salesInvoiceId: 11,
          // Baris legacy: tanpa snapshot returnDpp/returnVat -> 2 x Rp 50.000 = Rp 100.000 DPP + PPN 11% = Rp 111.000.
          lines: [{ qty: 2, price: 50_000, returnDpp: null, returnVat: null }],
        },
      ],
    })
    expect(report.rows[0].hasLegacyReturnLines).toBe(true)
    expect(report.rows[0].legacyReturnDeductionAmount).toBe(111_000)
    expect(report.legacyReturns).toEqual([
      { returnId: 61, salesInvoiceId: 11, salesEmployeeId: 2, label: "legacy", deductionAmount: 111_000 },
    ])
    const { container, root } = renderCard(<SalesTargetAchievementCard report={report} />)
    const text = container.textContent ?? ""
    expect(text).toContain("Retur legacy: Rp 111.000")
    expect(text).toContain("Retur berbaris legacy")
    expect(text).toContain("Retur #61 (Faktur #11): legacy Rp 111.000.")
    // Angka neto tetap dari builder, UI tidak hitung ulang.
    expect(targetRow(container, "Sari")[6]).toBe("Rp 999.000")
    unmountCard(root)

    const clean = renderCard(<SalesTargetAchievementCard report={reportWithReturns()} />)
    const cleanText = clean.container.textContent ?? ""
    expect(cleanText).not.toContain("legacy")
    expect(cleanText).not.toContain("Retur berbaris legacy")
    unmountCard(clean.root)
  })

  it("ember tanpa penjual berlegacy: penanda legacy tampil di baris unattributed", () => {
    const report = buildSalesTargetAchievement({
      range: RANGE,
      targets: [],
      invoices: [
        {
          id: 21,
          salesEmployeeId: null,
          salesEmployeeName: null,
          date: new Date("2026-10-10T00:00:00Z"),
          grandTotal: 555_000,
          subtotal: 500_000,
          discount: 0,
          taxAmount: 55_000,
        },
      ],
      returns: [
        {
          id: 62,
          date: new Date("2026-10-15T00:00:00Z"),
          salesInvoiceId: 21,
          lines: [{ qty: 1, price: 100_000, returnDpp: null, returnVat: null }],
        },
      ],
    })
    expect(report.unattributed.hasLegacyReturnLines).toBe(true)
    expect(report.unattributed.legacyReturnDeductionAmount).toBe(111_000)
    const { container, root } = renderCard(<SalesTargetAchievementCard report={report} />)
    const text = container.textContent ?? ""
    expect(text).toContain("Tanpa penjual (dokumen lama)")
    expect(text).toContain("Retur legacy: Rp 111.000")
    unmountCard(root)
  })
})

describe("SalesTargetReconciliationCard F-2026-10-24-131-V", () => {
  function reconciliationExample() {
    const report = reportWithReturns()
    const reconciliation = buildSalesTargetPeriodReconciliation({
      achievement: report,
      invoices: [
        {
          id: 11,
          salesEmployeeId: 2,
          salesEmployeeName: "Sari",
          date: new Date("2026-10-10T00:00:00Z"),
          grandTotal: 750_000,
          subtotal: 750_000,
          discount: 0,
          taxAmount: 0,
        },
      ],
      commissionRows: [{ salesEmployeeId: 2, paidBase: 750_000 }],
      independentReturns: [
        {
          salesInvoiceId: 11,
          salesEmployeeId: 2,
          lines: [{ returnDpp: 200_000, returnVat: 0, qty: 1, price: 200_000 }],
        },
      ],
      postedJournalReturn: { debitAmount: 150_000 },
    })
    return { report, reconciliation }
  }

  it("tiga arah per sel + kaki jurnal + temuan jurnal verbatim builder", () => {
    const { report, reconciliation } = reconciliationExample()
    // Builder menghasilkan 1 temuan jurnal (200rb vs 150rb); UI menempel apa adanya.
    expect(reconciliation.findings).toHaveLength(1)
    const { container, root } = renderCard(
      <SalesTargetReconciliationCard reconciliation={reconciliation} report={report} />,
    )
    const text = container.textContent ?? ""
    expect(text).toContain("Rekonsiliasi Target Penjualan")
    expect(targetRow(container, "Sari")).toEqual([
      "Sari",
      "Rp 750.000",
      "Rp 750.000",
      "Rp 0",
      "Rp 200.000",
      "Rp 200.000",
      "Rp 0",
      "Rp 550.000",
    ])
    expect(text).toContain("Kaki Retur Penjualan jurnal retur POSTED: Rp 150.000")
    expect(text).toContain("Selisih terhadap retur read-model: Rp 50.000")
    expect(text).toContain(reconciliation.findings[0].message)
    expect(text).toContain("Temuan rekonsiliasi")
    unmountCard(root)
  })

  it("akun retur belum dipetakan: belum terukur, bukan Rp 0; tanpa temuan seksi absen", () => {
    const { report, reconciliation } = reconciliationExample()
    const unmapped = { ...reconciliation, findings: [] as typeof reconciliation.findings, totals: { ...reconciliation.totals, postedJournalReturnAmount: null, journalDifference: null } }
    const { container, root } = renderCard(
      <SalesTargetReconciliationCard reconciliation={unmapped} report={report} />,
    )
    const text = container.textContent ?? ""
    expect(text).toContain("Belum terukur — akun Retur Penjualan belum dipetakan.")
    expect(text).not.toContain("Kaki Retur Penjualan jurnal retur POSTED: Rp 0")
    expect(text).not.toContain("Temuan rekonsiliasi")
    unmountCard(root)
  })

  it("rekonsiliasi tanpa aktivitas: baris tanpa-penjual nol dari builder tampil apa adanya", () => {
    const report = reportWithReturns()
    const empty = buildSalesTargetPeriodReconciliation({
      achievement: buildSalesTargetAchievement({ range: RANGE, targets: [], invoices: [] }),
      invoices: [],
      commissionRows: [],
      independentReturns: [],
      postedJournalReturn: null,
    })
    // Builder tetap menghasilkan ember tanpa-penjual bernilai 0 — UI menempel, bukan mengarang teks kosong.
    expect(empty.rows).toHaveLength(1)
    const { container, root } = renderCard(
      <SalesTargetReconciliationCard reconciliation={empty} report={report} />,
    )
    expect(targetRow(container, "Tanpa penjual (dokumen lama)")).toEqual([
      "Tanpa penjual (dokumen lama)",
      "Rp 0",
      "",
      "",
      "Rp 0",
      "Rp 0",
      "Rp 0",
      "Rp 0",
    ])
    unmountCard(root)
  })
})
