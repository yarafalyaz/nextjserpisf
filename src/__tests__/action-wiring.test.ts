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
// Sebutan nama aksi di dalam komentar TIDAK dihitung sebagai rujukan
// (pemindaian berjalan di atas sumber bebas-komentar, lihat `blankComments`).
//
// Rujukan yang dihitung adalah IMPOR dari modul pendefinisi (impor bernama,
// namespace, atau dinamis) yang namanya lalu dipakai, ATAU — untuk jalur
// ekspor-ulang barel (mis. actions.ts yang me-re-export *.actions) — ekspor
// bernama dari modul pendefinisi. Penyebutan nama polos sebagai token
// TIDAK lagi cukup: `reverseJournal` pernah lolos hanya karena method
// servis bernama sama di journal.service.ts menyebut dirinya sendiri
// (BUGHUNT round3 #13), padahal UI tak pernah mengimpor aksi itu.

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

/**
 * Kosongkan isi komentar sambil mempertahankan string/template, panjang, dan
 * posisi baris — pola yang sama dengan `blankComments` di
 * silent-failure.test.ts. Menjaga string apa adanya itu wajib: `//`/`/*` di
 * dalam string (URL, SQL) bukan komentar, dan memakannya bisa mengosongkan
 * kode sesudahnya sampai akhir baris (rujukan asli hilang = negatif palsu).
 * ponytail: bukan parser penuh — literal regex berisi `//`/`/*`/kutip bisa
 * mengacaukannya; naikkan ke parser TS bila itu mulai menggigit.
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
  const body = blankComments(readFileSync(file, "utf8"))
  for (const m of body.matchAll(/export\s+async\s+function\s+([A-Za-z_][A-Za-z0-9_]*)/g)) {
    actions.push({ file, key: `${relative(ROOT, file)}::${m[1]}`, name: m[1] })
  }
}

// Satu lintasan baca untuk semua berkas: membaca ulang tiap berkas per aksi
// (326 aksi x ~2000 berkas) melewati batas waktu tes.
const fileContents = srcFiles.map((f) => ({
  file: f,
  text: blankComments(readFileSync(f, "utf8")),
}))

const definingNamesByFile = new Map<string, string[]>()
for (const a of actions) {
  if (!definingNamesByFile.has(a.file)) definingNamesByFile.set(a.file, [])
  definingNamesByFile.get(a.file)!.push(a.name)
}
/** Apakah specifier menunjuk persis berkas pendefinisi? Alias @/ + relatif. */
function specPointsTo(fromFile: string, spec: string, defFile: string): boolean {
  const normalized = spec.replace(/\\/g, "/").replace(/\.(?:ts|tsx|mts|cts)$/, "")
  let candidate: string
  if (normalized.startsWith("@/")) {
    candidate = join(ROOT, "src", normalized.slice(2))
  } else if (normalized.startsWith("./") || normalized.startsWith("../")) {
    const dir = fromFile.slice(0, fromFile.lastIndexOf("/"))
    const parts = dir.split("/")
    for (const seg of normalized.split("/")) {
      if (seg === "." || seg === "") continue
      else if (seg === "..") parts.pop()
      else parts.push(seg)
    }
    candidate = parts.join("/")
  } else return false
  const defNoExt = defFile.replace(/\.(?:ts|tsx)$/, "")
  return candidate === defNoExt || candidate === `${defNoExt}/index`
}

/** Nama terikat (lokal, imported) dari klausa impor; type-only dibuang. */
function parseImportClause(clause: string): { local: string; imported: string }[] {
  const out: { local: string; imported: string }[] = []
  const rest = clause.trim()
  const ns = rest.match(/^\*\s+as\s+([A-Za-z_$][A-Za-z0-9_$]*)$/)
  if (ns) return [{ local: ns[1], imported: "*" }]
  const braceStart = rest.indexOf("{")
  if (braceStart === -1) return out
  const braceEnd = rest.lastIndexOf("}")
  if (braceEnd === -1) return out
  for (const part of rest.slice(braceStart + 1, braceEnd).split(",")) {
    const p = part.trim()
    if (!p || p.startsWith("type ")) continue
    const m = p.match(/^([A-Za-z_$][A-Za-z0-9_$]*)(?:\s+as\s+([A-Za-z_$][A-Za-z0-9_$]*))?$/)
    if (m) out.push({ local: m[2] ?? m[1], imported: m[1] })
  }
  return out
}

interface FileReferenceFacts {
  // nama aksi -> berkas pendefinisi yang dirujuk berkas ini
  referenced: Map<string, Set<string>>
}

