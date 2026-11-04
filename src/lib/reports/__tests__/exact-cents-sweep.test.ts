import { describe, expect, it } from "vitest"

import { buildAssetRegister } from "../asset-register"
import { buildBankTransactionReconciliation } from "../bank-transaction-reconciliation"
import { buildEquityChanges, buildEquityChangesTable } from "../equity-changes"

const asOf = new Date("2026-10-31")

describe("formatAccountingExact sweep: nominal bersen tidak dibulatkan", () => {
  it("register aset: total kategori = jumlah baris yang tercetak", () => {
    const result = buildAssetRegister({
      assets: [
        { id: 1, code: "A", name: "Aset A", categoryName: "Kat", purchaseDate: new Date("2024-01-01"), purchaseCost: 1_000_000.5, status: "active" },
        { id: 2, code: "B", name: "Aset B", categoryName: "Kat", purchaseDate: new Date("2024-01-01"), purchaseCost: 1_000_000.5, status: "active" },
      ],
      entries: [],
      journals: [],
      asOf,
    })

    const data = result.table.rows.filter((row) => row.kind === "data")
    const total = result.table.rows.filter((row) => row.kind === "total")
    const printedRows = data.map((row) => (row.kind === "data" ? row.cells : []))
    expect(printedRows.some((cells) => cells.includes("1.000.000,50"))).toBe(true)
    expect(total.some((row) => row.kind === "total" && row.cells.includes("2.000.001"))).toBe(true)
  })

  it("ekuitas: saldo baris ber-sen tampil hingga sen", () => {
    const table = buildEquityChangesTable(
      buildEquityChanges(
        [{ id: 1, code: "300001", name: "Modal", opening: 1_000_000.5, movement: 500_000.25, closing: 1_500_000.75 }],
        0,
      ),
    )

    const data = table.rows.find((row) => row.kind === "data")
    expect(data?.kind === "data" ? data.cells : []).toEqual([
      "Modal",
      "300001",
      "1.000.000,50",
      "500.000,25",
      "1.500.000,75",
    ])
  })

  it("rekonsiliasi transaksi bank: subtotal = jumlah baris", () => {
    const result = buildBankTransactionReconciliation([
      { date: asOf, accountLabel: "Bank", description: null, reference: "A", inflow: 1_000_000.5, outflow: 0, reconciled: true },
      { date: asOf, accountLabel: "Bank", description: null, reference: "B", inflow: 1_000_000.5, outflow: 0, reconciled: true },
    ])

    const rows = result.table.rows.filter((row) => row.kind === "data")
    expect(rows.map((row) => (row.kind === "data" ? row.cells[4] : ""))).toEqual([
      "1.000.000,50",
      "1.000.000,50",
    ])
    const subtotal = result.table.rows.find((row) => row.kind === "total")
    expect(subtotal?.kind === "total" ? subtotal.cells : []).toEqual(["2.000.001", "0"])
  })
})

import { buildStockCount } from "../stock-count"
import { buildTransferInTransit } from "../transfer-in-transit"

describe("sapuan kedua: nilai selisih dan transfer bersen", () => {
  it("stock count: nilai selisih bersen tampil hingga sen", () => {
    const items = [
      { sku: "A", name: "A", systemQty: 2, actualQty: 0, unit: "PCS", unitCost: 1_000_000.55 },
      { sku: "B", name: "B", systemQty: 2, actualQty: 0, unit: "PCS", unitCost: 1_000_000.55 },
    ]
    const result = buildStockCount({
      documents: [
        { documentNo: "SA-1", date: new Date("2026-10-05"), warehouseName: "GU", status: "approved", items },
      ],
      start: new Date("2026-10-01"),
      end: new Date("2026-10-31T23:59:59"),
    })

    const total = result.table.rows.filter((row) => row.kind === "total")
    expect(total[total.length - 1].cells).toEqual(["(4.000.002,20)"])
  })

  it("transfer in transit: nilai per baris ber-sen tampil hingga sen", () => {
    const result = buildTransferInTransit({
      transfers: [
        {
          documentNo: "TRF-1",
          date: new Date("2026-10-20T00:00:00.000Z"),
          sourceName: "Gudang Utama",
          destinationName: "Bengkel",
          items: [{ sku: "BRG-1", name: "Busi", unit: "PCS", qty: 1, unitCost: 1_000_000.5 }],
        },
      ],
      asOf: new Date("2026-10-31T00:00:00.000Z"),
      periodEndIsToday: true,
    })

    const cells = result.table.rows
      .filter((row) => row.kind === "data")
      .flatMap((row) => (row.kind === "data" ? row.cells : []))
    expect(cells.join(" ")).toContain("1.000.000,50")
  })
})

