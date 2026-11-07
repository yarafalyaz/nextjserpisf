import { describe, it, expect } from "vitest"
import fs from "node:fs"
import path from "node:path"

/**
 * Aksi transisi dokumen harus benar-benar dapat dipanggil dari UI.
 *
 * Kelas bug ini sudah pernah lolos ke produksi: `postInvoice` dan
 * `completeSalesReturn` terdefinisi lengkap (guard izin, gate approval, klaim
 * atomik, hook GL + stok) tetapi tidak dipanggil dari mana pun — akibatnya
 * faktur manual tak pernah terposting (tanpa jurnal piutang & tanpa stok keluar)
 * dan retur tak pernah selesai. Tidak ada test unit yang menangkapnya karena
 * semuanya menguji aksi secara langsung.
 *
 * Test ini memastikan tiap aksi transisi punya pemanggil di halaman/modul yang
 * seharusnya, jadi menghapus tombolnya akan langsung memerahkan test.
 *
 * BUGHUNT round3 MEDIUM: detektor versi lama lemah — GENERIC_INVOKERS beku
 * 5 berkas + regex prop sempit (`action|processAction|deleteAction`), sehingga
 * pola sah lolos deteksi: spread props, `.bind`, dynamic import, helper
 * submit (`run(() => aksi(...))` / meneruskan aksi by-reference ke helper),
 * dan prop yang direnama (`releaseAction`, `onBulkDelete`, nama apa pun).
 * Detektor kini: (1) me-resolve impor seperti `action-wiring.test.ts`
 * (specifier `@/`/relatif → berkas pendefinisi persis, alias, namespace,
 * dynamic import + destructure/akses properti); (2) menemukan komponen/hook
 * invoker SECARA OTOMATIS dari kode (bukan daftar beku): berkas di
 * `src/components`/`src/app` yang mendeklarasikan prop bertipe fungsi lalu
 * MEMANGGIL prop itu — aksi yang diteruskan sebagai nilai prop APA PUN /
 * spread / argumen `.bind` ke invoker terimpor itu dihitung tersambung;
 * (3) aksi yang dipanggil langsung, diteruskan by-reference ke pemanggilan
 * mana pun (helper submit), atau dipakai lewat `.bind(...)` dihitung.
 * `REQUIRED_CALLERS` diperluas dari 15 ke cakupan turunan-grep di bawah;
 * kelengkapannya ditegakkan tes cakupan (setiap ekspor berpola transisi
 * wajib masuk REQUIRED_CALLERS atau ALLOWED_UNWIRED).
 */
