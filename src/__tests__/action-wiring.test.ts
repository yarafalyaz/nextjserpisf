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
  // F-PRICELIST-01 tahap 1 (backend dulu): resolver+loader sudah tersambung
  // ke createSalesInvoice; UI kelola daftar harga = tahap Fira berikutnya.
  "src/actions/customer-price-list.actions.ts::createCustomerPriceList":
    "F-PRICELIST-01 backend; halaman kelola daftar harga menyusul (tahap UI)",
  "src/actions/customer-price-list.actions.ts::updateCustomerPriceList":
    "F-PRICELIST-01 backend; halaman kelola daftar harga menyusul (tahap UI)",
  "src/actions/customer-price-list.actions.ts::deleteCustomerPriceList":
    "F-PRICELIST-01 backend; halaman kelola daftar harga menyusul (tahap UI)",
  // F-2026-10-21-025 backend dulu: kontrak konflik untuk form aturan fitment;
  // UI peringatan menyusul di kartu frontend t_6d28c338 (buang entri ini saat
  // vehicle-fitment-form memanggilnya).
  "src/actions/vehicle-fitment.actions.ts::checkVehicleFitmentConflicts":
    "F-2026-10-21-025 backend; peringatan konflik di VehicleFitmentForm menyusul (frontend t_6d28c338)",
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