function collectFileFacts(holderFile: string, text: string): FileReferenceFacts {
  const referenced = new Map<string, Set<string>>()
  const mark = (name: string, defFile: string) => {
    if (!definingNamesByFile.get(defFile)?.includes(name)) return
    if (!referenced.has(name)) referenced.set(name, new Set())
    referenced.get(name)!.add(defFile)
  }
  const markAllFrom = (defFile: string) => {
    for (const n of definingNamesByFile.get(defFile) ?? []) mark(n, defFile)
  }

  // Klausa ekspor-ulang barel (bukan rujukan UI, tetapi aksi jadi terjangkau
  // lewat barel; dipertahankan dari penjaga lama).
  for (const m of text.matchAll(/export\s*\{([^}]*)\}\s*from\s*["']([^"']+)["']/g)) {
    for (const defFile of actionFiles) {
      if (!specPointsTo(holderFile, m[2], defFile)) continue
      for (const part of m[1].split(",")) {
        const p = part.trim()
        if (!p || p.startsWith("type ")) continue
        const mm = p.match(/^([A-Za-z_$][A-Za-z0-9_$]*)/)
        if (mm) mark(mm[1], defFile)
      }
    }
  }
  for (const m of text.matchAll(/export\s+\*\s+from\s*["']([^"']+)["']/g)) {
    for (const defFile of actionFiles) {
      if (specPointsTo(holderFile, m[1], defFile)) markAllFrom(defFile)
    }
  }

  // Impor statis: binding dari modul aksi, lalu pemakaian di luar impor.
  interface Binding { local: string; imported: string; defFile: string }
  const bindings: Binding[] = []
  const importStmts: { start: number; end: number; defFile: string | null }[] = []
  for (const m of text.matchAll(/import\s+(?!type\b)([\s\S]*?)\s+from\s*["']([^"']+)["']/g)) {
    const defFile = actionFiles.find((f) => specPointsTo(holderFile, m[2], f)) ?? null
    importStmts.push({ start: m.index, end: m.index + m[0].length, defFile })
    if (!defFile) continue
    for (const b of parseImportClause(m[1])) bindings.push({ ...b, defFile })
  }
  // Tubuh berkas tanpa pernyataan impor dari modul aksi mana pun.
  let body = text
  for (const s of [...importStmts].sort((a, b) => b.start - a.start)) {
    if (!s.defFile) continue
    body = body.slice(0, s.start) + " ".repeat(s.end - s.start) + body.slice(s.end)
  }
  for (const b of bindings) {
    if (b.imported === "*") {
      for (const n of definingNamesByFile.get(b.defFile) ?? []) {
        if (new RegExp(`\\b${b.local}\\s*\\.\\s*${n}\\b`).test(body)) mark(n, b.defFile)
      }
      continue
    }
    if (new RegExp(`\\b${b.local}\\b`).test(body)) mark(b.imported, b.defFile)
  }

  // Impor dinamis dari modul aksi: destructure/akses properti nama modul itu.
  for (const defFile of actionFiles) {
    let hasDynamic = false
    for (const m of text.matchAll(/import\s*\(\s*["']([^"']+)["']\s*\)/g)) {
      if (specPointsTo(holderFile, m[1], defFile)) { hasDynamic = true; break }
    }
    if (!hasDynamic) continue
    for (const n of definingNamesByFile.get(defFile) ?? []) {
      if (
        new RegExp(`\\.\\s*${n}\\b`).test(text) ||
        new RegExp(`\\{[^}]*\\b${n}\\b[^}]*\\}\\s*=`).test(text)
      ) {
        mark(n, defFile)
      }
    }
  }

  return { referenced }
}

const fileFacts = fileContents.map(({ file, text }) => ({
  file,
  facts: collectFileFacts(file, text),
}))