const REQUIRED_CALLERS: Array<{ action: string; definedIn: string; callersIn: string[] }> = [
  { action: "acceptQuotation", definedIn: "src/actions/sales.actions.ts", callersIn: ["penjualan/penawaran"] },
  { action: "acknowledgeDisciplinaryRecord", definedIn: "src/actions/disciplinary.actions.ts", callersIn: ["components/reports"] },
  { action: "allocateCustomerCredit", definedIn: "src/actions/sales.actions.ts", callersIn: ["penjualan/uang-muka"] },
  { action: "applyContractDecisionRequest", definedIn: "src/actions/probation.actions.ts", callersIn: ["master/karyawan"] },
  { action: "applyJobChangeOrder", definedIn: "src/actions/job-change-order.actions.ts", callersIn: ["produksi/perintah-kerja"] },
  { action: "applyOverheadToProductionOrder", definedIn: "src/actions/production-cost.actions.ts", callersIn: ["produksi/production-orders"] },
  { action: "applyProjectBudgetRevision", definedIn: "src/actions/project.actions.ts", callersIn: ["proyek"] },
  { action: "applyWorkOrderItemSubstitute", definedIn: "src/actions/item-substitute.actions.ts", callersIn: ["components/reports"] },
  { action: "approveAttendanceCorrection", definedIn: "src/actions/hrm.actions.ts", callersIn: ["sdm/absensi"] },
  { action: "approveBomRevision", definedIn: "src/actions/manufacturing.actions.ts", callersIn: ["produksi/bom-revisi"] },
  { action: "approveContractDecisionRequest", definedIn: "src/actions/probation.actions.ts", callersIn: ["master/karyawan"] },
  { action: "approveCreditOverride", definedIn: "src/actions/credit-override.actions.ts", callersIn: ["components/reports"] },
  { action: "approveDisciplinaryRecord", definedIn: "src/actions/disciplinary.actions.ts", callersIn: ["components/reports"] },
  { action: "approveEmployeeRoster", definedIn: "src/actions/hrm.actions.ts", callersIn: ["sdm/roster"] },
  { action: "approveExpense", definedIn: "src/actions/finance.actions.ts", callersIn: ["keuangan/pengeluaran"] },
  { action: "approveMaterialRequest", definedIn: "src/actions/material-request.actions.ts", callersIn: ["inventaris/permintaan-gudang"] },
  { action: "approveOvertime", definedIn: "src/actions/hrm.actions.ts", callersIn: ["api/workflow"] },
  { action: "approvePayroll", definedIn: "src/actions/hrm.actions.ts", callersIn: ["sdm/penggajian"] },
  { action: "approvePkwtEvent", definedIn: "src/actions/hrm.actions.ts", callersIn: ["components/payroll"] },
  { action: "approveSalaryAdjustment", definedIn: "src/actions/salary-adjustment.actions.ts", callersIn: ["master/karyawan"] },
  { action: "approveStep", definedIn: "src/actions/approval.actions.ts", callersIn: ["pengaturan/persetujuan"] },
  { action: "approveStocktakeSession", definedIn: "src/actions/inventory.actions.ts", callersIn: ["inventaris/opname/sesi"] },
  { action: "cancelAttendanceCorrection", definedIn: "src/actions/hrm.actions.ts", callersIn: ["sdm/absensi"] },
  { action: "cancelContractDecisionRequest", definedIn: "src/actions/probation.actions.ts", callersIn: ["master/karyawan"] },
  { action: "cancelJobChangeOrder", definedIn: "src/actions/job-change-order.actions.ts", callersIn: ["produksi/perintah-kerja"] },
  { action: "cancelJobPaymentSchedule", definedIn: "src/actions/job-payment-schedule.actions.ts", callersIn: ["components/reports"] },
  { action: "cancelMaterialRequest", definedIn: "src/actions/material-request.actions.ts", callersIn: ["inventaris/permintaan-gudang"] },
  { action: "cancelPurchaseOrder", definedIn: "src/actions/purchase.actions.ts", callersIn: ["pembelian/pesanan"] },
  { action: "cancelSalaryAdjustment", definedIn: "src/actions/salary-adjustment.actions.ts", callersIn: ["master/karyawan"] },
  { action: "cancelTaxAssessment", definedIn: "src/actions/tax-dispute.actions.ts", callersIn: ["keuangan/sengketa-pajak"] },
  { action: "cancelTaxInvoiceAction", definedIn: "src/actions/tax-documents.actions.ts", callersIn: ["keuangan/dokumen-pajak"] },
  { action: "closeAccountingPeriod", definedIn: "src/actions/period-close.actions.ts", callersIn: ["pengaturan/proses-akhir-bulan"] },
  { action: "closeInventoryTransferShortage", definedIn: "src/actions/inventory.actions.ts", callersIn: ["inventaris/transfer"] },
  { action: "closeMaterialRequest", definedIn: "src/actions/material-request.actions.ts", callersIn: ["inventaris/permintaan-gudang"] },
  { action: "closeProbation", definedIn: "src/actions/probation.actions.ts", callersIn: ["master/karyawan"] },
  { action: "closeProductionOrder", definedIn: "src/actions/manufacturing.actions.ts", callersIn: ["components/reports"] },
  { action: "closeStatutoryRule", definedIn: "src/actions/hrm.actions.ts", callersIn: ["sdm/aturan-statutori"] },
  { action: "closeWorkOrder", definedIn: "src/actions/manufacturing.actions.ts", callersIn: ["components/reports"] },
  { action: "completeLeadActivity", definedIn: "src/actions/crm.actions.ts", callersIn: ["crm/leads"] },
  { action: "completeMaterialIssue", definedIn: "src/actions/inventory.actions.ts", callersIn: ["inventaris/pengeluaran-material"] },
  { action: "completeProductionOrder", definedIn: "src/actions/manufacturing.actions.ts", callersIn: ["produksi/production-orders"] },
  { action: "completeReconciliation", definedIn: "src/actions/finance.actions.ts", callersIn: ["keuangan/rekonsiliasi-bank"] },
  { action: "completeSalesReturn", definedIn: "src/actions/sales.actions.ts", callersIn: ["penjualan/retur"] },
  { action: "completeWorkOrder", definedIn: "src/actions/manufacturing.actions.ts", callersIn: ["produksi/perintah-kerja"] },
  { action: "confirmDownPayment", definedIn: "src/actions/sales.actions.ts", callersIn: ["penjualan/uang-muka"] },
  { action: "confirmProductionOrder", definedIn: "src/actions/manufacturing.actions.ts", callersIn: ["produksi/production-orders"] },
  { action: "confirmVendorBill", definedIn: "src/actions/purchase.actions.ts", callersIn: ["pembelian/tagihan"] },
  { action: "confirmVendorPayment", definedIn: "src/actions/purchase.actions.ts", callersIn: ["pembelian/pembayaran-vendor"] },
  { action: "convertLead", definedIn: "src/actions/crm.actions.ts", callersIn: ["crm/leads"] },
  { action: "convertQuotationToOrder", definedIn: "src/actions/sales.actions.ts", callersIn: ["penjualan/penawaran"] },
  { action: "deactivateWorkCenter", definedIn: "src/actions/work-center.actions.ts", callersIn: ["components/manufacturing"] },
  { action: "decideBomRevisionChange", definedIn: "src/actions/bom-revision-change.actions.ts", callersIn: ["components/reports"] },
  { action: "decideProbation", definedIn: "src/actions/probation.actions.ts", callersIn: ["master/karyawan"] },
  { action: "decideWarrantyClaimAction", definedIn: "src/actions/warranty.actions.ts", callersIn: ["produksi/garansi"] },
  { action: "deleteSalesOrder", definedIn: "src/actions/sales.actions.ts", callersIn: ["penjualan/pesanan"] },
  { action: "deliverDeliveryOrder", definedIn: "src/actions/sales.actions.ts", callersIn: ["penjualan/surat-jalan"] },
  { action: "finalizeReview", definedIn: "src/actions/performance.actions.ts", callersIn: ["sdm/kinerja"] },
  { action: "issueDownPaymentTaxInvoiceAction", definedIn: "src/actions/tax-documents.actions.ts", callersIn: ["keuangan/dokumen-pajak"] },
  { action: "issueMaterial", definedIn: "src/actions/manufacturing.actions.ts", callersIn: ["produksi/production-orders"] },
  { action: "issueSalesLateFee", definedIn: "src/actions/sales-late-fee.actions.ts", callersIn: ["components/reports"] },
  { action: "issueTaxInvoiceAction", definedIn: "src/actions/tax-documents.actions.ts", callersIn: ["keuangan/dokumen-pajak"] },
  { action: "issueWithholdingCertificateAction", definedIn: "src/actions/tax-documents.actions.ts", callersIn: ["keuangan/dokumen-pajak"] },
  { action: "lockProjectBudget", definedIn: "src/actions/project.actions.ts", callersIn: ["proyek"] },
  { action: "markExpensePaid", definedIn: "src/actions/finance.actions.ts", callersIn: ["keuangan/pengeluaran"] },
  { action: "markPayrollPaid", definedIn: "src/actions/hrm.actions.ts", callersIn: ["sdm/penggajian"] },
  { action: "markVendorPaymentsTransferred", definedIn: "src/actions/vendor-transfer.actions.ts", callersIn: ["pembelian/transfer-pemasok"] },
  { action: "paySalesLateFee", definedIn: "src/actions/sales-late-fee.actions.ts", callersIn: ["components/reports"] },
  { action: "postAssetChangeEventAction", definedIn: "src/actions/asset.actions.ts", callersIn: ["aset"] },
  { action: "postAssetReclassificationAction", definedIn: "src/actions/asset.actions.ts", callersIn: ["aset"] },
  { action: "postInvoice", definedIn: "src/actions/sales.actions.ts", callersIn: ["penjualan/faktur"] },
  { action: "postJournal", definedIn: "src/actions/finance.actions.ts", callersIn: ["keuangan/jurnal"] },
  { action: "postStocktakeSession", definedIn: "src/actions/inventory.actions.ts", callersIn: ["inventaris/opname/sesi"] },
  { action: "postWarrantyClaimCostAction", definedIn: "src/actions/warranty.actions.ts", callersIn: ["produksi/garansi"] },
  { action: "postWarrantySupplierRecoveryAction", definedIn: "src/actions/warranty.actions.ts", callersIn: ["produksi/garansi"] },
  { action: "postYearEndClosingAction", definedIn: "src/actions/year-end-closing.actions.ts", callersIn: ["pengaturan/proses-akhir-bulan"] },
  { action: "processInventoryTransfer", definedIn: "src/actions/inventory.actions.ts", callersIn: ["inventaris/transfer"] },
  { action: "processPayroll", definedIn: "src/actions/hrm.actions.ts", callersIn: ["components/forms"] },
  { action: "processPurchaseReturn", definedIn: "src/actions/purchase.actions.ts", callersIn: ["pembelian/retur"] },
  { action: "processStockAdjustment", definedIn: "src/actions/inventory.actions.ts", callersIn: ["inventaris/penyesuaian"] },
  { action: "publishPhotoAttachment", definedIn: "src/actions/attachment-photo.actions.ts", callersIn: ["components/reports"] },
  { action: "pullLaborCostFromTimesheets", definedIn: "src/actions/production-cost.actions.ts", callersIn: ["produksi/production-orders"] },
  { action: "receiveInventoryTransfer", definedIn: "src/actions/inventory.actions.ts", callersIn: ["inventaris/transfer"] },
  { action: "rejectAttendanceCorrection", definedIn: "src/actions/hrm.actions.ts", callersIn: ["sdm/absensi"] },
  { action: "rejectBomRevision", definedIn: "src/actions/manufacturing.actions.ts", callersIn: ["produksi/bom-revisi"] },
  { action: "rejectContractDecisionRequest", definedIn: "src/actions/probation.actions.ts", callersIn: ["master/karyawan"] },
  { action: "rejectCreditOverride", definedIn: "src/actions/credit-override.actions.ts", callersIn: ["components/reports"] },
  { action: "rejectDisciplinaryRecord", definedIn: "src/actions/disciplinary.actions.ts", callersIn: ["components/reports"] },
  { action: "rejectEmployeeRoster", definedIn: "src/actions/hrm.actions.ts", callersIn: ["sdm/roster"] },
  { action: "rejectExpense", definedIn: "src/actions/finance.actions.ts", callersIn: ["keuangan/pengeluaran"] },
  { action: "rejectMaterialRequest", definedIn: "src/actions/material-request.actions.ts", callersIn: ["inventaris/permintaan-gudang"] },
  { action: "rejectProjectBudgetRevision", definedIn: "src/actions/project.actions.ts", callersIn: ["proyek"] },
  { action: "rejectQuotation", definedIn: "src/actions/sales.actions.ts", callersIn: ["penjualan/penawaran"] },
  { action: "rejectSalaryAdjustment", definedIn: "src/actions/salary-adjustment.actions.ts", callersIn: ["master/karyawan"] },
  { action: "rejectStep", definedIn: "src/actions/approval.actions.ts", callersIn: ["pengaturan/persetujuan"] },
  { action: "releaseBomRevision", definedIn: "src/actions/manufacturing.actions.ts", callersIn: ["produksi/bom-revisi"] },
  { action: "releaseQcChecklist", definedIn: "src/actions/qc.actions.ts", callersIn: ["produksi/qc/checklist"] },
  { action: "reopenAccountingPeriod", definedIn: "src/actions/period-close.actions.ts", callersIn: ["pengaturan/proses-akhir-bulan"] },
  { action: "reopenApproval", definedIn: "src/actions/approval.actions.ts", callersIn: ["pengaturan/persetujuan"] },
  { action: "reopenLeadActivity", definedIn: "src/actions/crm.actions.ts", callersIn: ["crm/leads"] },
  { action: "reopenProductionOrder", definedIn: "src/actions/manufacturing.actions.ts", callersIn: ["components/reports"] },
  { action: "reopenWorkOrder", definedIn: "src/actions/manufacturing.actions.ts", callersIn: ["components/reports"] },
  { action: "restoreDatabaseBackup", definedIn: "src/actions/database.actions.ts", callersIn: ["pengaturan/database"] },
  { action: "reverseAssetChangeEventAction", definedIn: "src/actions/asset.actions.ts", callersIn: ["aset"] },
  { action: "reverseJournal", definedIn: "src/actions/finance.actions.ts", callersIn: ["keuangan/jurnal"] },
  { action: "reverseSalesLateFee", definedIn: "src/actions/sales-late-fee.actions.ts", callersIn: ["components/reports"] },
  { action: "reverseSalesPayment", definedIn: "src/actions/sales.actions.ts", callersIn: ["penjualan/pembayaran"] },
  { action: "reverseVendorPayment", definedIn: "src/actions/purchase.actions.ts", callersIn: ["pembelian/pembayaran-vendor"] },
  { action: "reverseYearEndClosingAction", definedIn: "src/actions/year-end-closing.actions.ts", callersIn: ["pengaturan/proses-akhir-bulan"] },
  { action: "reviseQuotation", definedIn: "src/actions/sales.actions.ts", callersIn: ["penjualan/penawaran"] },
  { action: "sendJobChangeOrder", definedIn: "src/actions/job-change-order.actions.ts", callersIn: ["produksi/perintah-kerja"] },
  { action: "sendQuotation", definedIn: "src/actions/sales.actions.ts", callersIn: ["penjualan/penawaran"] },
  { action: "settleWithholdingTaxAction", definedIn: "src/actions/tax-documents.actions.ts", callersIn: ["keuangan/dokumen-pajak"] },
  { action: "shipDeliveryOrder", definedIn: "src/actions/sales.actions.ts", callersIn: ["penjualan/surat-jalan"] },
  { action: "startProductionOrder", definedIn: "src/actions/manufacturing.actions.ts", callersIn: ["produksi/production-orders"] },
  { action: "startWorkOrder", definedIn: "src/actions/manufacturing.actions.ts", callersIn: ["produksi/perintah-kerja"] },
  { action: "submitBomRevisionForApproval", definedIn: "src/actions/manufacturing.actions.ts", callersIn: ["produksi/bom-revisi"] },
  { action: "submitContractDecisionRequest", definedIn: "src/actions/probation.actions.ts", callersIn: ["master/karyawan"] },
  { action: "submitDisciplinaryRecord", definedIn: "src/actions/disciplinary.actions.ts", callersIn: ["components/reports"] },
  { action: "submitManagerReview", definedIn: "src/actions/performance.actions.ts", callersIn: ["sdm/kinerja"] },
  { action: "submitMaterialRequest", definedIn: "src/actions/material-request.actions.ts", callersIn: ["inventaris/permintaan-gudang"] },
  { action: "submitProbationReview", definedIn: "src/actions/probation.actions.ts", callersIn: ["master/karyawan"] },
  { action: "submitSelfReview", definedIn: "src/actions/performance.actions.ts", callersIn: ["sdm/kinerja"] },
  { action: "updateProductionCost", definedIn: "src/actions/production-cost.actions.ts", callersIn: ["produksi/production-orders"] },
  { action: "verifyGoodsReceipt", definedIn: "src/actions/purchase.actions.ts", callersIn: ["pembelian/penerimaan"] },
  { action: "verifyPhotoAttachment", definedIn: "src/actions/attachment-photo.actions.ts", callersIn: ["components/reports"] },
  { action: "voidDisciplinaryRecord", definedIn: "src/actions/disciplinary.actions.ts", callersIn: ["components/reports"] },
  { action: "voidSalesInvoice", definedIn: "src/actions/sales.actions.ts", callersIn: ["penjualan/faktur"] },
  { action: "voidVendorBill", definedIn: "src/actions/purchase.actions.ts", callersIn: ["pembelian/tagihan"] },
  { action: "writeOffEmployeeLoan", definedIn: "src/actions/hrm.actions.ts", callersIn: ["components/sdm"] },
]