import { buildAssetMovement } from "../asset-movement"
import { buildInventoryReconciliation } from "../inventory-reconciliation"

describe("sapuan ketiga: baris mutasi aset & rekonsiliasi persediaan", () => {
  it("mutasi aset: baris kategori ber-sen tampil hingga sen, sejajar total", () => {
    const result = buildAssetMovement({
      assets: [
        {
          id: 1, code: "A", name: "Aset A", categoryName: "Kat",
          purchaseDate: new Date("2024-01-01"), purchaseCost: 1_000_000.5, status: "active",
        },
      ],
      entries: [],
      journals: [],
      start: new Date("2026-10-01"),
      end: new Date("2026-10-31T23:59:59"),
    } as never)

    const cells = result.table.rows
      .filter((row) => row.kind === "data")
      .flatMap((row) => (row.kind === "data" ? row.cells : []))
    expect(cells.join(" ")).toContain("1.000.000,50")
  })

  it("rekonsiliasi persediaan: nilai barang bersen tampil hingga sen", () => {
    const result = buildInventoryReconciliation({
      valuation: { qty: 1, value: 100.3, byWarehouse: [] },
      ledger: { accountLabel: "1-1300 Persediaan", balance: 99.8 },
      periodEndIsToday: true,
    })

    const nilaiBarang = result.table.rows.find((row) => row.kind === "data")
    expect(nilaiBarang?.kind === "data" ? nilaiBarang.cells : []).toEqual([
      "Nilai barang menurut lapisan persediaan",
      "100,30",
    ])
    expect(result.totals.isBalanced).toBe(false)
  })
})

import { readFileSync } from "node:fs"
import path from "node:path"