function isReferencedElsewhere(action: ExportedAction): boolean {
  for (const { file, facts } of fileFacts) {
    if (file === action.file) continue
    if (facts.referenced.get(action.name)?.has(action.file)) return true
  }
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
  // F-2026-10-27-113-S tahap 113-B kini dirujuk UI register sengketa pajak
  // (tax-assessment-form, tax-dispute-step-form, tax-dispute-decision-form,
  // cancel-tax-assessment-button — PR frontend 113-F) — entri beku dibuang.
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
  // F-2026-10-21-012 inti (t_34bb293d): cancelWorkOrder kini dirujuk
  // WorkOrderActions di detail perintah kerja (putaran 232) — entri batal
  // dibuang; dua aksi reservasi masih menunggu tombolnya.
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
  // F-2026-10-28-133-S/135-V: correctPaidPayroll kini dirujuk tombol Koreksi
  // di detail slip paid (correct-paid-button.tsx) — entri beku dibuang.
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
  // FIN-BR-008: reversal vendor kini dirujuk ReversePaymentButton di detail
  // pembayaran pemasok (putaran 230) — entri beku dibuang.
  // Aksi ekspor sinkron status proyek: pemanggilnya hanya tes unit;
  // UI memakai helper internal syncProjectStatusTx dalam transaksi modul
  // proyek/manufaktur — kandidat dihapus, bukan celah UI.
  "src/actions/project.actions.ts::syncProjectStatus":
    "tanpa pemanggil UI/kode produksi (hanya tes unit); status proyek disinkronkan helper internal syncProjectStatusTx dalam transaksi pemanggilnya — kandidat dihapus",
  // F-2026-10-28-157-V Putusan 2: aksi isi-nomor-faktur pasca-posting
  // dirujuk TaxInvoiceNumberButton di detail tagihan (frontend t_28ef6aa5)
  // — entri beku dibuang.
  // GL-BR-003 UI: reverseSalesPayment kini dirujuk tombol Balikkan
  // di detail pembayaran penjualan; entri beku sales dibuang, vendor tetap.
  // BUGHUNT round3 #13: reverseJournal kini dirujuk journal-table.tsx
  // (tombol Balikkan jurnal POSTED) — entri beku TIDAK ditambahkan.
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

describe("blankComments (pemindai rujukan)", () => {
  it("sebutan nama aksi di komentar tidak dihitung, rujukan kode tetap terhitung", () => {
    const berpola = (teks: string) =>
      [...blankComments(teks).matchAll(/\bcorrectPaidPayroll\b/g)]
    expect(berpola("// correctPaidPayroll menyusul\n/* correctPaidPayroll */")).toHaveLength(0)
    expect(berpola("await correctPaidPayroll(id, fd)")).toHaveLength(1)
  })

  it("tak memakan string berisi // dan tak mengubah nomor baris", () => {
    const s = 'const u = "https://x.test/a" // correctPaidPayroll\n/* blok\nblok */ correctPaidPayroll()'
    const bersih = blankComments(s)
    expect(bersih.split("\n")).toHaveLength(3)
    expect(bersih).toContain("https://x.test/a")
    expect(bersih).not.toContain("// correctPaidPayroll")
    expect([...bersih.matchAll(/\bcorrectPaidPayroll\b/g)]).toHaveLength(1)
  })
})

describe("impor dari modul pendefinisi (pemindai rujukan)", () => {
  const defFinance = join(ROOT, "src", "actions", "finance.actions.ts")
  const holder = join(ROOT, "src", "components", "pemindai-rujukan-sintetis.tsx")
  const dirujuk = (teks: string, nama: string) =>
    collectFileFacts(holder, blankComments(teks)).referenced
      .get(nama)
      ?.has(defFinance) ?? false

  it("token nama polos tanpa impor dari modul pendefinisi tidak terhitung (kasus reverseJournal)", () => {
    // Pola lubang lama: method servis bernama sama menyebut dirinya;
    // nama muncul sebagai kode, tetapi aksi tak pernah diimpor.
    expect(dirujuk("class S { async reverseJournal() { return 1 } }", "reverseJournal")).toBe(false)
    expect(dirujuk("const m = { reverseJournal: 1 }; m.reverseJournal", "reverseJournal")).toBe(false)
  })

  it("impor bernama yang dipakai terhitung; impor tak dipakai tidak", () => {
    expect(
      dirujuk(
        'import { reverseJournal } from "@/actions/finance.actions"\nawait reverseJournal(1)',
        "reverseJournal",
      ),
    ).toBe(true)
    expect(
      dirujuk(
        'import { reverseJournal } from "@/actions/finance.actions"\nconst x = 1',
        "reverseJournal",
      ),
    ).toBe(false)
  })

  it("alias impor yang dipakai terhitung", () => {
    expect(
      dirujuk(
        'import { reverseJournal as balik } from "@/actions/finance.actions"\nawait balik(1)',
        "reverseJournal",
      ),
    ).toBe(true)
  })

  it("impor dari modul lain bernama sama tidak terhitung", () => {
    expect(
      dirujuk(
        'import { reverseJournal } from "@/lib/services/journal.service"\nawait reverseJournal(1)',
        "reverseJournal",
      ),
    ).toBe(false)
  })

  it("impor dinamis + destructure/akses properti terhitung, sebutan di komentar tidak", () => {
    expect(
      dirujuk(
        'const { reverseJournal } = await import("@/actions/finance.actions")\nawait reverseJournal(1)',
        "reverseJournal",
      ),
    ).toBe(true)
    expect(
      dirujuk(
        '(await import("@/actions/finance.actions")).reverseJournal(1)',
        "reverseJournal",
      ),
    ).toBe(true)
    expect(
      dirujuk(
        '// import { reverseJournal } from "@/actions/finance.actions"\nawait reverseJournal(1)',
        "reverseJournal",
      ),
    ).toBe(false)
  })

  it("ekspor-ulang barel dari modul pendefinisi terhitung", () => {
    expect(
      dirujuk('export { reverseJournal } from "@/actions/finance.actions"', "reverseJournal"),
    ).toBe(true)
    expect(
      dirujuk('export { reverseJournal } from "@/actions/sales.actions"', "reverseJournal"),
    ).toBe(false)
  })
})