/**
 * Aksi transisi yang (terverifikasi) BELUM punya pemanggil UI, didaftarkan
 * eksplisit supaya "tak terjangkau" menjadi keadaan yang diketahui dan
 * beralasan — bukan senyap. Berarah dua: tiap entri harus benar-benar belum
 * tersambung menurut detektor di bawah, aksinya harus masih ada; begitu ada
 * yang menyambungkannya (atau menghapusnya), test memerahkan dan memaksa
 * daftar diperbarui.
 */
const ALLOWED_UNWIRED: Array<{ action: string; definedIn: string; reason: string }> = [
  {
    action: "cancelWorkOrder",
    definedIn: "src/actions/manufacturing.actions.ts",
    reason:
      "F-2026-10-21-012 inti backend dulu; tombol batal perintah kerja menyusul (frontend) — selaras daftar-beku action-wiring; 0 rujukan produksi di luar pendefinisi (terverifikasi grep + detektor ini)",
  },
  {
    action: "releaseStockReservation",
    definedIn: "src/actions/manufacturing.actions.ts",
    reason:
      "F-2026-10-21-012 inti backend dulu; tombol lepas reservasi menyusul (frontend) — yang terpakai produksi adalah helper transaksional releaseStockReservationTx, bukan aksi ini; 0 rujukan produksi di luar pendefinisi",
  },
  {
    action: "pullLaborCostFromWorkOrderTimesheets",
    definedIn: "src/actions/production-cost.actions.ts",
    reason:
      "F-2026-10-21-019 backend dulu; UI pull labor perintah kerja menyusul (frontend) — varian pullLaborCostFromTimesheets yang tersambung; 0 rujukan produksi di luar pendefinisi",
  },
]

