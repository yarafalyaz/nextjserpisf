/**
 * Registry laporan PDF — satu pipeline untuk semua laporan.
 *
 * Sebelumnya route `/api/pdf` menumbuhkan satu cabang `if` per laporan; menambah
 * laporan berarti mengubah route, dan judul/kop/label periode bisa menyimpang
 * antar laporan. Sekarang setiap laporan mendaftarkan dirinya di sini (judul,
 * rentang periode bawaan, dan cara memuat tabelnya), dan route tinggal menjalankan
 * pipeline yang sama: parse periode → muat payload → gambar dokumen → kirim berkas.
 *
 * Standar industri yang diikuti: laporan = **dataset + layout**. Payload hanya
 * berisi tabel (data), sedangkan kop, tanda tangan, footer, dan paginasi digambar
 * engine (`render/statement` + `render/table`). Tidak ada laporan yang membaca DOM.
 */

import { parseStatementOptions } from "@/lib/reports/statement-display"
import type { ReportPdfKey } from "@/lib/reports/report-export"
import { formatPeriodLabel, type ReportPeriod } from "@/lib/reports/report-period"
import type { StatementTable } from "@/lib/reports/statement-table"
import type { TableDocument } from "@/lib/pdf/engine/types"
import {
  loadBalanceSheetStatement,
  loadIncomeStatementByCostCenter,
  loadIncomeStatementByStatus,
  loadIncomeStatementStatement,
} from "@/lib/reports/statement-data"
import { REPORT_JOURNAL_STATUSES } from "@/lib/services/report-aggregation.service"
import { loadSkontroBalanceSheet } from "@/lib/reports/skontro-data"
import { loadFinancialRatios } from "@/lib/reports/financial-ratios-data"
import { buildRatiosTable } from "@/lib/reports/ratios-table"
import { loadProfitability } from "@/lib/reports/profitability-data"
import { loadSalesProcessHistory } from "@/lib/reports/sales-process-history-data"
import {
  buildDiscountExposureTable,
  loadDiscountExposureReport,
} from "@/lib/reports/discount-exposure-export"
import { loadPurchaseProcessHistory } from "@/lib/reports/purchase-process-history-data"
import { loadPurchasesByDimension } from "@/lib/reports/purchase-by-dimension-data"
import { loadPayrollRows } from "@/lib/reports/payroll-reports-data"
import { loadPurchaseAdvances } from "@/lib/reports/purchase-advances-data"
import { loadTaxPayments } from "@/lib/reports/tax-payments-data"
import { loadInvoiceExchanges } from "@/lib/reports/invoice-exchanges-data"
import {
  buildPayrollByEmployee,
  buildPayrollComposition,
  buildPph21,
} from "@/lib/reports/payroll-reports"
import {
  PURCHASE_DIMENSIONS,
  type PurchaseDimension,
} from "@/lib/reports/purchase-by-dimension"
import {
  PROFITABILITY_DIMENSIONS,
  type ProfitabilityDimension,
} from "@/lib/reports/profitability"
import { loadEquityChanges } from "@/lib/reports/equity-changes-data"
import {
  buildEquityChanges,
  buildEquityChangesTable,
  buildRetainedEarnings,
  buildRetainedEarningsTable,
} from "@/lib/reports/equity-changes"
import {
  loadAssetMovement,
  loadAssetRegister,
  loadAssetDisposals,
  loadAssetHistory,
  loadAssetJournal,
} from "@/lib/reports/asset-reports-data"
import { loadTrialBalanceReport } from "@/lib/reports/trial-balance-data"
import {
  loadJobOrderCost,
  loadJobOrderCompletion,
  loadJobOrderJournal,
} from "@/lib/reports/job-order-data"
import { loadBankMovements } from "@/lib/reports/bank-movements-data"
import { loadProductionVariance } from "@/lib/reports/production-variance-data"
import { loadScrapMaterialReport } from "@/lib/reports/scrap-material-data"
import { buildScrapMaterialTable } from "@/lib/reports/scrap-material"
import { loadJobEstimateVsActual } from "@/lib/reports/job-estimate-vs-actual-data"
import { loadStockCount } from "@/lib/reports/stock-count-data"
import { loadPaymentExpenses } from "@/lib/reports/payment-expenses-data"
import { loadOrderFulfillment } from "@/lib/reports/order-fulfillment-data"
import { getDeliveredUnbilledQueue } from "@/lib/reports/delivered-unbilled-data"
import { buildDeliveredUnbilledTable } from "@/lib/reports/delivered-unbilled-export"
import { loadInventoryReconciliation } from "@/lib/reports/inventory-reconciliation-data"
import { loadReceivedNotBilled } from "@/lib/reports/received-not-billed-data"
import { loadTransferInTransit } from "@/lib/reports/transfer-in-transit-data"
import { loadMinStock } from "@/lib/reports/min-stock-data"
import { loadSlowMovingStock } from "@/lib/reports/slow-moving-stock-data"
import {
  buildWipAgingTable,
  loadWipAgingReport,
} from "@/lib/reports/wip-aging-export"
import {
  buildQuotationOutcomeTable,
  loadQuotationOutcomeReport,
} from "@/lib/reports/quotation-outcome-export"
import {
  buildLaborRecapTable,
  loadLaborRecapReport,
} from "@/lib/reports/labor-recap-export"
import { loadBankTransactionReconciliation } from "@/lib/reports/bank-transaction-reconciliation-data"
import { loadVatInvoices } from "@/lib/reports/vat-invoices-data"
import { loadPurchaseOutstanding } from "@/lib/reports/purchase-outstanding-data"
import { loadArApSummary } from "@/lib/reports/ar-ap-summary-data"
import {
  loadPayablesAging,
  loadPayablesTotal,
  loadReceivablesAging,
} from "@/lib/reports/aging-reports-data"
import {
  loadStockAging,
  loadStockReconciliation,
  loadStockSummary,
} from "@/lib/reports/stock-simple-data"
import {
  loadTaxSummarySpt,
  loadVatReconciliation,
  loadWithholdingSummary,
} from "@/lib/reports/tax-summary-data"
import {
  loadSalesAnalytics,
  loadStockCard,
  loadStockMovements,
  loadStockValuation,
  resolveItemIdBySlugOrId,
  resolveWarehouseIdBySlugOrId,
} from "@/lib/reports/stock-flow-data"
import {
  loadBankLedger,
  loadCashFlow,
  loadCustomerReceivables,
  loadGeneralLedger,
  loadPayableSubledger,
  loadReceivableSubledger,
} from "@/lib/reports/ledger-cash-data"
import { SALES_DIMENSIONS, type SalesDimension } from "@/lib/reports/sales-analytics"
import { loadCustomerStatement } from "@/lib/reports/customer-statement-data"
import {
  buildProjectPlTable,
  loadProjectPlPdfReport,
} from "@/lib/reports/project-pl-export"