describe("sapuan keempat: buku pembantu piutang/utang", () => {
  it("komponen buku pembantu hanya memakai formatter exact untuk nominal", () => {
    const source = readFileSync(
      path.resolve(__dirname, "../../../app/(dashboard)/laporan/_components/subledger-report.tsx"),
      "utf8",
    )
    // Saldo/mutasi buku pembantu dihitung safeAdd dua desimal; formatter 0
    // desimal akan membuang sen di KPI, baris, dan baris total.
    expect(source).not.toMatch(/formatAccounting\((?!Exact)/)
    expect(source).toContain("formatAccountingExact")
  })
})

describe("sapuan kelima: rekonsiliasi bank", () => {
  it("halaman rekonsiliasi memakai formatter exact untuk saldo dan selisih", () => {
    for (const rel of [
      "src/app/(dashboard)/keuangan/rekonsiliasi-bank/page.tsx",
      "src/app/(dashboard)/keuangan/rekonsiliasi-bank/[slug]/page.tsx",
    ]) {
      const source = readFileSync(path.resolve(process.cwd(), rel), "utf8")
      // Saldo/selisih rekonsiliasi dibandingkan pada toleransi 0,01; formatter
      // 0 desimal menyembunyikan selisih yang justru menjadi alasan pemeriksaan.
      expect(source, rel).not.toMatch(/formatCurrency\((?!Exact)/)
      expect(source, rel).toContain("formatCurrencyExact")
    }
  })
})

describe("sapuan keenam: kas kecil dan pengeluaran", () => {
  it("halaman/tabel kas kecil & pengeluaran memakai formatter exact", () => {
    for (const rel of [
      "src/app/(dashboard)/keuangan/kas-kecil/page.tsx",
      "src/app/(dashboard)/keuangan/kas-kecil/[slug]/page.tsx",
      "src/app/(dashboard)/keuangan/kas-kecil/_components/petty-cash-table.tsx",
      "src/app/(dashboard)/keuangan/pengeluaran/[slug]/page.tsx",
      "src/app/(dashboard)/keuangan/pengeluaran/_components/expense-table.tsx",
    ]) {
      const source = readFileSync(path.resolve(process.cwd(), rel), "utf8")
      expect(source, rel).not.toMatch(/formatCurrency\((?!Exact)/)
      expect(source, rel).toContain("formatCurrencyExact")
    }
  })
})

describe("sapuan ketujuh: detail aset dan rekening koran", () => {
  it("detail aset & rekening koran memakai formatter currency exact", () => {
    for (const rel of [
      "src/app/(dashboard)/aset/[slug]/page.tsx",
      "src/app/(dashboard)/keuangan/laporan-bank/[slug]/page.tsx",
    ]) {
      const source = readFileSync(path.resolve(process.cwd(), rel), "utf8")
      expect(source, rel).not.toMatch(/formatCurrency\((?!Exact)/)
      expect(source, rel).toContain("formatCurrencyExact")
    }
  })
})

describe("sapuan kedelapan: penutupan buku & rekap pinjaman", () => {
  it("panel penutupan buku & rekap pinjaman memakai formatter currency exact", () => {
    for (const rel of [
      "src/app/(dashboard)/pengaturan/proses-akhir-bulan/_components/year-end-closing-panel.tsx",
      "src/app/(dashboard)/sdm/pinjaman/_components/employee-loan-recap-table.tsx",
    ]) {
      const source = readFileSync(path.resolve(process.cwd(), rel), "utf8")
      expect(source, rel).not.toMatch(/formatCurrency\((?!Exact)/)
      expect(source, rel).toContain("formatCurrencyExact")
    }
  })
})

describe("sapuan kesembilan: slip gaji karyawan", () => {
  it("halaman slip gaji memakai formatter currency exact", () => {
    const rel = "src/app/(dashboard)/sdm/slip-gaji-saya/[slug]/page.tsx"
    const source = readFileSync(path.resolve(process.cwd(), rel), "utf8")
    expect(source, rel).not.toMatch(/formatCurrency\((?!Exact)/)
    expect(source, rel).toContain("formatCurrencyExact")
  })
})

describe("sapuan kesepuluh: detail dokumen penjualan/pembelian", () => {
  it("halaman detail dokumen memakai formatter currency exact", () => {
    for (const rel of [
      "src/app/(dashboard)/penjualan/penawaran/[slug]/page.tsx",
      "src/app/(dashboard)/penjualan/pesanan/[slug]/page.tsx",
      "src/app/(dashboard)/penjualan/faktur/[slug]/page.tsx",
      "src/app/(dashboard)/pembelian/pesanan/[slug]/page.tsx",
      "src/app/(dashboard)/pembelian/tagihan/[slug]/page.tsx",
    ]) {
      const source = readFileSync(path.resolve(process.cwd(), rel), "utf8")
      expect(source, rel).not.toMatch(/formatCurrency\((?!Exact)/)
      expect(source, rel).toContain("formatCurrencyExact")
    }
  })
})

describe("sapuan kesebelas: produksi, penerimaan, pinjaman, payroll", () => {
  it("halaman/komponen terkait memakai formatter currency exact", () => {
    for (const rel of [
      "src/app/(dashboard)/produksi/production-orders/[slug]/page.tsx",
      "src/app/(dashboard)/produksi/production-orders/_components/production-cost-section.tsx",
      "src/app/(dashboard)/produksi/perintah-kerja/[slug]/page.tsx",
      "src/app/(dashboard)/pembelian/penerimaan/[slug]/page.tsx",
      "src/app/(dashboard)/pembelian/pembayaran-vendor/[slug]/page.tsx",
      "src/app/(dashboard)/sdm/pinjaman/[slug]/page.tsx",
      "src/app/(dashboard)/sdm/pinjaman/_components/loan-installment-history-section.tsx",
      "src/app/(dashboard)/sdm/pinjaman/_components/loan-table.tsx",
      "src/app/(dashboard)/sdm/penggajian/_components/payroll-table.tsx",
    ]) {
      const source = readFileSync(path.resolve(process.cwd(), rel), "utf8")
      expect(source, rel).not.toMatch(/formatCurrency\((?!Exact)/)
      expect(source, rel).toContain("formatCurrencyExact")
    }
  })
})

describe("sapuan kedua belas: dokumen pajak dan sengketa pajak", () => {
  it("halaman dokumen/sengketa pajak memakai formatter currency exact", () => {
    for (const rel of [
      "src/app/(dashboard)/keuangan/dokumen-pajak/faktur/tambah/page.tsx",
      "src/app/(dashboard)/keuangan/dokumen-pajak/bupot/tambah/page.tsx",
      "src/app/(dashboard)/keuangan/dokumen-pajak/_components/down-payment-tax-panel.tsx",
      "src/app/(dashboard)/keuangan/sengketa-pajak/page.tsx",
      "src/app/(dashboard)/keuangan/sengketa-pajak/[slug]/page.tsx",
      "src/app/(dashboard)/keuangan/sengketa-pajak/_components/tax-dispute-register-table.tsx",
    ]) {
      const source = readFileSync(path.resolve(process.cwd(), rel), "utf8")
      expect(source, rel).not.toMatch(/formatCurrency\((?!Exact)/)
      expect(source, rel).toContain("formatCurrencyExact")
    }
  })
})

describe("sapuan ketiga belas: master karyawan/barang/vendor/pelanggan", () => {
  it("halaman detail master memakai formatter currency exact", () => {
    for (const rel of [
      "src/app/(dashboard)/master/karyawan/[slug]/page.tsx",
      "src/app/(dashboard)/master/barang/[slug]/page.tsx",
      "src/app/(dashboard)/master/vendor/[slug]/page.tsx",
      "src/app/(dashboard)/master/pelanggan/[slug]/page.tsx",
    ]) {
      const source = readFileSync(path.resolve(process.cwd(), rel), "utf8")
      expect(source, rel).not.toMatch(/formatCurrency\((?!Exact)/)
      expect(source, rel).toContain("formatCurrencyExact")
    }
  })
})

describe("sapuan keempat belas: dashboard, proyek, kalender", () => {
  it("halaman dashboard/proyek/kalender memakai formatter currency exact", () => {
    for (const rel of [
      "src/app/(dashboard)/page.tsx",
      "src/app/(dashboard)/proyek/[slug]/page.tsx",
      "src/app/(dashboard)/kalender/[[...segments]]/page.tsx",
    ]) {
      const source = readFileSync(path.resolve(process.cwd(), rel), "utf8")
      expect(source, rel).not.toMatch(/formatCurrency\((?!Exact)/)
      expect(source, rel).toContain("formatCurrencyExact")
    }
  })
})

describe("sapuan kelima belas: tabel daftar penjualan/pembelian/aset/barang", () => {
  it("tabel daftar dokumen memakai formatter currency exact", () => {
    for (const rel of [
      "src/app/(dashboard)/penjualan/penawaran/_components/quotation-table.tsx",
      "src/app/(dashboard)/penjualan/pesanan/_components/order-table.tsx",
      "src/app/(dashboard)/penjualan/faktur/_components/invoice-table.tsx",
      "src/app/(dashboard)/penjualan/pembayaran/_components/payment-table.tsx",
      "src/app/(dashboard)/penjualan/harga-pelanggan/_components/customer-price-table.tsx",
      "src/app/(dashboard)/pembelian/pesanan/_components/purchase-order-table.tsx",
      "src/app/(dashboard)/pembelian/tagihan/_components/vendor-bill-table.tsx",
      "src/app/(dashboard)/pembelian/pembayaran-vendor/_components/vendor-payment-table.tsx",
      "src/app/(dashboard)/aset/_components/asset-table.tsx",
      "src/app/(dashboard)/aset/_components/asset-acquisition.tsx",
      "src/app/(dashboard)/aset/_components/asset-use-status.tsx",
      "src/app/(dashboard)/aset/_components/asset-analytical-status.tsx",
      "src/app/(dashboard)/aset/[slug]/_components/asset-change-event-panel.tsx",
      "src/app/(dashboard)/master/barang/_components/item-table.tsx",
    ]) {
      const source = readFileSync(path.resolve(process.cwd(), rel), "utf8")
      expect(source, rel).not.toMatch(/formatCurrency\((?!Exact)/)
      expect(source, rel).toContain("formatCurrencyExact")
    }
  })
})

describe("sapuan keenam belas: halaman detail dokumen & inventaris", () => {
  it("halaman detail/daftar terkait memakai formatter currency exact", () => {
    for (const rel of [
      "src/app/(dashboard)/inventaris/mutasi-stok/[slug]/page.tsx",
      "src/app/(dashboard)/inventaris/pengeluaran-material/[slug]/page.tsx",
      "src/app/(dashboard)/keuangan/jurnal/[slug]/page.tsx",
      "src/app/(dashboard)/laporan/aset-tetap/[[...segments]]/page.tsx",
      "src/app/(dashboard)/laporan/bukti-potong-pph/[[...segments]]/page.tsx",
      "src/app/(dashboard)/laporan/penerimaan-belum-ditagih/[[...segments]]/page.tsx",
      "src/app/(dashboard)/laporan/proyeksi-kas/[[...segments]]/page.tsx",
      "src/app/(dashboard)/master/karyawan/_components/salary-adjustment-panel.tsx",
      "src/app/(dashboard)/master/pelanggan/[slug]/kendaraan/[vehicleSlug]/page.tsx",
      "src/app/(dashboard)/pembelian/perintah-pembayaran/[[...segments]]/page.tsx",
      "src/app/(dashboard)/pembelian/retur/[slug]/page.tsx",
      "src/app/(dashboard)/pembelian/transfer-pemasok/_components/vendor-transfer-panel.tsx",
      "src/app/(dashboard)/penjualan/pembayaran/[slug]/page.tsx",
      "src/app/(dashboard)/penjualan/retur/[slug]/page.tsx",
      "src/app/(dashboard)/penjualan/tukar-faktur/_components/invoice-exchange-form.tsx",
      "src/app/(dashboard)/penjualan/uang-muka/_components/down-payment-table.tsx",
      "src/app/(dashboard)/penjualan/uang-muka/_components/down-payment-vat-snapshot.tsx",
      "src/app/(dashboard)/penjualan/uang-muka/[slug]/page.tsx",
      "src/app/(dashboard)/produksi/perintah-kerja/[slug]/_components/create-service-po-button.tsx",
      "src/app/(dashboard)/produksi/perintah-kerja/[slug]/_components/job-change-order-panel.tsx",
      "src/app/(dashboard)/proyek/[slug]/_components/project-budget-editor.tsx",
    ]) {
      const source = readFileSync(path.resolve(process.cwd(), rel), "utf8")
      expect(source, rel).not.toMatch(/formatCurrency\((?!Exact)/)
      expect(source, rel).toContain("formatCurrencyExact")
    }
  })
})

describe("sapuan ketujuh belas: SDM, dashboard, form", () => {
  it("komponen terkait memakai formatter currency exact", () => {
    for (const rel of [
      "src/app/(dashboard)/sdm/apresiasi/_components/appreciation-table.tsx",
      "src/app/(dashboard)/sdm/apresiasi/[slug]/page.tsx",
      "src/app/(dashboard)/sdm/klaim-reimbursement/_components/my-reimbursement-claims-table.tsx",
      "src/app/(dashboard)/sdm/lembur/[slug]/_components/overtime-base-snapshot-fields.tsx",
      "src/app/(dashboard)/sdm/lembur/[slug]/page.tsx",
      "src/app/(dashboard)/sdm/slip-gaji-saya/_components/own-payslip-table.tsx",
      "src/components/dashboard/finance-dashboard.tsx",
      "src/components/dashboard/purchase-dashboard.tsx",
      "src/components/forms/credit-override-panel.tsx",
      "src/components/forms/goods-receipt-form.tsx",
      "src/components/forms/item-form.tsx",
      "src/components/forms/quotation-form.tsx",
      "src/components/forms/sales-invoice-form.tsx",
      "src/components/ui/invoice-items-editor.tsx",
      "src/components/sdm/loan-cash-repayment-form.tsx",
      "src/components/sdm/loan-write-off-button.tsx",
    ]) {
      const source = readFileSync(path.resolve(process.cwd(), rel), "utf8")
      expect(source, rel).not.toMatch(/formatCurrency\((?!Exact)/)
      expect(source, rel).toContain("formatCurrencyExact")
    }
  })
})

describe("sapuan kedelapan belas: payroll dan kartu laporan", () => {
  it("komponen payroll dan kartu laporan memakai formatter currency exact", () => {
    for (const rel of [
      "src/components/payroll/employee-payroll-components.tsx",
      "src/components/payroll/payroll-bpjs-aggregate-snapshot.tsx",
      "src/components/payroll/payroll-commission-lines.tsx",
      "src/components/payroll/payroll-component-lines.tsx",
      "src/components/payroll/pkwt-compensation-panel.tsx",
      "src/components/reports/dp-queue-row.tsx",
      "src/components/reports/lead-priority-queue-card.tsx",
      "src/components/reports/quotation-approval-gate-card.tsx",
      "src/components/reports/quotation-draft-queue-card.tsx",
      "src/components/reports/quotation-queue-cells.tsx",
      "src/components/reports/sales-late-fee-panel.tsx",
      "src/components/reports/sales-target-achievement-card.tsx",
      "src/components/reports/sales-target-manage-panel.tsx",
      "src/components/reports/sales-target-reconciliation-card.tsx",
      "src/components/reports/tax-invoice-draft-queue-card.tsx",
      "src/components/reports/vendor-payment-draft-queue-card.tsx",
      "src/components/reports/wip-aging-card.tsx",
      "src/components/reports/work-order-load-card.tsx",
      "src/components/reports/workshop-closeout-queue-card.tsx",
    ]) {
      const source = readFileSync(path.resolve(process.cwd(), rel), "utf8")
      expect(source, rel).not.toMatch(/formatCurrency\((?!Exact)/)
      expect(source, rel).toContain("formatCurrencyExact")
    }
  })
})