/** Awalan kata kerja transisi status/dokumen untuk tes cakupan: setiap aksi
 *  server bernama begini wajib tercatat di REQUIRED_CALLERS/ALLOWED_UNWIRED.
 *  Bukan daftar aksi — pola nama, supaya aksi transisi BARU tak bisa lolos
 *  diam-diam. Nama generik non-transisi dikecualikan eksplisit di bawah. */
const TRANSITION_PREFIX =
  /^(post|confirm|approve|reject|cancel|void|ship|deliver|complete|close|release|reverse|apply|process|accept|send|submit|pay|mark|publish|deactivate|finalize|reopen|start|issue|receive|convert|settle|writeOff|decide|verify|allocate|lock|restore|acknowledge)/
const TRANSITION_EXTRA = new Set(["reviseQuotation", "deleteSalesOrder", "updateProductionCost"])
const NON_TRANSITION = new Set([
  "bulkDelete", // penghapusan massal generik per-model, bukan transisi dokumen tunggal
  "calculateStandardCost", // hitung ulang biaya standar (komputasi, bukan transisi status)
  "assignEmployeePayrollComponent", // penugasan komponen gaji (CRUD relasi, bukan transisi)
  "attachPkwtEventToPayroll", // penautan peristiwa ke slip (CRUD relasi, bukan transisi)
  "assessEmployeeCompetency", // penilaian kompetensi (pencatatan, bukan transisi dokumen)
  "pullLaborCostFromTimesheets", // BUKAN pengecualian — placeholder agar jelas: lihat di bawah
])
// pullLaborCostFromTimesheets ADALAH transisi tersambung; keluarkan dari pengecualian.
NON_TRANSITION.delete("pullLaborCostFromTimesheets")

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, acc)
    else if (/\.tsx?$/.test(entry.name)) acc.push(full)
  }
  return acc
}

/**
 * Kosongkan isi komentar sambil mempertahankan string/template, panjang, dan
 * posisi baris — supaya sebutan aksi di komentar tak terbaca sebagai panggilan.
 */
function blankComments(src: string): string {
  const out = src.split("")
  const n = src.length
  let i = 0
  while (i < n) {
    const c = src[i]
    const c2 = src[i + 1]
    if (c === "/" && c2 === "/") {
      while (i < n && src[i] !== "\n") { out[i] = " "; i++ }
      continue
    }
    if (c === "/" && c2 === "*") {
      out[i] = " "; if (i + 1 < n) out[i + 1] = " "
      i += 2
      while (i < n && !(src[i] === "*" && src[i + 1] === "/")) {
        if (src[i] !== "\n") out[i] = " "
        i++
      }
      if (i < n) { out[i] = " "; if (i + 1 < n) out[i + 1] = " "; i += 2 }
      continue
    }
    if (c === '"' || c === "'" || c === "`") {
      const quote = c
      i++
      while (i < n) {
        if (src[i] === "\\") { i += 2; continue }
        if (src[i] === quote) { i++; break }
        if (quote !== "`" && src[i] === "\n") break
        i++
      }
      continue
    }
    i++
  }
  return out.join("")
}

/** Kosongkan isi string/template literal (untuk pindaian tag JSX: nama aksi di
 *  dalam string label bukan rujukan). Panjang dipertahankan. */
function blankStrings(src: string): string {
  const out = src.split("")
  const n = src.length
  let i = 0
  while (i < n) {
    const c = src[i]
    if (c === '"' || c === "'" || c === "`") {
      const quote = c
      i++
      while (i < n) {
        if (src[i] === "\\") { out[i] = " "; if (i + 1 < n) out[i + 1] = " "; i += 2; continue }
        if (src[i] === quote) { i++; break }
        if (src[i] !== "\n") out[i] = " "
        i++
      }
      continue
    }
    i++
  }
  return out.join("")
}

const REPO_ROOT = process.cwd()

/** Resolve specifier impor ke berkas nyata (coba ekstensi + index), pola
 *  yang sama dengan `specPointsTo` di action-wiring.test.ts. */
