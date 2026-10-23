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
  // Jalur publik yang sengaja diekspor dan sudah terdaftar di daftar-beku penjaga
  // izin (action-guard-coverage.test.ts). UI-nya memakai next-auth langsung.
  "src/actions/auth.actions.ts::loginAction":
    "jalur publik (login sebelum sesi ada); form masuk memakai signIn next-auth di src/components/login-form.tsx",
  "src/actions/auth.actions.ts::logoutAction":
    "jalur publik (mengakhiri sesi); keluar memakai signOut next-auth di src/components/layout/nav-user.tsx dan header.tsx",
  // Bacaan yang belum punya pemanggil. Dibiarkan tercatat, bukan disembunyikan:
  // keputusan "hapus atau sambungkan" milik pemilik repo.
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
  // F-2026-10-21-025 backend dulu: kontrak konflik untuk form aturan fitment;
  // UI peringatan menyusul di kartu frontend t_6d28c338 (buang entri ini saat
  // vehicle-fitment-form memanggilnya).
  "src/actions/vehicle-fitment.actions.ts::checkVehicleFitmentConflicts":
    "F-2026-10-21-025 backend; peringatan konflik di VehicleFitmentForm menyusul (frontend t_6d28c338)",
  // F-2026-10-21-019 backend dulu: pull labor WO langsung; pemilih konteks WO
  // + tombol pull di UI perintah kerja/lembar waktu menyusul (kartu frontend).
  "src/actions/production-cost.actions.ts::pullLaborCostFromWorkOrderTimesheets":
    "F-2026-10-21-019 backend; UI pull labor perintah kerja menyusul (frontend)",
  // F-2026-10-21-009-V backend dulu (vonis BOT 4 PR #349): kontrak tutup/reopen
  // job siap; tombol UI menyusul di kartu frontend (buang entri ini saat halaman
  // produksi/perintah kerja memanggilnya).
  "src/actions/manufacturing.actions.ts::closeProductionOrder":
    "F-2026-10-21-009-V backend; tombol tutup produksi menyusul (frontend)",
  "src/actions/manufacturing.actions.ts::reopenProductionOrder":
    "F-2026-10-21-009-V backend; tombol buka-kembali produksi menyusul (frontend)",
  "src/actions/manufacturing.actions.ts::closeWorkOrder":
    "F-2026-10-21-009-V backend; tombol tutup perintah kerja menyusul (frontend)",
  "src/actions/manufacturing.actions.ts::reopenWorkOrder":
    "F-2026-10-21-009-V backend; tombol buka-kembali perintah kerja menyusul (frontend)",
  // F-2026-10-22-069-S inti (t_0f358bbb/t_73bdb74a): master substitusi +
  // saran/terapkan perintah kerja backend dulu; panel saran di detail WO +
  // panel kelola relasi di master barang menyusul kartu frontend
  // t_bfaf2287 (buang entri ini saat UI memanggilnya).
  "src/actions/item-substitute.actions.ts::listItemSubstitutes":
    "F-2026-10-22-069-S backend; panel kelola relasi di master barang menyusul (frontend t_bfaf2287)",
  "src/actions/item-substitute.actions.ts::createItemSubstitute":
    "F-2026-10-22-069-S backend; form tambah relasi substitusi menyusul (frontend t_bfaf2287)",
  "src/actions/item-substitute.actions.ts::setItemSubstituteActive":
    "F-2026-10-22-069-S backend; tombol nonaktifkan/aktifkan relasi menyusul (frontend t_bfaf2287)",
  "src/actions/item-substitute.actions.ts::getSubstituteSuggestionsForWorkOrder":
    "F-2026-10-22-069-S backend; panel saran substitusi di detail perintah kerja menyusul (frontend t_bfaf2287)",
  "src/actions/item-substitute.actions.ts::applyWorkOrderItemSubstitute":
    "F-2026-10-22-069-S backend; tombol terapkan substitusi di panel saran menyusul (frontend t_bfaf2287)",
  // F-2026-10-21-012 inti (t_34bb293d): aksi batal WO + lepas/reservasi ulang
  // stok backend dulu; tombol UI menyusul di kartu frontend sesudah PR inti
  // merge (buang 3 entri ini saat halaman produksi/perintah kerja memanggilnya).
  "src/actions/manufacturing.actions.ts::cancelWorkOrder":
    "F-2026-10-21-012 inti backend; tombol batal perintah kerja menyusul (frontend)",
  "src/actions/manufacturing.actions.ts::releaseStockReservation":
    "F-2026-10-21-012 inti backend; tombol lepas reservasi menyusul (frontend)",
  "src/actions/manufacturing.actions.ts::reserveStockForWorkOrder":
    "F-2026-10-21-012 inti backend; tombol reservasi ulang menyusul (frontend)",
  // F-2026-10-22-078-S inti (t_7de0eff1): 9 aksi Permintaan Antar Gudang
  // backend dulu; halaman /inventaris/permintaan-gudang menyusul di kartu
  // frontend t_7bfec14e (buang entri ini saat UI memanggilnya).
  "src/actions/material-request.actions.ts::createMaterialRequest":
    "F-2026-10-22-078-S inti backend; halaman permintaan antar gudang menyusul (frontend t_7bfec14e)",
  "src/actions/material-request.actions.ts::updateMaterialRequest":
    "F-2026-10-22-078-S inti backend; halaman permintaan antar gudang menyusul (frontend t_7bfec14e)",
  "src/actions/material-request.actions.ts::deleteMaterialRequest":
    "F-2026-10-22-078-S inti backend; halaman permintaan antar gudang menyusul (frontend t_7bfec14e)",
  "src/actions/material-request.actions.ts::submitMaterialRequest":
    "F-2026-10-22-078-S inti backend; halaman permintaan antar gudang menyusul (frontend t_7bfec14e)",
  "src/actions/material-request.actions.ts::approveMaterialRequest":
    "F-2026-10-22-078-S inti backend; halaman permintaan antar gudang menyusul (frontend t_7bfec14e)",
  "src/actions/material-request.actions.ts::rejectMaterialRequest":
    "F-2026-10-22-078-S inti backend; halaman permintaan antar gudang menyusul (frontend t_7bfec14e)",
  "src/actions/material-request.actions.ts::cancelMaterialRequest":
    "F-2026-10-22-078-S inti backend; halaman permintaan antar gudang menyusul (frontend t_7bfec14e)",
  "src/actions/material-request.actions.ts::closeMaterialRequest":
    "F-2026-10-22-078-S inti backend; halaman permintaan antar gudang menyusul (frontend t_7bfec14e)",
  "src/actions/material-request.actions.ts::createTransferFromMaterialRequest":
    "F-2026-10-22-078-S inti backend; halaman permintaan antar gudang menyusul (frontend t_7bfec14e)",
  // F-2026-10-21-027 backend dulu (PR #360): 10 aksi komponen gaji sudah
  // dirujuk UI PR #374 (entri bekunya dibuang); tersisa getPayrollComponentLines.
  // Buang entri ini saat UI memanggilnya.
  "src/actions/hrm.actions.ts::getPayrollComponentLines":
    "F-2026-10-21-027 backend; UI baris komponen slip menyusul (frontend Fira)",
  // F-2026-10-22-085-S inti (t_7b33102f): read-model daftar perhatian
  // siklus hidup backend dulu; field master + daftar perhatian menyusul
  // di kartu frontend t_e80e8541 (buang entri ini saat UI memanggilnya).
  "src/actions/hrm.actions.ts::getEmployeeLifecycleAttention":
    "F-2026-10-22-085-S inti backend; daftar perhatian siklus hidup menyusul (frontend t_e80e8541)",
  // F-2026-10-22-088-S: 4 aksi target penjualan kini dirujuk UI
  // (halaman + panel kelola /laporan/target-penjualan, t_f605e189)
  // — entri beku dibuang.
  // F-2026-10-22-089-S tahap 2 inti (t_ccab9c37): aksi tindak lanjut
  // penagihan backend dulu; halaman antrean + form Catat Tindak Lanjut
  // menyusul di kartu frontend t_6f73907a (buang entri ini saat UI
  // memanggilnya).
  "src/actions/invoice-collection.actions.ts::createInvoiceCollectionFollowUp":
    "F-2026-10-22-089-S inti backend; form Catat Tindak Lanjut menyusul (frontend t_6f73907a)",
  "src/actions/invoice-collection.actions.ts::deleteInvoiceCollectionFollowUp":
    "F-2026-10-22-089-S inti backend; tombol hapus tindak lanjut menyusul (frontend t_6f73907a)",
  // F-2026-10-22-068-S: 3 aksi ganti revisi BOM + aksi pratinjau delta
  // kini dirujuk panel BomRevisionChangePanel di detail WO/PO
  // (t_b60d664d) — entri beku dibuang.
  // F-2026-10-22-090-S: 4 aksi stasiun kerja kini dirujuk UI master
  // Stasiun Kerja + pilihan stasiun tahap WO (t_b9d26fab) — entri beku dibuang.
  // F-2026-10-21-030: ke-9 aksi RAB sudah ter-wire UI ProjectBudgetEditor
  // (tab RAB detail proyek) — entri daftar-beku dibuang.
  // F-2026-10-21-021 tahap 3: pemanggil jurnal E2/E3 kini dirujuk UI
  // WarrantyJournalPanel di detail klaim (t_6f92c0a4) — entri beku dibuang.
  // F-2026-10-22-066-S: 7 aksi JobChangeOrder kini dirujuk panel Change Order
  // di detail Perintah Kerja (t_b1b321cb) — entri beku dibuang.
  // F-2026-10-22-067-S: 4 aksi jadwal termin kini dirujuk kartu jadwal
  // di JobBillingCard (t_ba8fe9ef) — entri beku dibuang.
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