/** Isi lembar: statement bergaya kode/nama/kolom angka, atau tabel kolom bebas. */
export type ReportPayload =
  | { kind: "statement"; table: StatementTable; periodCaption: string }
  | { kind: "table"; table: TableDocument["table"]; periodCaption: string; landscape?: boolean }

export interface ReportDefinition {
  /** Judul lembar — harus sama dengan judul di halaman laporan. */
  title: string
  subtitle?: string
  /**
   * Rentang periode bawaan bila slug periode kosong. Laporan posisi memakai
   * "hari ini"; laporan rentang memakai awal tahun berjalan.
   */
  defaultPeriod?: (now: Date) => { start: Date; end: Date }
  load: (request: {
    /** Tanggal posisi untuk laporan posisi = `period.end`. */
    period: ReportPeriod
    search: Record<string, string | undefined>
  }) => Promise<ReportPayload>
}

const startOfYear = (now: Date) => ({ start: new Date(now.getFullYear(), 0, 1), end: now })

export const REPORTS: Record<ReportPdfKey, ReportDefinition> = {
  neraca: {
    title: "Neraca (Standar)",
    subtitle: "Laporan Posisi Keuangan",
    // Neraca adalah posisi "per" tanggal: slug 2026-10 berarti per 31 Okt 2026.
    async load({ period, search }) {
      const statement = await loadBalanceSheetStatement(
        new Date(period.end),
        parseStatementOptions(search),
      )
      return { kind: "statement", table: statement.table, periodCaption: statement.periodCaption }
    },
  },

  "laba-rugi": {
    title: "Laba/Rugi (Standar)",
    subtitle: "Multi Tahap",
    defaultPeriod: startOfYear,
    async load({ period, search }) {
      const statement = await loadIncomeStatementStatement(
        period,
        parseStatementOptions(search),
        search.kolomPersen === "1",
      )
      return { kind: "statement", table: statement.table, periodCaption: statement.periodCaption }
    },
  },

  "neraca-skontro": {
    title: "Neraca (Induk Skontro)",
    subtitle: "Laporan Posisi Keuangan — Dua Sisi",
    async load({ period, search }) {
      const report = await loadSkontroBalanceSheet(
        new Date(period.end),
        parseStatementOptions(search),
      )
      return {
        kind: "table",
        table: report.table,
        periodCaption: report.periodCaption,
        landscape: true,
      }
    },
  },

  "laba-rugi-terealisasi": {
    title: "Laba/Rugi (Terealisasi)",
    subtitle: "Jurnal Sudah Diposting",
    defaultPeriod: startOfYear,
    async load({ period, search }) {
      const statement = await loadIncomeStatementByStatus(
        period,
        parseStatementOptions(search),
        search.kolomPersen === "1",
        REPORT_JOURNAL_STATUSES,
      )
      return { kind: "statement", table: statement.table, periodCaption: statement.periodCaption }
    },
  },

  "laba-rugi-tidak-terealisasi": {
    title: "Laba/Rugi (Tidak Terealisasi)",
    subtitle: "Jurnal Belum Diposting",
    defaultPeriod: startOfYear,
    async load({ period, search }) {
      const statement = await loadIncomeStatementByStatus(
        period,
        parseStatementOptions(search),
        search.kolomPersen === "1",
        ["DRAFT"],
      )
      return { kind: "statement", table: statement.table, periodCaption: statement.periodCaption }
    },
  },

  "laba-rugi-pusat-biaya": {
    title: "Laba Rugi per Pusat Biaya",
    subtitle: "Laba Rugi Multi Tahap",
    defaultPeriod: startOfYear,
    async load({ period, search }) {
      // Periode laporan ini datang sebagai parameter query (bukan slug) karena
      // filter-nya juga membawa pusat biaya; keduanya dipakai apa adanya supaya
      // PDF memuat periode yang sama dengan yang dilihat di layar.
      const start = search.tanggalMulai ? new Date(`${search.tanggalMulai}T00:00:00`) : period.start
      // Akhir hari penuh (.999) sama dengan layar — jurnal pukul 23:59:59.500
      // tidak boleh tampil di layar tapi hilang di PDF (B9).
      const end = search.tanggalSelesai ? new Date(`${search.tanggalSelesai}T23:59:59.999`) : period.end
      const costCenterId = search.costCenterId ? Number(search.costCenterId) : null

      const report = await loadIncomeStatementByCostCenter({
        costCenterId: Number.isSafeInteger(costCenterId) && (costCenterId ?? 0) > 0 ? costCenterId : null,
        start,
        end,
      })
      return { kind: "statement", table: report.table, periodCaption: report.periodCaption }
    },
  },

  "rasio-keuangan": {
    title: "Rasio Keuangan",
    subtitle: "Likuiditas, Solvabilitas & Profitabilitas",
    defaultPeriod: startOfYear,
    async load({ period }) {
      const report = await loadFinancialRatios(period)
      return {
        kind: "table",
        table: buildRatiosTable(report.ratios),
        periodCaption: report.periodCaption,
      }
    },
  },

  "perubahan-ekuitas": {
    title: "Perubahan Ekuitas Pemilik",
    subtitle: "Saldo Awal, Mutasi & Saldo Akhir",
    defaultPeriod: startOfYear,
    async load({ period }) {
      const data = await loadEquityChanges(period)
      const result = buildEquityChanges(data.accounts, data.netProfit)
      return {
        kind: "table",
        table: buildEquityChangesTable(result),
        periodCaption: data.periodCaption,
      }
    },
  },

  "laba-ditahan": {
    title: "Laba Ditahan",
    subtitle: "Saldo Awal, Laba Periode & Saldo Akhir",
    defaultPeriod: startOfYear,
    async load({ period }) {
      const data = await loadEquityChanges(period)
      const result = buildRetainedEarnings(data.accounts, data.netProfit)
      return {
        kind: "table",
        table: buildRetainedEarningsTable(result),
        periodCaption: data.periodCaption,
      }
    },
  },

  "neraca-saldo": {
    title: "Neraca Saldo",
    subtitle: "Daftar Saldo per Akun",
    async load({ period, search }) {
      // Tanggal pembanding adalah parameter tersendiri, bukan bagian periode.
      // Akhir hari penuh (.999) sama dengan layar (B9).
      const compareRaw = search.pembanding ? new Date(`${search.pembanding}T23:59:59.999`) : null
      const compareDate = compareRaw && !Number.isNaN(compareRaw.getTime()) ? compareRaw : null

      const report = await loadTrialBalanceReport(new Date(period.end), compareDate)
      return {
        kind: "table",
        table: report.table,
        periodCaption: report.periodCaption,
        landscape: report.landscape,
      }
    },
  },

  "aset-tetap": {
    title: "Daftar Aset Tetap",
    subtitle: "Posisi Aset per Tanggal",
    async load({ period, search }) {
      const report = await loadAssetRegister(new Date(period.end), search.termasukDilepas === "1")
      return {
        kind: "table",
        table: report.register.table,
        periodCaption: report.periodCaption,
        landscape: true,
      }
    },
  },

  "mutasi-aset": {
    title: "Mutasi Aset Tetap",
    subtitle: "Perubahan Nilai Aset per Periode",
    defaultPeriod: startOfYear,
    async load({ period }) {
      const report = await loadAssetMovement(period)
      return {
        kind: "table",
        table: report.movement.table,
        periodCaption: report.periodCaption,
        landscape: true,
      }
    },
  },

  "disposisi-aset": {
    title: "Daftar Disposisi Aset",
    subtitle: "Aset yang Dilepas per Periode",
    defaultPeriod: startOfYear,
    async load({ period }) {
      const report = await loadAssetDisposals(period)
      return {
        kind: "table",
        table: report.disposal.table,
        periodCaption: report.periodCaption,
        landscape: true,
      }
    },
  },

  "jurnal-aset": {
    title: "Jurnal Aset Tetap",
    subtitle: "Perolehan, Penyusutan & Pelepasan",
    defaultPeriod: startOfYear,
    async load({ period }) {
      const report = await loadAssetJournal(period)
      return {
        kind: "table",
        table: report.journal.table,
        periodCaption: report.periodCaption,
        landscape: true,
      }
    },
  },

  "histori-aset": {
    title: "Histori Aset Tetap",
    subtitle: "Perolehan, Penyusutan, Pelepasan & Perpindahan",
    defaultPeriod: startOfYear,
    async load({ period }) {
      const report = await loadAssetHistory(period)
      return {
        kind: "table",
        table: report.history.table,
        periodCaption: report.periodCaption,
        landscape: true,
      }
    },
  },

  "biaya-pekerjaan": {
    title: "Bahan & Biaya Pekerjaan",
    subtitle: "Bahan, Biaya Produksi & Biaya per Unit",
    defaultPeriod: startOfYear,
    async load({ period }) {
      const report = await loadJobOrderCost(period)
      return {
        kind: "table",
        table: report.cost.table,
        periodCaption: report.periodCaption,
        landscape: true,
      }
    },
  },

  "scrap-material": {
    title: "Scrap Material",
    subtitle: "Scrap per Baris Issue — Normal vs Abnormal",
    defaultPeriod: startOfYear,
    async load({ period }) {
      const { report } = await loadScrapMaterialReport(period.start, period.end)
      return { kind: "table", table: buildScrapMaterialTable(report), periodCaption: "", landscape: true }
    },
  },

  "varians-produksi": {
    title: "Varians Produksi",
    subtitle: "Selisih Harga Bahan, Pemakaian, Tenaga Kerja & Lainnya",
    defaultPeriod: startOfYear,
    async load({ period }) {
      const report = await loadProductionVariance(period)
      return {
        kind: "table",
        table: report.variance.table,
        periodCaption: report.periodCaption,
        landscape: true,
      }
    },
  },

  "estimasi-vs-aktual": {
    title: "Estimasi vs Aktual Pekerjaan",
    subtitle: "Penawaran Disetujui vs Penagihan & Biaya Aktual per Pekerjaan",
    defaultPeriod: startOfYear,
    async load({ period }) {
      const report = await loadJobEstimateVsActual(period)
      return {
        kind: "table",
        table: report.estimate.table,
        periodCaption: report.periodCaption,
        landscape: true,
      }
    },
  },

  "penyelesaian-pekerjaan": {
    title: "Penyelesaian Pesanan",
    subtitle: "Barang Jadi & Biaya per Unit",
    defaultPeriod: startOfYear,
    async load({ period }) {
      const report = await loadJobOrderCompletion(period)
      return {
        kind: "table",
        table: report.completion.table,
        periodCaption: report.periodCaption,
        landscape: true,
      }
    },
  },

  "jurnal-pekerjaan": {
    title: "Jurnal Pekerjaan Pesanan",
    subtitle: "Bahan, Biaya Produksi & Penyelesaian",
    defaultPeriod: startOfYear,
    async load({ period }) {
      const report = await loadJobOrderJournal(period)
      return {
        kind: "table",
        table: report.journal.table,
        periodCaption: report.periodCaption,
        landscape: true,
      }
    },
  },

  "pembayaran-per-bank": {
    title: "Pembayaran & Penerimaan per Bank",
    subtitle: "Mutasi Kas & Bank per Periode",
    defaultPeriod: startOfYear,
    async load({ period }) {
      const report = await loadBankMovements(period)
      return {
        kind: "table",
        table: report.movements.summaryTable,
        periodCaption: report.periodCaption,
        landscape: true,
      }
    },
  },

  "penghitungan-stok": {
    title: "Lembar Penghitungan Stok",
    subtitle: "Hasil Stok Opname per Dokumen",
    defaultPeriod: startOfYear,
    async load({ period }) {
      const report = await loadStockCount(period)
      return {
        kind: "table",
        table: report.count.table,
        periodCaption: report.periodCaption,
        landscape: true,
      }
    },
  },

  "beban-pembayaran": {
    title: "Rincian Beban Pembayaran",
    subtitle: "Biaya Bank & Administrasi Pembayaran",
    defaultPeriod: startOfYear,
    async load({ period }) {
      const report = await loadPaymentExpenses(period)
      return {
        kind: "table",
        table: report.expenses.table,
        periodCaption: report.periodCaption,
        landscape: true,
      }
    },
  },

  "penerimaan-sebagian": {
    title: "Barang Diterima Sebagian",
    subtitle: "Sisa Penerimaan Pesanan Pembelian",
    defaultPeriod: startOfYear,
    async load({ period }) {
      const report = await loadPurchaseOutstanding(period)
      return {
        kind: "table",
        table: report.outstanding.table,
        periodCaption: report.periodCaption,
        landscape: true,
      }
    },
  },

  "pemenuhan-pesanan": {
    title: "Pemenuhan Pesanan",
    subtitle: "Pesanan Penjualan yang Belum Terkirim Penuh",
    defaultPeriod: startOfYear,
    async load({ period }) {
      const report = await loadOrderFulfillment(period)
      return {
        kind: "table",
        table: report.fulfillment.table,
        periodCaption: report.periodCaption,
        landscape: true,
      }
    },
  },

  "terkirim-belum-terfaktur": {
    title: "Terkirim Belum Terfaktur",
    subtitle: "Pesanan Penjualan Terkirim Belum Terfaktur Penuh",
    async load({ period, search }) {
      const customerId = Number(search.pelanggan)
      const queue = await getDeliveredUnbilledQueue({
        start: period.start,
        end: period.end,
        ...(Number.isSafeInteger(customerId) && customerId > 0
          ? { customerId }
          : {}),
        now: period.end,
      })
      return {
        kind: "table",
        table: buildDeliveredUnbilledTable(queue),
        periodCaption: formatPeriodLabel(period),
        landscape: true,
      }
    },
  },

  "selisih-persediaan": {
    title: "Selisih Saldo Akun Persediaan",
    subtitle: "Pemeriksaan: Buku Besar dibanding Nilai Barang",
    defaultPeriod: startOfYear,
    async load({ period }) {
      const report = await loadInventoryReconciliation(period)
      return {
        kind: "table",
        table: report.reconciliation.table,
        periodCaption: report.periodCaption,
        landscape: true,
      }
    },
  },

  "penerimaan-belum-ditagih": {
    title: "Barang Diterima Belum Ditagih",
    subtitle: "Pemeriksaan: Sisa Penerimaan vs Akun GRNI",
    defaultPeriod: startOfYear,
    async load({ period }) {
      const report = await loadReceivedNotBilled(period)
      return {
        kind: "table",
        table: report.report.detail,
        periodCaption: report.periodCaption,
        landscape: true,
      }
    },
  },

  "transfer-terkirim": {
    title: "Persediaan Terkirim Belum Diterima",
    subtitle: "Pemeriksaan: Barang yang Masih di Jalan Antar Gudang",
    defaultPeriod: startOfYear,
    async load({ period }) {
      const report = await loadTransferInTransit(period)
      return {
        kind: "table",
        table: report.report.table,
        periodCaption: report.periodCaption,
        landscape: true,
      }
    },
  },

  "wip-berjalan": {
    title: "Umur WIP Berjalan",
    subtitle: "Sisa Biaya WIP per Order Produksi Berjalan dan Ember Umurnya",
    defaultPeriod: startOfYear,
    async load({ period }) {
      const result = await loadWipAgingReport(period)
      return {
        kind: "table",
        table: buildWipAgingTable(result),
        periodCaption: result.periodCaption,
        landscape: true,
      }
    },
  },

  "hasil-penawaran": {
    title: "Hasil Penawaran",
    subtitle: "Ringkasan Menang, Kalah, dan Konversi Penawaran",
    defaultPeriod: startOfYear,
    async load({ period }) {
      const result = await loadQuotationOutcomeReport(period)
      return {
        kind: "table",
        table: buildQuotationOutcomeTable(result),
        periodCaption: result.periodCaption,
        landscape: true,
      }
    },
  },

  "rekap-borongan": {
    title: "Rekap Borongan",
    subtitle: "Upah Borongan per Teknisi (Informatif — Bukan Dasar Bayar/Jurnal)",
    defaultPeriod: startOfYear,
    async load({ period }) {
      const result = await loadLaborRecapReport({ start: period.start, end: period.end })
      return {
        kind: "table",
        table: buildLaborRecapTable(result),
        periodCaption: formatPeriodLabel(period),
        landscape: true,
      }
    },
  },

  "stok-minimum": {
    title: "Barang Stok Minimum",
    subtitle: "Barang yang Sudah Mencapai Batas Minimum",
    defaultPeriod: startOfYear,
    async load({ period }) {
      const report = await loadMinStock(period)
      return {
        kind: "table",
        table: report.report.table,
        periodCaption: report.periodCaption,
        landscape: true,
      }
    },
  },

  "transaksi-bank": {
    title: "Transaksi Bank Terekonsiliasi vs Belum",
    subtitle: "Rekening Koran Dibanding Buku",
    defaultPeriod: startOfYear,
    async load({ period }) {
      const report = await loadBankTransactionReconciliation(period)
      return {
        kind: "table",
        table: report.report.table,
        periodCaption: report.periodCaption,
        landscape: true,
      }
    },
  },

  "faktur-ppn": {
    title: "Faktur SPT Masa PPN",
    subtitle: "PPN Keluaran & Masukan per Faktur",
    defaultPeriod: startOfYear,
    async load({ period }) {
      const report = await loadVatInvoices(period)
      return {
        kind: "table",
        table: report.report.table,
        periodCaption: report.periodCaption,
        landscape: true,
      }
    },
  },
  profitabilitas: {
    title: "Profitabilitas & HPP",
    subtitle: "Pendapatan, HPP & Laba Kotor",
    defaultPeriod: startOfYear,
    async load({ period, search }) {
      const dimension = (PROFITABILITY_DIMENSIONS as readonly string[]).includes(search.dimensi ?? "")
        ? (search.dimensi as ProfitabilityDimension)
        : "faktur"
      const report = await loadProfitability(period, dimension)
      return {
        kind: "table",
        table: report.result.table,
        periodCaption: report.periodCaption,
        landscape: true,
      }
    },
  },
  "histori-penjualan": {
    title: "Histori Proses Penjualan",
    subtitle: "Pesanan, Surat Jalan, Faktur & Pembayaran",
    defaultPeriod: (now: Date) => ({ start: new Date(now.getFullYear(), now.getMonth(), 1), end: now }),
    async load({ period }) {
      const report = await loadSalesProcessHistory(period)
      return {
        kind: "table",
        table: report.result.table,
        periodCaption: report.periodCaption,
        landscape: true,
      }
    },
  },
  "histori-pembelian": {
    title: "Histori Proses Pembelian",
    subtitle: "Permintaan, Pesanan, Penerimaan, Tagihan & Pembayaran",
    defaultPeriod: (now: Date) => ({ start: new Date(now.getFullYear(), now.getMonth(), 1), end: now }),
    async load({ period }) {
      const report = await loadPurchaseProcessHistory(period)
      return {
        kind: "table",
        table: report.result.table,
        periodCaption: report.periodCaption,
        landscape: true,
      }
    },
  },
  pembelian: {
    title: "Pembelian per Kelompok",
    subtitle: "Pemasok, Barang & Biaya",
    defaultPeriod: (now: Date) => ({ start: new Date(now.getFullYear(), now.getMonth(), 1), end: now }),
    async load({ period, search }) {
      const dimension = (PURCHASE_DIMENSIONS as readonly string[]).includes(search.dimensi ?? "")
        ? (search.dimensi as PurchaseDimension)
        : "pemasok"
      const report = await loadPurchasesByDimension(period, dimension)
      return {
        kind: "table",
        table: report.result.table,
        periodCaption: report.periodCaption,
        landscape: true,
      }
    },
  },
  "gaji-karyawan": {
    title: "Gaji Karyawan",
    subtitle: "Per Karyawan pada Periode Terpilih",
    defaultPeriod: (now: Date) => ({ start: new Date(now.getFullYear(), now.getMonth(), 1), end: now }),
    async load({ period }) {
      const data = await loadPayrollRows(period)
      const result = buildPayrollByEmployee({
        rows: data.rows,
        draftSlips: data.draftSlips,
        duplicateEmployees: data.duplicateEmployees,
      })
      return { kind: "table", table: result.table, periodCaption: data.periodCaption, landscape: true }
    },
  },
  "pph-21": {
    title: "PPh 21 Karyawan",
    subtitle: "Pemotongan PPh 21 dari Slip Gaji",
    defaultPeriod: (now: Date) => ({ start: new Date(now.getFullYear(), now.getMonth(), 1), end: now }),
    async load({ period }) {
      const data = await loadPayrollRows(period)
      const result = buildPph21({ rows: data.rows, draftSlips: data.draftSlips })
      return { kind: "table", table: result.table, periodCaption: data.periodCaption, landscape: true }
    },
  },
  "porsi-gaji": {
    title: "Porsi Gaji",
    subtitle: "Komposisi Penerimaan, Potongan & Gaji Bersih",
    defaultPeriod: (now: Date) => ({ start: new Date(now.getFullYear(), now.getMonth(), 1), end: now }),
    async load({ period }) {
      const data = await loadPayrollRows(period)
      const result = buildPayrollComposition({ rows: data.rows, draftSlips: data.draftSlips })
      return { kind: "table", table: result.table, periodCaption: data.periodCaption }
    },
  },
  "uang-muka-pembelian": {
    title: "Uang Muka Pembelian",
    subtitle: "Dibayarkan pada Periode Terpilih",
    defaultPeriod: (now: Date) => ({ start: new Date(now.getFullYear(), now.getMonth(), 1), end: now }),
    async load({ period }) {
      const report = await loadPurchaseAdvances(period)
      return { kind: "table", table: report.result.table, periodCaption: report.periodCaption, landscape: true }
    },
  },
  "penyetoran-pajak": {
    title: "Penyetoran Pajak",
    subtitle: "Setoran ke Kas Negara",
    defaultPeriod: (now: Date) => ({ start: new Date(now.getFullYear(), now.getMonth(), 1), end: now }),
    async load({ period }) {
      const report = await loadTaxPayments(period)
      return { kind: "table", table: report.result.table, periodCaption: report.periodCaption, landscape: true }
    },
  },
  "tukar-faktur": {
    title: "Rincian Tukar Faktur",
    subtitle: "Penyerahan Faktur & Pelunasan Piutang",
    defaultPeriod: (now: Date) => ({ start: new Date(now.getFullYear(), now.getMonth(), 1), end: now }),
    async load({ period }) {
      const report = await loadInvoiceExchanges(period)
      return { kind: "table", table: report.result.table, periodCaption: report.periodCaption, landscape: true }
    },
  },
  "ringkasan-ar-ap": {
    title: "Ringkasan Piutang & Hutang",
    subtitle: "Ikhtisar Saldo AR/AP",
    async load() {
      const report = await loadArApSummary()
      return { kind: "table", table: report.table, periodCaption: report.periodCaption, landscape: true }
    },
  },
  "piutang-jatuh-tempo": {
    title: "Piutang Jatuh Tempo",
    subtitle: "Umur Piutang",
    async load() {
      const report = await loadReceivablesAging()
      return { kind: "table", table: report.table, periodCaption: report.periodCaption, landscape: true }
    },
  },
  "hutang-jatuh-tempo": {
    title: "Hutang Jatuh Tempo",
    subtitle: "Umur Utang",
    async load() {
      const report = await loadPayablesAging()
      return { kind: "table", table: report.table, periodCaption: report.periodCaption, landscape: true }
    },
  },
  "total-hutang": {
    title: "Total Hutang",
    subtitle: "Utang Usaha",
    async load() {
      const report = await loadPayablesTotal()
      return { kind: "table", table: report.table, periodCaption: report.periodCaption, landscape: true }
    },
  },
  "piutang-pelanggan": {
    title: "Piutang per Pelanggan",
    subtitle: "Umur Piutang, Limit Kredit & Rata-rata Pembayaran",
    defaultPeriod: startOfYear,
    async load({ period }) {
      const report = await loadCustomerReceivables(period)
      return { kind: "table", table: report.table, periodCaption: report.periodCaption, landscape: true }
    },
  },
  "umur-stok": {
    title: "Umur Stok",
    subtitle: "Analisis Umur Persediaan",
    async load() {
      const report = await loadStockAging()
      return { kind: "table", table: report.table, periodCaption: report.periodCaption, landscape: true }
    },
  },
  "stok-tidak-bergerak": {
    title: "Stok Tidak Bergerak",
    subtitle: "Pemeriksaan Persediaan",
    async load({ search }) {
      const parsed =
        search.ambang && /^\d+$/.test(search.ambang) ? Number(search.ambang) : null
      const thresholdDays =
        parsed !== null && parsed >= 1 && parsed <= 3650 ? parsed : undefined
      const report = await loadSlowMovingStock({ thresholdDays })
      return { kind: "table", table: report.report.table, periodCaption: report.periodCaption, landscape: true }
    },
  },
  "ringkasan-stok": {
    title: "Ringkasan Persediaan",
    subtitle: "Posisi per Gudang",
    async load() {
      const report = await loadStockSummary()
      return { kind: "table", table: report.table, periodCaption: report.periodCaption, landscape: true }
    },
  },
  "rekonsiliasi-stok": {
    title: "Rekonsiliasi Stok",
    subtitle: "Rekonsiliasi Persediaan",
    async load() {
      const report = await loadStockReconciliation()
      return { kind: "table", table: report.table, periodCaption: report.periodCaption, landscape: true }
    },
  },
  "mutasi-stok": {
    title: "Mutasi Stok",
    subtitle: "Pergerakan Stok",
    defaultPeriod: (now: Date) => ({ start: new Date(now.getFullYear(), now.getMonth(), 1), end: now }),
    async load({ period, search }) {
      const warehouseId = await resolveWarehouseIdBySlugOrId(search.gudang ?? null)
      const report = await loadStockMovements(period, warehouseId)
      return { kind: "table", table: report.table, periodCaption: report.periodCaption, landscape: true }
    },
  },
  "valuasi-stok": {
    title: "Valuasi Stok per Gudang",
    subtitle: "Valuasi Persediaan",
    async load({ search }) {
      const warehouseId = await resolveWarehouseIdBySlugOrId(search.gudang ?? null)
      const report = await loadStockValuation(warehouseId)
      return { kind: "table", table: report.table, periodCaption: report.periodCaption, landscape: true }
    },
  },
  "kartu-stok": {
    title: "Kartu Stok",
    subtitle: "Riwayat Pergerakan per Barang",
    defaultPeriod: (now: Date) => ({ start: new Date(now.getFullYear(), now.getMonth(), 1), end: now }),
    async load({ period, search }) {
      const itemId = await resolveItemIdBySlugOrId(search.barang ?? null)
      const warehouseId = await resolveWarehouseIdBySlugOrId(search.gudang ?? null)
      const report = await loadStockCard(period, itemId, warehouseId)
      return { kind: "table", table: report.table, periodCaption: report.periodCaption, landscape: true }
    },
  },
  "rekonsiliasi-ppn": {
    title: "Rekonsiliasi PPN",
    subtitle: "Per Buku (Jurnal) vs Per Dokumen",
    defaultPeriod: (now: Date) => ({ start: new Date(now.getFullYear(), now.getMonth(), 1), end: now }),
    async load({ period }) {
      const report = await loadVatReconciliation(period)
      return { kind: "table", table: report.table, periodCaption: report.periodCaption, landscape: true }
    },
  },
  "posisi-spt": {
    title: "Posisi SPT Masa PPN",
    subtitle: "Per Masa: Dokumen vs Jurnal POSTED vs Setor",
    defaultPeriod: startOfYear,
    async load({ period }) {
      const report = await loadTaxSummarySpt(period)
      return { kind: "table", table: report.table, periodCaption: report.periodCaption, landscape: true }
    },
  },
  "bukti-potong-pph": {
    title: "Daftar Bukti Potong PPh",
    subtitle: "Pemotongan PPh Dua Sisi — Pembelian & Penjualan",
    defaultPeriod: startOfYear,
    async load({ period }) {
      const report = await loadWithholdingSummary(period)
      return { kind: "table", table: report.table, periodCaption: report.periodCaption, landscape: true }
    },
  },
  "analisis-penjualan": {
    title: "Analisis Penjualan",
    subtitle: "Penjualan per Kelompok",
    defaultPeriod: (now: Date) => ({ start: new Date(now.getFullYear(), now.getMonth(), 1), end: now }),
    async load({ period, search }) {
      const dimension = (SALES_DIMENSIONS as readonly { value: string }[]).some(
        (d) => d.value === search.dimensi,
      )
        ? (search.dimensi as SalesDimension)
        : "barang"
      const report = await loadSalesAnalytics(period, dimension)
      return { kind: "table", table: report.table, periodCaption: report.periodCaption, landscape: true }
    },
  },
  "paparan-diskon-penjualan": {
    title: "Paparan Diskon Penjualan",
    subtitle: "Diskon Efektif Dokumen Penjualan per Periode",
    defaultPeriod: (now: Date) => ({ start: new Date(now.getFullYear(), now.getMonth(), 1), end: now }),
    async load({ period }) {
      const report = await loadDiscountExposureReport(period)
      return {
        kind: "table",
        table: buildDiscountExposureTable(report),
        periodCaption: report.periodCaption,
        landscape: true,
      }
    },
  },
  "buku-besar": {
    title: "Buku Besar",
    subtitle: "Mutasi & Saldo per Akun",
    defaultPeriod: startOfYear,
    async load({ period, search }) {
      const report = await loadGeneralLedger(period, search.akun ?? null)
      return { kind: "table", table: report.table, periodCaption: report.periodCaption, landscape: true }
    },
  },
  "buku-bank": {
    title: "Buku Bank",
    subtitle: "Mutasi Rekening Kas & Bank",
    defaultPeriod: startOfYear,
    async load({ period, search }) {
      const report = await loadBankLedger(period, search.akun ?? null)
      return { kind: "table", table: report.table, periodCaption: report.periodCaption, landscape: true }
    },
  },
  "buku-pembantu-piutang": {
    title: "Buku Besar Pembantu Piutang",
    subtitle: "Mutasi per Pelanggan",
    defaultPeriod: (now: Date) => ({ start: new Date(now.getFullYear(), now.getMonth(), 1), end: now }),
    async load({ period, search }) {
      const report = await loadReceivableSubledger(period, search.pihak ?? null)
      return { kind: "table", table: report.table, periodCaption: report.periodCaption, landscape: true }
    },
  },
  "statement-pelanggan": {
    title: "Statement Pelanggan",
    subtitle: "Mutasi Piutang per Pelanggan",
    defaultPeriod: (now: Date) => ({ start: new Date(now.getFullYear(), 0, 1), end: now }),
    async load({ period, search }) {
      const customerId = Number(search.pelanggan)
      if (!Number.isSafeInteger(customerId) || customerId <= 0) {
        return {
          kind: "table" as const,
          table: {
            columns: [
              { header: "Tanggal", align: "left" as const, width: 30 },
              { header: "Dokumen", align: "left" as const, width: 38 },
              { header: "Keterangan", align: "left" as const, width: 62 },
              { header: "Debit", align: "right" as const, width: 32 },
              { header: "Kredit", align: "right" as const, width: 32 },
              { header: "Saldo", align: "right" as const, width: 32 },
            ],
            rows: [{ kind: "notice" as const, text: "Pilih pelanggan terlebih dahulu (parameter pelanggan=<id>) untuk mencetak statement pelanggan." }],
          },
          periodCaption: formatPeriodLabel(period),
          landscape: true,
        }
      }
      const report = await loadCustomerStatement(customerId, period)
      return { kind: "table", table: report.table, periodCaption: report.periodCaption, landscape: false }
    },
  },
  "laba-rugi-proyek": {
    title: "Laba Rugi per Proyek",
    subtitle: "Rincian Pendapatan, Biaya, dan Laba per Proyek",
    defaultPeriod: startOfYear,
    async load({ period }) {
      const result = await loadProjectPlPdfReport(period)
      return {
        kind: "table",
        table: buildProjectPlTable(result),
        periodCaption: result.periodCaption,
        landscape: true,
      }
    },
  },
  "buku-pembantu-utang": {
    title: "Buku Besar Pembantu Utang",
    subtitle: "Mutasi per Pemasok",
    defaultPeriod: (now: Date) => ({ start: new Date(now.getFullYear(), now.getMonth(), 1), end: now }),
    async load({ period, search }) {
      const report = await loadPayableSubledger(period, search.pihak ?? null)
      return { kind: "table", table: report.table, periodCaption: report.periodCaption, landscape: true }
    },
  },
  "arus-kas": {
    title: "Laporan Arus Kas",
    subtitle: "Per Aktivitas",
    defaultPeriod: (now: Date) => ({ start: new Date(now.getFullYear(), now.getMonth(), 1), end: now }),
    async load({ period }) {
      const report = await loadCashFlow(period)
      return { kind: "statement", table: report.statement, periodCaption: report.periodCaption }
    },
  },
}

/**
 * Apakah `value` kunci laporan PDF yang dikenal?
 *
 * WAJIB `Object.hasOwn`, bukan `value in REPORTS`: operator `in` ikut menerima
 * properti warisan prototipe, sehingga `?laporan=constructor` (atau `toString`,
 * `__proto__`) lolos validasi lalu meledak saat `definition.load` dipanggil —
 * satu-satunya jalur 500 dari input pengguna di `/api/pdf`, dan berarti
 * whitelist "fail-closed"-nya tidak benar-benar tertutup.
 */
export function isReportPdfKey(value: string): value is ReportPdfKey {
  return Object.hasOwn(REPORTS, value)
}