function resolveSpecifier(fromFile: string, spec: string): string | null {
  const normalized = spec.replace(/\\/g, "/").replace(/\.(?:ts|tsx|mts|cts)$/, "")
  let candidate: string
  if (normalized.startsWith("@/")) {
    candidate = path.join(REPO_ROOT, "src", normalized.slice(2))
  } else if (normalized.startsWith("./") || normalized.startsWith("../")) {
    candidate = path.resolve(path.dirname(fromFile), normalized)
  } else return null
  for (const cand of [candidate, `${candidate}.tsx`, `${candidate}.ts`, path.join(candidate, "index.tsx"), path.join(candidate, "index.ts")]) {
    if (fs.existsSync(cand) && fs.statSync(cand).isFile()) return cand
  }
  return null
}

function specPointsTo(fromFile: string, spec: string, defFileAbs: string): boolean {
  const resolved = resolveSpecifier(fromFile, spec)
  if (resolved) return resolved === defFileAbs
  // Cadangan tanpa FS (pemanggil sintetis di self-test): cocokkan suffix modul.
  const base = defFileAbs.split(path.sep).join("/").replace(/\.tsx?$/, "")
  const norm = spec.replace(/\\/g, "/").replace(/\.(?:ts|tsx)$/, "")
  const cand = norm.startsWith("@/") ? `src/${norm.slice(2)}` : norm
  return base === cand || base.endsWith(`/${cand.split("/").pop()}`)
}

/** Binding impor statis dari satu berkas (bebas komentar). */
interface ImportBinding { local: string; imported: string; spec: string }
function staticBindings(source: string): ImportBinding[] {
  const out: ImportBinding[] = []
  for (const m of source.matchAll(/import\s+(?!type\b)([\s\S]*?)\s+from\s+["']([^"']+)["']/g)) {
    const clause = m[1].trim()
    const ns = /^\*\s+as\s+(\w+)$/.exec(clause)
    if (ns) { out.push({ local: ns[1], imported: "*", spec: m[2] }); continue }
    const braceStart = clause.indexOf("{")
    if (braceStart === -1) continue
    const braceEnd = clause.lastIndexOf("}")
    for (const part of clause.slice(braceStart + 1, braceEnd).split(",")) {
      const p = part.trim()
      if (!p || p.startsWith("type ")) continue
      const b = /^(\w+)(?:\s+as\s+(\w+))?$/.exec(p)
      if (b) out.push({ local: b[2] ?? b[1], imported: b[1], spec: m[2] })
    }
  }
  return out
}

/**
 * Registri invoker OTOMATIS: berkas -> himpunan prop pemanggil.
 * Invoker = berkas UI (`src/components`/`src/app`) yang mendeklarasikan prop
 * bertipe fungsi (`nama: (...) => ...`, di luar prop `on*` handler UI biasa)
 * DAN memanggil prop itu di badannya. Menggantikan GENERIC_INVOKERS beku:
 * komponen invoker baru (atau prop yang direnama) terdeteksi tanpa mengedit
 * penjaga ini. ponytail: heuristik regex, bukan AST — prop bertipe alias
 * fungsi dari berkas lain tak terlihat; naikkan ke AST bila itu menggigit.
 */
type InvokerRegistry = Map<string, Set<string>>
function discoverInvokers(files: string[]): InvokerRegistry {
  const registry: InvokerRegistry = new Map()
  for (const file of files) {
    const rel = path.relative(REPO_ROOT, file).split(path.sep).join("/")
    if (!rel.startsWith("src/components/") && !rel.startsWith("src/app/")) continue
    if (rel.includes("__tests__")) continue
    const source = blankComments(fs.readFileSync(file, "utf8"))
    const props = new Set<string>()
    for (const m of source.matchAll(/\b([A-Za-z_$][A-Za-z0-9_$]*)\??\s*:\s*\([^)]*\)\s*=>/g)) {
      const name = m[1]
      if (/^on[A-Z]/.test(name)) continue // handler UI (onChange/onPress/…), bukan slot aksi server
      if (name === "printAction") continue // cetak lokal, bukan aksi server
      // Benar-benar dipanggil di badan berkas (bukan sekadar deklarasi tipe)?
      const callRe = new RegExp(`(?<![\\w$.])${name}\\s*(?:\\?\\.)?\\s*\\(`)
      // Buang kemunculan deklarasi tipenya sendiri sebelum menguji panggilan.
      const withoutDecl = source.replace(
        new RegExp(`\\b${name}\\??\\s*:\\s*\\([^)]*\\)\\s*=>[^,;\\n]*`, "g"),
        " ",
      )
      if (callRe.test(withoutDecl)) props.add(name)
    }
    if (props.size > 0) registry.set(file, props)
  }
  return registry
}

/** Nama lokal aksi di berkas pemanggil + namespace-nya (bila impor namespace). */
function actionLocals(
  action: string,
  bersih: string,
  callerFile: string,
  definedInAbs: string,
): { locals: string[]; namespaces: string[] } {
  const locals: string[] = []
  const namespaces: string[] = []
  for (const b of staticBindings(bersih)) {
    if (!specPointsTo(callerFile, b.spec, definedInAbs)) continue
    if (b.imported === "*") namespaces.push(b.local)
    else if (b.imported === action) locals.push(b.local)
  }
  // Dynamic import: destructure (dengan/ tanpa alias) dari modul pendefinisi.
  for (const m of bersih.matchAll(/\{([^}]*)\}\s*=\s*await\s+import\s*\(\s*["']([^"']+)["']\s*\)/g)) {
    if (!specPointsTo(callerFile, m[2], definedInAbs)) continue
    for (const part of m[1].split(",")) {
      const b = /^\s*(\w+)\s*(?::\s*(\w+))?\s*$/.exec(part)
      if (b && b[1] === action) locals.push(b[2] ?? b[1])
    }
  }
  // Dynamic import ke variabel modul: `const m = await import(...)` lalu `m.aksi(...)`.
  for (const m of bersih.matchAll(/(?:const|let|var)\s+(\w+)\s*=\s*await\s+import\s*\(\s*["']([^"']+)["']\s*\)/g)) {
    if (specPointsTo(callerFile, m[2], definedInAbs)) namespaces.push(m[1])
  }
  return { locals, namespaces }
}

/** Teks tag JSX `<Nama ...>` penuh (kurung kurawal seimbang, `>` di dalamnya aman). */
function jsxTagTexts(bersih: string, nama: string): string[] {
  const tags: string[] = []
  const tagRe = new RegExp(`<${nama}\\b`, "g")
  let t: RegExpExecArray | null
  while ((t = tagRe.exec(bersih)) !== null) {
    let depth = 0
    let end = t.index
    for (; end < bersih.length; end++) {
      if (bersih[end] === "{") depth++
      else if (bersih[end] === "}") depth--
      else if (bersih[end] === ">" && depth === 0) break
    }
    tags.push(bersih.slice(t.index, end))
  }
  return tags
}

