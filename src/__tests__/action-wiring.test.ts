import { describe, it, expect } from "vitest"
import { readFileSync, readdirSync, statSync } from "node:fs"
import { join, relative } from "node:path"

// Penjaga "aksi server tanpa rujukan".
//
// Kelas celah yang sudah terbukti nyata: sebuah server action lengkap
// (penjagaan izin, validasi, log aktivitas, tes) tetapi tidak ada UI yang
// memanggilnya. Contoh yang pernah terjadi: `updateUserRoles` dan
// `toggleUserActive` — halaman detail pengguna hanya bisa MENAMPILKAN peran dan
// status, sehingga admin tak punya cara mengubahnya (diperbaiki dengan panel
// Akses & Peran), dan `convertQuotationToOrder` yang penjagaannya tidak pernah
// berjalan karena tak ada pemanggil.
//
// Aturan penjaga: setiap fungsi yang diekspor dari src/actions/*.actions.ts
// harus dirujuk minimal satu berkas lain di src (di luar berkas tes), KECUALI
// terdaftar di daftar-beku dengan alasan tertulis. Penjaga ini berarah dua:
// entri yang sudah tidak perlu (aksinya kini dirujuk) memerahkan tes.

const ROOT = process.cwd()
const ACTIONS_DIR = join(ROOT, "src", "actions")

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry)
    if (statSync(p).isDirectory()) walk(p, out)
    else out.push(p)
  }
  return out
}

const srcFiles = walk(join(ROOT, "src")).filter(
  (f) => (f.endsWith(".ts") || f.endsWith(".tsx")) && !f.includes("__tests__"),
)

const actionFiles = srcFiles.filter(
  (f) => f.startsWith(ACTIONS_DIR) && f.endsWith(".actions.ts"),
)

interface ExportedAction {
  file: string
  key: string
  name: string
}

const actions: ExportedAction[] = []
for (const file of actionFiles) {
  const body = readFileSync(file, "utf8")
  for (const m of body.matchAll(/export\s+async\s+function\s+([A-Za-z_][A-Za-z0-9_]*)/g)) {
    actions.push({ file, key: `${relative(ROOT, file)}::${m[1]}`, name: m[1] })
  }
}

// Satu lintasan baca untuk semua berkas: membaca ulang tiap berkas per aksi
// (326 aksi x ~2000 berkas) melewati batas waktu tes.
const fileContents = srcFiles.map((f) => ({ file: f, text: readFileSync(f, "utf8") }))
const combined = new RegExp(`\\b(${actions.map((a) => a.name).join("|")})\\b`, "g")
const references = new Map<string, Set<string>>()
for (const { file, text } of fileContents) {
  for (const m of text.matchAll(combined)) {
    const name = m[1]
    if (!references.has(name)) references.set(name, new Set())
    references.get(name)!.add(file)
  }
}

function isReferencedElsewhere(action: ExportedAction): boolean {
  const holders = references.get(action.name)
  if (!holders) return false
  for (const holder of holders) if (holder !== action.file) return true
  return false
}