/**
 * Tersambung NYATA bila aksi (wajib ter-resolve ke modul pendefinisinya lewat
 * impor statis/namespace/dynamic — nama polos, fungsi lokal bernama sama,
 * impor dari modul lain, dan sebutan komentar TIDAK dihitung) lalu salah satu:
 *  (a) dipanggil langsung `lokal(...)` / `ns.aksi(...)` / `(await import(...)).aksi(...)`;
 *  (b) diteruskan by-reference sebagai argumen pemanggilan mana pun (helper
 *      submit `run(lokal)`, `useActionState(lokal, ...)`, form `action={lokal}`),
 *      termasuk lewat `lokal.bind(...)`;
 *  (c) diteruskan sebagai nilai prop APA PUN / spread / `.bind` di tag JSX
 *      komponen invoker terimpor (registri otomatis discoverInvokers).
 */
function isWired(
  action: string,
  source: string,
  definedIn: string,
  invokers: InvokerRegistry = new Map(),
  callerFile: string = path.join(REPO_ROOT, "src/components/__pemanggil_sintetis__.tsx"),
  preBlanked = false,
): boolean {
  const bersih = preBlanked ? source : blankComments(source)
  const definedInAbs = path.join(REPO_ROOT, definedIn)
  const { locals, namespaces } = actionLocals(action, bersih, callerFile, definedInAbs)
  const hasDynamicDirect =
    new RegExp(`\\(\\s*await\\s+import\\s*\\([^)]*\\)\\s*\\)\\s*\\.\\s*${action}\\b`).test(bersih) &&
    [...bersih.matchAll(/import\s*\(\s*["']([^"']+)["']\s*\)/g)].some((m) =>
      specPointsTo(callerFile, m[1], definedInAbs),
    )
  if (locals.length === 0 && namespaces.length === 0 && !hasDynamicDirect) return false
  if (hasDynamicDirect) return true

  // Rentang tag JSX (untuk memisahkan konteks prop dari argumen pemanggilan):
  // by-reference di dalam tag hanya sah lewat jalur invoker (c), bukan helper (b).
  const jsxSpans: Array<[number, number]> = []
  for (const tm of bersih.matchAll(/<[A-Za-z][\w.]*\b/g)) {
    let depth = 0
    let end = tm.index
    for (; end < bersih.length; end++) {
      if (bersih[end] === "{") depth++
      else if (bersih[end] === "}") depth--
      else if (bersih[end] === ">" && depth === 0) break
    }
    jsxSpans.push([tm.index, end])
  }
  const inJsx = (idx: number) => jsxSpans.some(([s, e]) => idx >= s && idx <= e)

  for (const lokal of locals) {
    // (a) Pemanggilan langsung — bukan metode (`obj.aksi(`), bukan deklarasi.
    const callRe = new RegExp(`\\b${lokal}\\s*\\(`, "g")
    let m: RegExpExecArray | null
    while ((m = callRe.exec(bersih)) !== null) {
      const before = bersih.slice(Math.max(0, m.index - 12), m.index)
      if (/[.\w$]$/.test(before) || /\bfunction\s*$/.test(before)) continue
      return true
    }
    // (b) By-reference / .bind sebagai argumen: didahului `(`, `,`, `{`, `=`,
    // `:` , `[`, `?`, `!`, kata `return`, atau spread `...`.
    const refRe = new RegExp(`\\b${lokal}\\b`, "g")
    while ((m = refRe.exec(bersih)) !== null) {
      const beforeAll = bersih.slice(0, m.index).replace(/\s+$/, "")
      // Di dalam tag JSX: nilai prop langsung hanya dinilai jalur invoker (c);
      // tetapi argumen pemanggilan helper di dalam atribut (mis.
      // `onPress={() => run(approveEmployeeRoster, ...)}`) tetap helper (b).
      if (inJsx(m.index) && !beforeAll.endsWith("(")) continue
      const before = beforeAll
      const after = bersih.slice(m.index + lokal.length).replace(/^\s+/, "")
      const prevChar = before.slice(-1)
      const passedByRef =
        ["(", ",", "{", "=", ":", "[", "?", "!"].includes(prevChar) ||
        before.endsWith("...") ||
        /\breturn$/.test(before)
      if (!passedByRef) continue
      // Bukan deklarasi impor / bukan kunci objek tak berkaitan yang kebetulan
      // bernama sama: impor sudah dibuang dari makna ini karena `import {`
      // mendahului — saring konteks impor & tipe.
      const lineStart = bersih.lastIndexOf("\n", m.index) + 1
      const linePrefix = bersih.slice(lineStart, m.index)
      if (/\bimport\b/.test(linePrefix) || /:\s*$/.test(linePrefix) && /\(/.test(after.slice(0, 1) + "") && prevChar === ":") {
        // `nama: (args) => ...` deklarasi tipe — lewati bila pola tipe fungsi.
        if (/^\([^)]*\)\s*=>/.test(bersih.slice(m.index + lokal.length).replace(/^\s*:\s*/, ":"))) continue
      }
      if (/\bimport\s*\{[^}]*$/.test(before)) continue
      if (after.startsWith("(")) continue // sudah ditangani (a); deklarasi fungsi lokal juga ke sini
      return true
    }
  }
  // (a2) Namespace: `ns.aksi(...)` / `ns.aksi` by-reference / `.bind`.
  for (const ns of namespaces) {
    if (new RegExp(`\\b${ns}\\s*\\.\\s*${action}\\b`).test(bersih)) return true
  }

  // (b2) Form bawaan React: <form action={aksi}> — React yang memanggilnya.
  for (const lokal of locals) {
    for (const tag of jsxTagTexts(bersih, "form")) {
      if (new RegExp(`\\baction\\s*=\\s*\\{[^}]*\\b${lokal}\\b`).test(blankStrings(tag))) return true
    }
  }

  // (c) Tag JSX komponen invoker terimpor yang menyebut nama lokal aksi di
  // nilai prop apa pun / spread / bind (isi string dikosongkan dulu).
  if (locals.length > 0 && invokers.size > 0) {
    const bindings = staticBindings(bersih)
    for (const b of bindings) {
      if (b.imported === "*") continue
      const resolved = resolveSpecifier(callerFile, b.spec)
      // Self-test sintetis tanpa FS: cocokkan nama berkas invoker.
      const invokerFile = resolved
        ? invokers.has(resolved) ? resolved : null
        : [...invokers.keys()].find((f) => {
            const base = f.split(path.sep).pop()!.replace(/\.tsx?$/, "")
            return b.spec === `@/components/ui/${base}` || b.spec.endsWith(`/${base}`) || b.spec.endsWith(`/${base}.tsx`)
          }) ?? null
      if (!invokerFile) continue
      for (const lokal of locals) {
        for (const tag of jsxTagTexts(bersih, b.local)) {
          if (new RegExp(`\\b${lokal}\\b`).test(blankStrings(tag))) return true
        }
      }
    }
  }
  return false
}

describe("aksi transisi wajib tersambung ke UI", () => {
  const files = walk(path.join(REPO_ROOT, "src"))
  const invokers = discoverInvokers(files)
  const sourceOf = new Map<string, string>()
  const blankedOf = (file: string) => {
    if (!sourceOf.has(file)) sourceOf.set(file, blankComments(fs.readFileSync(file, "utf8")))
    return sourceOf.get(file)!
  }
  const wiredIn = (action: string, definedIn: string) =>
    files.filter((file) => {
      const rel = path.relative(REPO_ROOT, file).split(path.sep).join("/")
      if (rel === definedIn) return false
      if (rel.includes("__tests__")) return false
      // Pra-saring murah: berkas tanpa token nama aksi tak mungkin tersambung.
      if (!blankedOf(file).includes(action)) return false
      return isWired(action, blankedOf(file), definedIn, invokers, file, true)
    })

  it("registri invoker otomatis menemukan invoker generik yang dikenal", () => {
    const rels = [...invokers.keys()].map((f) => path.relative(REPO_ROOT, f).split(path.sep).join("/"))
    for (const dikenal of [
      "src/components/ui/process-button.tsx",
      "src/components/ui/delete-button.tsx",
      "src/components/ui/void-button.tsx",
      "src/components/ui/action-dropdown.tsx",
      "src/components/ui/draft-release-actions.tsx",
      "src/components/ui/reverse-payment-button.tsx",
      "src/components/ui/tax-invoice-number-button.tsx",
      "src/components/ui/action-form.tsx",
      "src/components/reports/revision-action-button.tsx",
    ]) {
      expect(rels, `invoker dikenal tak terdeteksi otomatis: ${dikenal}`).toContain(dikenal)
    }
    expect(invokers.get(path.join(REPO_ROOT, "src/components/ui/draft-release-actions.tsx"))).toEqual(
      expect.objectContaining(new Set(["releaseAction"])),
    )
    // Komponen non-invoker tak boleh masuk: combobox memanggil handler UI-nya
    // (on* terlarang) — memasukkannya akan membuat rantai palsu.
    expect(rels).not.toContain("src/components/ui/combobox.tsx")
    expect(rels.length).toBeGreaterThanOrEqual(9)
  })

  it("detektor: import/sebutan/fungsi-lokal/komponen-bukan-invoker tidak dihitung", () => {
    const def = "src/actions/sales.actions.ts"
    const imp = `import { postInvoice } from "@/actions/sales.actions"\n`
    const inv = new Map<string, Set<string>>([
      [path.join(REPO_ROOT, "src/components/ui/process-button.tsx"), new Set(["action"])],
    ])
    const sintetik = path.join(REPO_ROOT, "src/app/(dashboard)/penjualan/faktur/_components/sintetis.tsx")
    const wired = (src: string) => isWired("postInvoice", src, def, inv, sintetik)
    // Hanya diimpor, tak pernah dipanggil/diteruskan → tak tersambung.
    expect(wired(imp + "export const x = 1")).toBe(false)
    // Disebut di komentar sebagai panggilan → tak tersambung.
    expect(wired(imp + "// await postInvoice(id)")).toBe(false)
    // Fungsi lokal bernama sama tanpa import → tak tersambung.
    expect(wired("async function postInvoice(id: number) { return id }")).toBe(false)
    // Diimpor dari modul LAIN lalu dipanggil → tak tersambung.
    expect(wired(`import { postInvoice } from "@/actions/other.actions"\nawait postInvoice(id)`)).toBe(false)
    // Metode objek bernama sama → tak tersambung.
    expect(wired(imp + "await api.postInvoice(id)")).toBe(false)
    // Panggilan langsung (termasuk lewat arrow pembungkus) → tersambung.
    expect(wired(imp + "onPress={() => run(() => postInvoice(id))}")).toBe(true)
    // Alias import yang dipanggil → tersambung.
    expect(wired(`import { postInvoice as postInv } from "@/actions/sales.actions"\nawait postInv(id)`)).toBe(true)
    // Diteruskan ke komponen generik yang terbukti memanggil prop-nya → tersambung.
    expect(
      wired(
        imp +
          `import { ProcessButton } from "@/components/ui/process-button"\n` +
          `<ProcessButton id={id} action={status === "draft" ? postInvoice : undefined} />`,
      ),
    ).toBe(true)
    // Diteruskan ke komponen BUKAN invoker → rantai putus, tak tersambung.
    expect(
      wired(
        imp +
          `import { FancyButton } from "@/components/ui/fancy-button"\n` +
          `<FancyButton action={postInvoice} />`,
      ),
    ).toBe(false)
    // Nama aksi hanya di string label tag invoker → tak tersambung.
    expect(
      wired(
        imp +
          `import { ProcessButton } from "@/components/ui/process-button"\n` +
          `<ProcessButton id={id} label="postInvoice" action={undefined} />`,
      ),
    ).toBe(false)
  })

  it("detektor: pola sah spread/bind/dynamic-import/helper/prop-renama terhitung", () => {
    const def = "src/actions/sales.actions.ts"
    const imp = `import { postInvoice } from "@/actions/sales.actions"\n`
    const inv = new Map<string, Set<string>>([
      [path.join(REPO_ROOT, "src/components/ui/process-button.tsx"), new Set(["action"])],
      [path.join(REPO_ROOT, "src/components/ui/draft-release-actions.tsx"), new Set(["releaseAction", "deleteAction"])],
    ])
    const sintetik = path.join(REPO_ROOT, "src/app/(dashboard)/penjualan/faktur/_components/sintetis.tsx")
    const wired = (src: string) => isWired("postInvoice", src, def, inv, sintetik)
    // Spread props: aksi di dalam objek yang di-spread ke invoker.
    expect(
      wired(
        imp +
          `import { ProcessButton } from "@/components/ui/process-button"\n` +
          `<ProcessButton id={id} {...{ action: postInvoice }} />`,
      ),
    ).toBe(true)
    // .bind: argumen bind ke invoker + bind by-reference ke helper.
    expect(
      wired(
        imp +
          `import { ProcessButton } from "@/components/ui/process-button"\n` +
          `<ProcessButton id={id} action={postInvoice.bind(null, id)} />`,
      ),
    ).toBe(true)
    expect(wired(imp + "const kirim = postInvoice.bind(null, id)")).toBe(true)
    // Prop direnama pada invoker (releaseAction, bukan action/processAction/deleteAction).
    expect(
      wired(
        imp +
          `import { DraftReleaseActions } from "@/components/ui/draft-release-actions"\n` +
          `<DraftReleaseActions releaseAction={postInvoice} deleteAction={postInvoice} />`,
      ),
    ).toBe(true)
    // Prop nama bebas apa pun pada invoker terimpor.
    expect(
      wired(
        imp +
          `import { ProcessButton } from "@/components/ui/process-button"\n` +
          `<ProcessButton id={id} onPosting={postInvoice} />`,
      ),
    ).toBe(true)
    // Helper submit: diteruskan by-reference ke helper lokal.
    expect(wired(imp + "function run(fn: () => Promise<void>) { return fn } \n run(postInvoice)")).toBe(true)
    expect(wired(imp + "const [state, formAction] = useActionState(postInvoice, null)")).toBe(true)
    // Form action bawaan React: <form action={aksi}>.
    expect(wired(imp + "<form action={postInvoice}></form>")).toBe(true)
    // Dynamic import: destructure lalu panggil; akses properti langsung; alias destructure.
    expect(wired(`const { postInvoice } = await import("@/actions/sales.actions")\nawait postInvoice(id)`)).toBe(true)
    expect(wired(`const { postInvoice: postInv } = await import("@/actions/sales.actions")\nawait postInv(id)`)).toBe(true)
    expect(wired(`(await import("@/actions/sales.actions")).postInvoice(id)`)).toBe(true)
    expect(wired(`const m = await import("@/actions/sales.actions")\nm.postInvoice(id)`)).toBe(true)
    // Dynamic import dari modul LAIN → tak tersambung.
    expect(wired(`const { postInvoice } = await import("@/actions/other.actions")\nawait postInvoice(id)`)).toBe(false)
    // Namespace import lalu panggil anggotanya.
    expect(wired(`import * as sales from "@/actions/sales.actions"\nawait sales.postInvoice(id)`)).toBe(true)
  })

  for (const { action, definedIn, callersIn } of REQUIRED_CALLERS) {
    it(`${action} dipanggil dari ${callersIn.join(" atau ")}`, () => {
      const callers = wiredIn(action, definedIn)
      expect(callers.length, `${action} tidak dipanggil dari mana pun`).toBeGreaterThan(0)
      const inExpectedModule = callers.some((file) =>
        callersIn.some((mod) => path.relative(REPO_ROOT, file).split(path.sep).join("/").includes(mod)),
      )
      expect(
        inExpectedModule,
        `${action} hanya dipanggil dari ${callers.map((f) => path.relative(REPO_ROOT, f)).join(", ")} — tidak ada di ${callersIn.join("/")}`,
      ).toBe(true)
    })
  }

  it("cakupan: setiap aksi transisi tercatat (REQUIRED atau ALLOWED_UNWIRED)", () => {
    const tercatat = new Set([
      ...REQUIRED_CALLERS.map((e) => `${e.definedIn}::${e.action}`),
      ...ALLOWED_UNWIRED.map((e) => `${e.definedIn}::${e.action}`),
    ])
    const hilang: string[] = []
    for (const file of files) {
      const rel = path.relative(REPO_ROOT, file).split(path.sep).join("/")
      if (!rel.startsWith("src/actions/") || !rel.endsWith(".actions.ts")) continue
      const bersih = blankComments(fs.readFileSync(file, "utf8"))
      for (const m of bersih.matchAll(/export\s+async\s+function\s+(\w+)/g)) {
        const name = m[1]
        if (!(TRANSITION_PREFIX.test(name) || TRANSITION_EXTRA.has(name))) continue
        if (NON_TRANSITION.has(name)) continue
        if (!tercatat.has(`${rel}::${name}`)) hilang.push(`${rel}::${name}`)
      }
    }
    expect(
      hilang,
      "Aksi transisi tanpa catatan: sambungkan + masukkan REQUIRED_CALLERS, atau daftar ALLOWED_UNWIRED dengan alasan jujur",
    ).toEqual([])
    // Arah sebaliknya: entri REQUIRED/ALLOWED yang aksinya sudah tak ada = basi.
    const basi: string[] = []
    for (const e of [...REQUIRED_CALLERS, ...ALLOWED_UNWIRED]) {
      const sumber = fs.readFileSync(path.join(REPO_ROOT, e.definedIn), "utf8")
      if (!new RegExp(`export async function ${e.action}\\b`).test(sumber)) basi.push(`${e.definedIn}::${e.action}`)
    }
    expect(basi, "Entri basi (aksi sudah dihapus): keluarkan dari daftar").toEqual([])
  })
})