// Daftar-beku: kunci = "<berkas>::<aksi>", nilai = alasan tertulis.
const ALLOWED_UNWIRED: Record<string, string> = {
  // F-2026-10-25-005-S DISC-B1: 8 aksi SP kini dirujuk UI DISC-F1
  // (disciplinary-request-form.tsx + disciplinary-record-actions.tsx)
  // — entri beku DISC-B1 dibuang.
  // F-2026-10-25-004-V: issueDownPaymentTaxInvoiceAction kini dirujuk UI
  // panel status pajak DP (PR konsumen t_b83159ba) — entri beku dibuang.
  // Jalur publik yang sengaja diekspor dan sudah terdaftar di daftar-beku penjaga
  // izin (action-guard-coverage.test.ts). UI-nya memakai next-auth langsung.
  "src/actions/auth.actions.ts::loginAction":
    "jalur publik (login sebelum sesi ada); form masuk memakai signIn next-auth di src/components/login-form.tsx",
  "src/actions/auth.actions.ts::logoutAction":
    "jalur publik (mengakhiri sesi); keluar memakai signOut next-auth di src/components/layout/nav-user.tsx dan header.tsx",
  // Bacaan yang belum punya pemanggil. Dibiarkan tercatat, bukan disembunyikan:
  // keputusan "hapus atau sambungkan" milik pemilik repo.
  // F-2026-10-24-132-V: 4 aksi PKWT kini dirujuk UI panel kompensasi
  // (pkwt-compensation-panel.tsx, PR #724) — entri beku dibuang.
  "src/actions/cron.actions.ts::getCronLogs":
    "tanpa pemanggil UI; halaman /pengaturan/cron membaca prisma.cronLog langsung — aksi ini duplikat, kandidat dihapus",
  "src/actions/project.actions.ts::getProjectStageProgress":
    "tanpa pemanggil UI; halaman /proyek/[slug] membaca prisma.projectStage dan menghitung persentase sendiri — kandidat dihapus",
  "src/actions/project.actions.ts::getProjectProgress":
    "tanpa pemanggil UI; halaman proyek menghitung progres dari tugasnya sendiri — kandidat dihapus",
  "src/actions/manufacturing.actions.ts::getWorkOrderWithCustomerInfo":
    "tanpa pemanggil UI; detail perintah kerja sudah memuat relasi yang dibutuhkan sendiri — kandidat dihapus",
  "src/actions/hrm.actions.ts::getBulkPayrollEstimations":
    "tanpa pemanggil UI. Sudah diverifikasi: logika intinya (computeBulkPayrollEstimations) DIPAKAI aksi yang tersambung UI — generateBulkPayroll lewat bulk-generate-payroll-button.tsx:67 — dan versi tunggal getPayrollEstimation juga terpakai. Jadi wrapper massal ini memang tidak dibutuhkan UI saat ini: kandidat dihapus, bukan celah fitur yang hilang.",
  // F-2026-10-25-013-S: exportLeaveBalancesCsv kini dirujuk tombol ekspor
  // di UI saldo cuti (leave-balance-export-button.tsx, PR #921) — entri beku dibuang.
  // F-2026-10-21-019 backend dulu: pull labor WO langsung; pemilih konteks WO
  // + tombol pull di UI perintah kerja/lembar waktu menyusul (kartu frontend).
  "src/actions/production-cost.actions.ts::pullLaborCostFromWorkOrderTimesheets":
    "F-2026-10-21-019 backend; UI pull labor perintah kerja menyusul (frontend)",
  // F-2026-10-21-009-V backend dulu (vonis BOT 4 PR #349): kontrak tutup/reopen
  // job siap; tombol UI menyusul di kartu frontend (buang entri ini saat halaman
  // produksi/perintah kerja memanggilnya).
  // F-2026-10-24-097-S S3: tombol tutup kini dirujuk kartu antrean
  // workshop-closeout-queue-card (closeWorkOrder + closeProductionOrder).
  // TASK-026: reopen kini dirujuk JobReopenButton di halaman detail perintah
  // kerja & perintah produksi — entri beku reopen dibuang.
  // F-2026-10-22-069-S: 4 aksi substitusi kini dirujuk UI (tab Substitusi
  // master barang + panel saran WO, t_bfaf2287) — entri beku dibuang.
  // getSubstituteSuggestionsForWorkOrder tetap beku: page detail WO membaca
  // loader data langsung (pola RSC existing), aksi ini jalur client setara.
  "src/actions/item-substitute.actions.ts::getSubstituteSuggestionsForWorkOrder":
    "F-2026-10-22-069-S: detail WO membaca getWorkOrderSubstituteSuggestions-data langsung di RSC; aksi setara untuk pemanggil client",
  // F-2026-10-21-012 inti (t_34bb293d): aksi batal WO + lepas/reservasi ulang
  // stok backend dulu; tombol UI menyusul di kartu frontend sesudah PR inti
  // merge (buang 3 entri ini saat halaman produksi/perintah kerja memanggilnya).
  "src/actions/manufacturing.actions.ts::cancelWorkOrder":
    "F-2026-10-21-012 inti backend; tombol batal perintah kerja menyusul (frontend)",
  "src/actions/manufacturing.actions.ts::releaseStockReservation":
    "F-2026-10-21-012 inti backend; tombol lepas reservasi menyusul (frontend)",
  "src/actions/manufacturing.actions.ts::reserveStockForWorkOrder":
    "F-2026-10-21-012 inti backend; tombol reservasi ulang menyusul (frontend)",
  // F-2026-10-22-072-S + F-2026-10-22-078-S: aksi catat-lepas registri
  // InstalledPart dan 9 aksi Permintaan Antar Gudang kini dirujuk UI
  // (form catat-lepas + halaman /inventaris/permintaan-gudang) — entri
  // beku keduanya dibuang.
  // F-2026-10-21-027 backend dulu (PR #360): 10 aksi komponen gaji sudah
  // dirujuk UI PR #374 (entri bekunya dibuang); tersisa getPayrollComponentLines.
  // Buang entri ini saat UI memanggilnya.
  "src/actions/hrm.actions.ts::getPayrollComponentLines":
    "F-2026-10-21-027 backend; UI baris komponen slip menyusul (frontend Fira)",
  // F-2026-10-28-133-S/135-V backend dulu (t_640dcde5): aksi dokumen koreksi
  // slip paid; tombol/dialog UI menyusul kartu Frontend (buang entri ini saat
  // halaman penggajian memanggilnya).
  "src/actions/hrm.actions.ts::correctPaidPayroll":
    "F-2026-10-28-133-S/135-V backend; UI koreksi slip paid menyusul (frontend)",
  // F-2026-10-25-048-S: 2 aksi lead time kini dirujuk ItemWarehouseMinStockPanel
  // (kolom + kontrol lead time, PR konsumen Frontend 048-F1) — entri beku dibuang.
  // F-2026-10-25-043-B1: aksi jejak email statement kini dirujuk
  // EmailButton di halaman statement (PR konsumen Frontend 043-F1) —
  // entri beku dibuang.
  // F-2026-10-22-085-S: getEmployeeLifecycleAttention kini dirujuk kartu
  // daftar perhatian di halaman master karyawan (t_e80e8541) — entri beku dibuang.
  // F-2026-10-22-088-S: 4 aksi target penjualan kini dirujuk UI
  // (halaman + panel kelola /laporan/target-penjualan, t_f605e189)
  // — entri beku dibuang.
  // F-2026-10-22-089-S tahap 2 inti (t_ccab9c37): createInvoiceCollectionFollowUp
  // kini dirujuk CollectionFollowUpForm di antrean penagihan (t_6f73907a) —
  // entri beku dibuang. deleteInvoiceCollectionFollowUp tetap beku: loader
  // antrean belum menampilkan daftar jejak per faktur untuk dipilih.
  "src/actions/invoice-collection.actions.ts::deleteInvoiceCollectionFollowUp":
    "F-2026-10-22-089-S inti backend; tombol hapus tindak lanjut menyusul (frontend t_6f73907a)",
  // F-2026-10-23-109-V: aksi generate baris tahun saldo fiskal kini dirujuk
  // AssetFiscalYearFreezeForm di detail aset (t_3d7bfda0) — entri beku dibuang.
  // F-2026-10-22-068-S: 3 aksi ganti revisi BOM + aksi pratinjau delta
  // kini dirujuk panel BomRevisionChangePanel di detail WO/PO
  // (t_b60d664d) — entri beku dibuang.
  // F-2026-10-22-090-S: 4 aksi stasiun kerja kini dirujuk UI master
  // Stasiun Kerja + pilihan stasiun tahap WO (t_b9d26fab) — entri beku dibuang.
  // F-2026-10-21-030: ke-9 aksi RAB sudah ter-wire UI ProjectBudgetEditor
  // (tab RAB detail proyek) — entri daftar-beku dibuang.
  // F-2026-10-21-021 tahap 3: pemanggil jurnal E2/E3 kini dirujuk UI
  // WarrantyJournalPanel di detail klaim (t_6f92c0a4) — entri beku dibuang.
  // F-2026-10-23-121-V inti (PR #655): 3 aksi YearEndClosing kini dirujuk
  // YearEndClosingPanel di proses akhir bulan (t_8c34abc8) — entri beku dibuang.
  // F-2026-10-22-066-S: 7 aksi JobChangeOrder kini dirujuk panel Change Order
  // di detail Perintah Kerja (t_b1b321cb) — entri beku dibuang.
  // F-2026-10-22-067-S: 4 aksi jadwal termin kini dirujuk kartu jadwal
  // di JobBillingCard (t_ba8fe9ef) — entri beku dibuang.
  // F-2026-10-23-113-V: aksi ekspor XML Coretax kini dirujuk CoretaxExportPanel
  // di page faktur tambah (t_4cba1a22) — entri beku dibuang.
  // F-2026-10-23-111-V + F-2026-10-23-115-V inti (t_17e469e7): 3 aksi
  // peristiwa perubahan aset kini dirujuk AssetChangeEventPanel di detail
  // aset (t_311cfc07) — entri beku dibuang.
  // F-2026-10-22-093-V inti (t_bdc81ed6): aksi edit nominal posted sengaja
  // TIDAK dirujuk UI — selalu menolak by design (E93-6); koreksi hanya
  // reversal. 4 aksi lain kini dirujuk SalesLateFeePanel (t_c2d2dce1).
  "src/actions/sales-late-fee.actions.ts::updateSalesLateFeeAmount":
    "F-2026-10-22-093-V penjaga tolak-edit nominal posted by design (E93-6); UI sengaja tidak menyediakan edit nominal",
  // F-2026-10-22-070-S inti backend (PR #694): 3 aksi stok minimum per
  // gudang kini dirujuk ItemWarehouseMinStockPanel di detail barang
  // (t_0fc24ddc) — entri beku dibuang.
  // F-2026-10-25-003-S inti backend (PR #791): daftar kandidat duplikat
  // pelanggan kini dirujuk halaman kelola pelanggan (frontend
  // t_1f97c2ea) — entri beku dibuang.
  // F-2026-10-25-008-S: completeLeadActivity/reopenLeadActivity kini dirujuk
  // LeadActivityCompletionButton di detail lead (frontend t_68dce5df) —
  // 2 entri beku dibuang.
  // F-2026-10-25-010-S inti backend (PR #954): 4 aksi koreksi absensi kini
  // dirujuk UI /sdm/absensi/koreksi (frontend t_242267c0) — entri beku dibuang.
  // Muse K1 HCMS (backend #959 merged, kartu t_122db5c5): 23 dari 34 aksi
  // kini dirujuk UI HCMS PR #805 (frontend t_daed387f) — entri beku dibuang.
  // Sisa 11 di bawah belum dirujuk UI mana pun (aksi hapus + getter loader).
  "src/actions/recruitment.actions.ts::deleteVacancy":
    "Muse K1 HCMS backend; UI rekrutmen menyusul (frontend t_daed387f)",
  "src/actions/recruitment.actions.ts::deleteApplicant":
    "Muse K1 HCMS backend; UI rekrutmen menyusul (frontend t_daed387f)",
  "src/actions/performance.actions.ts::deletePerformanceCycle":
    "Muse K1 HCMS backend; UI kinerja menyusul (frontend t_daed387f)",
  "src/actions/performance.actions.ts::upsertPerformanceGoal":
    "Muse K1 HCMS backend; UI kinerja menyusul (frontend t_daed387f)",
  "src/actions/performance.actions.ts::deletePerformanceGoal":
    "Muse K1 HCMS backend; UI kinerja menyusul (frontend t_daed387f)",
  "src/actions/development.actions.ts::deleteCompetency":
    "Muse K1 HCMS backend; UI kompetensi menyusul (frontend t_daed387f)",
  "src/actions/development.actions.ts::getCompetencyGaps":
    "Muse K1 HCMS backend; UI kompetensi menyusul (frontend t_daed387f)",
  "src/actions/development.actions.ts::deleteTraining":
    "Muse K1 HCMS backend; UI pelatihan menyusul (frontend t_daed387f)",
  "src/actions/development.actions.ts::removeTrainingParticipant":
    "Muse K1 HCMS backend; UI pelatihan menyusul (frontend t_daed387f)",
  // F-2026-10-26-054-S: 4 aksi penyesuaian gaji kini dirujuk panel
  // salary-adjustment-panel.tsx + page karyawan (PR #1079) — entri beku dibuang.
  // F-2026-10-29-162-V (t_e3a36a0c backend PR #1404): 2 aksi dokumen
  // pelunasan pinjaman kini dirujuk UI (loan-cash-repayment-form.tsx +
  // loan-write-off-button.tsx, frontend t_b1e5edbd PR #1405) — entri beku dibuang.
  // F-2026-10-25-035-B backend (PR #1072): 4 aksi override gerbang kredit
  // kini dirujuk UI (panel tertahan + antrean persetujuan PR #1085,
  // frontend t_52903522/t_7582c185) — entri beku dibuang.
  // F-2026-10-25-021-S tahap 1 backend: aksi catat jadwal servis berikutnya
  // kini dirujuk UI (vehicle-service-schedule-form) — entri beku dibuang.
  // F-2026-10-25-017-S: 3 aksi klaim reimbursement kini dirujuk UI
  // (form klaim mandiri, daftar klaim saya, panel verifikasi keuangan;
  // frontend t_f8d7b3d9) — entri beku dibuang.
  // F-2026-10-25-036-S: 4 aksi histori tarif komisi kategori kini dirujuk UI
  // (komponen customer-commission-rates di master kategori + loader histori
  // di page ubah kategori, frontend t_87eb6220) — entri beku dibuang.
  // FIN-BR-008: reversal vendor lewat UI pembelian (jalur koreksi posted
  // tagihan vendor) — daftar-beku dilepas saat tombol vendor mendarat.
  "src/actions/purchase.actions.ts::reverseVendorPayment":
    "FIN-BR-008: reversal vendor menyusul tombol UI pembelian",
  // F-2026-10-28-157-V Putusan 2: aksi isi-nomor-faktur pasca-posting
  // dirujuk TaxInvoiceNumberButton di detail tagihan (frontend t_28ef6aa5)
  // — entri beku dibuang.
  // GL-BR-003 UI: reverseSalesPayment kini dirujuk tombol Balikkan
  // di detail pembayaran penjualan; entri beku sales dibuang, vendor tetap.
}

describe("keterhubungan aksi server", () => {
  it("setiap aksi yang diekspor dirujuk UI/kode lain, atau terdaftar dengan alasan", () => {
    const unwired = actions
      .filter((a) => !isReferencedElsewhere(a))
      .filter((a) => !ALLOWED_UNWIRED[a.key])
      .map((a) => a.key)
    expect(unwired).toEqual([])
  }, 20_000)

  it("daftar-beku tidak membusuk (aksi yang sudah dirujuk wajib dibuang dari daftar)", () => {
    const stale = Object.keys(ALLOWED_UNWIRED).filter((key) => {
      const action = actions.find((a) => a.key === key)
      if (!action) return true // aksinya sudah tidak ada
      return isReferencedElsewhere(action)
    })
    expect(stale).toEqual([])
  })

  it("kontrol positif: pemindai benar-benar melihat aksi (bukan daftar kosong)", () => {
    expect(actions.length).toBeGreaterThan(250)
    expect(actionFiles.length).toBeGreaterThan(10)
  })
})