/**
 * Arah kedua: entri di ALLOWED_UNWIRED harus benar-benar belum tersambung. Begitu
 * ada yang menyambungkannya, test memerahkan dan memaksa daftar diperbarui.
 */
describe("aksi transisi tanpa pemanggil UI terdaftar & tetap tak tersambung", () => {
  const files = walk(path.join(REPO_ROOT, "src"))
  const invokers = discoverInvokers(files)

  for (const { action, definedIn, reason } of ALLOWED_UNWIRED) {
    it(`${action} masih belum tersambung — ${reason}`, () => {
      const refs = files.filter((file) => {
        const rel = path.relative(REPO_ROOT, file).split(path.sep).join("/")
        if (rel === definedIn) return false
        if (rel.includes("__tests__")) return false
        const bersih = blankComments(fs.readFileSync(file, "utf8"))
        if (!bersih.includes(action)) return false
        return isWired(action, bersih, definedIn, invokers, file, true)
      })
      expect(
        refs.map((f) => path.relative(REPO_ROOT, f)),
        `${action} sudah tersambung — hapus dari ALLOWED_UNWIRED dan pindahkan ke REQUIRED_CALLERS`,
      ).toHaveLength(0)

      const sumber = fs.readFileSync(path.join(REPO_ROOT, definedIn), "utf8")
      expect(
        new RegExp(`export async function ${action}\\b`).test(sumber),
        `${action} tidak lagi ada di ${definedIn} — hapus entri ini dari ALLOWED_UNWIRED`,
      ).toBe(true)
    })
  }
})
