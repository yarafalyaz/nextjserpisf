import fs from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

/**
 * Guard: kode produksi tidak boleh punya `catch` yang benar-benar kosong.
 *
 * Repo ini sudah pernah membersihkan "kegagalan senyap yang menyesatkan" — sebuah
 * `catch {}` membuat operasi tampak berhasil padahal gagal, dan tidak tertangkap tsc,
 * lint, maupun tes (tidak ada yang melempar). Kalau error memang sengaja diabaikan,
 * tulis alasannya di dalam blok itu supaya pembaca berikutnya tahu itu disengaja.
 *
 * Berkas tes tidak diperiksa: menelan error di sana memang sering tujuannya
 * (mis. `.catch(() => false)` pada pemeriksaan visibilitas).
 */
const ROOT = path.resolve(__dirname, "../..")
const DIRS = ["src", "scripts"]
// .mjs/.js ikut dipindai: `scripts/` berisi 6 skrip .mjs, dan kegagalan senyap
// di sana sama-sama tak tertangkap tsc (yang hanya memeriksa .ts/.tsx).
const EXT = /\.(ts|tsx|mjs|js)$/
const EMPTY_CATCH = /catch\s*(?:\([^)]*\))?\s*\{\s*\}/g

/**
 * Satu-satunya pengecualian: skrip bootstrap tema yang disuntik inline di `<head>`.
 * Ia harus tidak pernah melempar (localStorage bisa tidak tersedia), dan di sana tidak
 * ada yang bisa dilakukan — jadi blok kosongnya memang keputusan, bukan kelalaian.
 */
const ALLOWED: Record<string, string> = {
  "src/app/layout.tsx": "skrip bootstrap tema inline di <head>",
}

/**
 * Analog promise-level dari catch kosong: `.catch(() => {})`, `() => undefined`,
 * `() => null`. Ini juga kegagalan senyap — operasi tampak selesai padahal gagal —
 * dan sama-sama tak tertangkap tsc/lint/tes. Yang MENYESATKAN PENGGUNA sudah
 * diperbaiki (address-picker, notifikasi, daftar merek/model, hapus lampiran
 * vendor-payment-form: kini menampilkan pesan + mengembalikan barisnya);
 * yang tersisa di daftar ini memang pembersihan best-effort atau setelan opsional.
 *
 * Catatan jujur soal kelebaran: daftar ini mengecualikan per BERKAS, jadi penyisipan
 * `.catch(() => {})` baru di dalam berkas-berkas itu tidak akan tertangkap. Cukup untuk
 * berkas ini karena semua penelannya sejenis, tapi bukan penjagaan yang ketat.
 */
const SILENT_PROMISE_CATCH = /\.catch\(\s*\(\s*\)\s*=>\s*(\{\s*\}|undefined|null)\s*\)/g

const ALLOWED_PROMISE_CATCH: Record<string, string> = {
  "src/app/api/cron/route.ts": "sapu berkas lampiran yatim best-effort (R-9); unlink gagal = berkas memang sudah hilang, deleteMany tetap jalan",
  "src/app/api/upload/attachments/route.ts": "hapus berkas sementara — gagal pun tak berdampak",
  "src/components/reports/report-letterhead.tsx": "setelan opsional; null berarti pakai default",
  "src/lib/db/backup.ts": "pembersihan berkas / cloud best-effort",
}

function productionFiles(dir: string, out: string[] = []): string[] {
  const full = path.join(ROOT, dir)
  if (!fs.existsSync(full)) return out
  for (const entry of fs.readdirSync(full, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue
    if (entry.name === "__tests__" || /\.test\.tsx?$/.test(entry.name)) continue
    const child = path.join(full, entry.name)
    if (entry.isDirectory()) productionFiles(path.relative(ROOT, child), out)
    else if (EXT.test(entry.name)) out.push(child)
  }
  return out
}

/**
 * ── Kegagalan senyap yang lebih luas ──────────────────────────────────────────
 *
 * Penjaga di atas hanya menangkap `catch {}` (benar-benar kosong) dan
 * `.catch(() => {})`. Tiga bentuk berikut lolos dari tsc, lint, dan tes biasa —
 * sekali lagi karena tidak ada yang melempar, sehingga operasi tampak sukses:
 *
 *   1. CONSOLE_ONLY   — `catch` yang isinya HANYA panggilan `console.*`. Error
 *                       tercatat di server tetapi tidak diteruskan (tidak dilempar
 *                       ulang, tidak ditandai gagal), jadi pemanggil menganggapnya
 *                       berhasil. `catch` yang juga `throw` atau mengembalikan
 *                       penanda gagal eksplisit TIDAK dihitung: itu gagal-keras.
 *   2. COMMENT_ONLY   — `catch` yang isinya hanya komentar; perilakunya identik
 *                       dengan blok kosong, hanya diberi keterangan.
 *   3. DEFAULT_RETURN — `catch` yang mengembalikan nilai default (null/0/[]/{}/false/
 *                       ""/konstanta default/response tanpa penanda gagal) seolah
 *                       operasinya berhasil.
 *
 * Mendeteksi batas blok dengan andal butuh sedikit "tokenizer": isi komentar,
 * string, template, dan regex dikosongkan dulu (panjang & posisi baris
 * dipertahankan) supaya `{`/`}` di dalamnya tidak mengacaukan pencocokan. Ini
 * bukan parser penuh — cukup untuk berkas-berkas repo ini.
 */
interface CatchBlock {
  line: number
  bodyRaw: string
  bodyBlank: string
}

const REGEX_PRECEDERS = "(,=:[!&|?{};+-*%~^<>"
const KEYWORDS = new Set([
  "return", "typeof", "case", "in", "of", "new", "do", "else",
  "delete", "void", "instanceof", "yield", "await", "throw",
])

function blank(src: string): string {
  const out = src.split("")
  const n = src.length
  let i = 0
  let prevSignificant = ""
  let lastWord = ""
  while (i < n) {
    const c = src[i]
    const c2 = src[i + 1]
    if (c === "/" && c2 === "/") {
      while (i < n && src[i] !== "\n") { out[i] = " "; i++ }
      continue
    }
    if (c === "/" && c2 === "*") {
      out[i] = " "; out[i + 1] = " "; i += 2
      while (i < n && !(src[i] === "*" && src[i + 1] === "/")) {
        if (src[i] !== "\n") out[i] = " "
        i++
      }
      if (i < n) { out[i] = " "; out[i + 1] = " "; i += 2 }
      continue
    }
    if (c === '"' || c === "'") {
      const quote = c
      out[i] = " "; i++
      while (i < n && src[i] !== quote) {
        if (src[i] === "\\") {
          out[i] = " "; i++
          if (i < n) { out[i] = " "; i++ }
          continue
        }
        if (src[i] !== "\n") out[i] = " "
        i++
      }
      if (i < n) { out[i] = " "; i++ }
      continue
    }
    if (c === "`") {
      out[i] = " "; i++
      while (i < n) {
        if (src[i] === "\\") {
          out[i] = " "; i++
          if (i < n) { out[i] = " "; i++ }
          continue
        }
        if (src[i] === "`") { out[i] = " "; i++; break }
        if (src[i] !== "\n") out[i] = " "
        i++
      }
      continue
    }
    if (c === "/" && (REGEX_PRECEDERS.includes(prevSignificant) || KEYWORDS.has(lastWord))) {
      out[i] = " "; i++
      let inClass = false
      while (i < n && src[i] !== "\n") {
        if (src[i] === "\\") {
          out[i] = " "; i++
          if (i < n) { out[i] = " "; i++ }
          continue
        }
        if (src[i] === "[") inClass = true
        else if (src[i] === "]") inClass = false
        else if (src[i] === "/" && !inClass) { out[i] = " "; i++; break }
        out[i] = " "
        i++
      }
      continue
    }
    if (/[A-Za-z0-9_$]/.test(c)) lastWord += c
    else lastWord = ""
    if (!/\s/.test(c)) prevSignificant = c
    i++
  }
  return out.join("")
}

function catchBlocks(source: string): CatchBlock[] {
  const clean = blank(source)
  const pattern = /\bcatch\b\s*(?:\([^)]*\))?\s*\{/g
  const blocks: CatchBlock[] = []
  let match: RegExpExecArray | null
  while ((match = pattern.exec(clean)) !== null) {
    const open = match.index + match[0].length - 1
    let depth = 0
    let end = open
    for (; end < clean.length; end++) {
      if (clean[end] === "{") depth++
      else if (clean[end] === "}") { depth--; if (depth === 0) break }
    }
    blocks.push({
      line: clean.slice(0, match.index).split("\n").length,
      bodyRaw: source.slice(open + 1, end),
      bodyBlank: clean.slice(open + 1, end),
    })
    pattern.lastIndex = end
  }
  return blocks
}

const stripComments = (s: string): string =>
  s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ")

const LITERAL_DEFAULT = /^(null|undefined|false|0|\[\]|\{\}|""|''|``)$/
const DEFAULT_NAME = /^(DEFAULT_[A-Z0-9_]+|fallback|fallback[A-Za-z]*|[a-z]*Default[A-Za-z]*|[a-z]*Fallback[A-Za-z]*)$/
const BARE_STRING = /^(["'`])[\s\S]*\1$/
// Panggilan yang memberi tahu PENGGUNA → tidak senyap.
const NOTIFIES_USER = /\b(showError|showSuccess|setError|toast|addToast|alert|notify)\s*\(/
// Mengembalikan penanda gagal yang eksplisit → gagal-keras, bukan senyap.
const SIGNALS_FAILURE = /error\s*:|success\s*:\s*false|apiError|status\s*:\s*[45]\d\d|\bGagal\b/

function isCommentOnly(block: CatchBlock): boolean {
  if (/\bthrow\b/.test(block.bodyBlank)) return false
  if (block.bodyBlank.trim() !== "") return false
  return /\/\/|\/\*/.test(block.bodyRaw)
}

function isConsoleOnly(block: CatchBlock): boolean {
  if (/\bthrow\b/.test(block.bodyBlank)) return false
  if (block.bodyBlank.trim() === "") return false
  if (/\breturn\b/.test(block.bodyBlank)) return false
  if (!/console\.\w+\s*\(/.test(block.bodyBlank)) return false
  const sisa = block.bodyBlank
    .replace(/console\.\w+\s*\([^()]*(?:\([^()]*\)[^()]*)*\)/g, "")
    .replace(/[;\s]/g, "")
  return sisa === ""
}

function isDefaultReturn(block: CatchBlock): boolean {
  if (/\bthrow\b/.test(block.bodyBlank)) return false
  if (!/\breturn\b/.test(block.bodyBlank)) return false
  const bodyText = stripComments(block.bodyRaw)
  if (NOTIFIES_USER.test(bodyText)) return false
  if (SIGNALS_FAILURE.test(bodyText)) return false
  const codeMatch = /\breturn\b([\s\S]*)$/.exec(block.bodyBlank)
  if (!codeMatch) return false
  const nilaiKode = codeMatch[1].replace(/;?\s*$/, "").trim()
  const textMatch = /\breturn\b([\s\S]*)$/.exec(bodyText)
  const nilaiTeks = (textMatch ? textMatch[1] : "").replace(/;?\s*$/, "").trim()
  return (
    nilaiKode === "" || // `return` telanjang → undefined
    LITERAL_DEFAULT.test(nilaiKode) ||
    DEFAULT_NAME.test(nilaiKode) ||
    BARE_STRING.test(nilaiTeks) ||
    /\[\s*\]/.test(nilaiKode) ||
    /^(NextResponse\.json|Response\.json|new Response)\s*\(/.test(nilaiKode)
  )
}

/**
 * Daftar-beku berarah dua. Setiap entri punya DUA arah yang dituntut tes ini:
 *   • maju  — catch yang cocok di berkas itu tidak lagi dilaporkan;
 *   • mundur — bila pelanggarannya diperbaiki (atau berkasnya hilang), entri
 *     dianggap membusuk dan tes MERAH, memaksa penghapusan entri.
 *
 * Kelebaran per-berkas sama seperti daftar promise di atas: penyisipan
 * pelanggaran BARU di dalam berkas yang sudah terdaftar tidak akan tertangkap.
 * Sadar akan kekurangan itu; daftarnya sengaja dijaga sekecil mungkin.
 *
 * Entri ber-label "UTANG kegagalan senyap" adalah temuan yang MEMANG senyap dan
 * bukan degradasi yang disengaja — ia dibekukan (bukan dilonggarkan aturannya)
 * agar perbaikan produksi (tugas paralel) tetap wajib menghapus entri ini.
 */
const ALLOWED_COMMENT_ONLY: Record<string, string> = {
  "src/actions/auth.actions.ts": "signOut bisa melempar pada sesi kedaluwarsa; menandai gagal tak berguna — sesinya sudah berakhir",
  "src/actions/project.actions.ts": "pengguna view-only: daftar kosong memang hasil yang benar, bukan kegagalan",
  "src/app/api/upload/attachments/[id]/route.ts": "berkas mungkin sudah terhapus / pindah ke R2; melanjutkan adalah perilaku yang benar",
  "src/components/reports/export-buttons.tsx": "gambar yang gagal dimuat cukup dilewati; ekspor teks tetap berjalan",
  "src/lib/auth/auth.ts": "menelan error di jalur auth agar alur login tak putus (niatnya tertulis di blok)",
  "src/lib/db/backup.ts": "pembersihan / daftar berkas best-effort; R2 boleh tak terkonfigurasi, hasil lokal tetap dikembalikan",
  "src/lib/pdf/engine/render.ts": "logo tak terbaca cukup dilewati — kop tetap tercetak (niatnya tertulis di blok)",
}

const ALLOWED_CONSOLE_ONLY: Record<string, string> = {
  "src/actions/purchase.actions.ts": "notifikasi admin bersifat eksternal dan tidak boleh menggagalkan PO — niatnya ada di komentar di atas try",
  "src/app/api/cron/route.ts": "penulisan log cron tidak boleh menggagalkan handler (niatnya tertulis di blok)",
  "src/app/api/workflow/[...path]/route.ts": "reset status dokumen best-effort saat membuka ulang approval yang ditolak; yang menentukan adalah fresh berstatus pending tepat di bawahnya — kegagalan dilaporkan via console.error berkonteks",
  "src/app/(dashboard)/inventaris/rak/_components/rack-create-form.tsx": "kode rak otomatis gagal dimuat cukup dicatat; kolom tetap bisa diisi manual (degradasi disengaja, alasannya tertulis di blok)",
  "src/components/reports/export-buttons.tsx": "kegagalan dilaporkan: console.error di dalam catch + showError tepat sesudahnya — pengguna diberi tahu, kop default tidak dipakai diam-diam",
  "src/components/forms/rack-row-form.tsx": "kode baris rak otomatis gagal dimuat cukup dicatat; kolom tetap bisa diisi manual (degradasi disengaja, alasannya tertulis di blok)",
  "src/components/ui/quick-add-select.tsx": "gagal memuat pilihan dinamis cukup dicatat; form tetap bisa diisi manual (degradasi disengaja, alasannya tertulis di blok)",
  "src/lib/db/backup.ts": "unggah cloud best-effort; kegagalan cukup dilaporkan sebagai peringatan",
  "src/lib/services/activity-log.service.ts": "logging tidak boleh memutus alur utama (niatnya tertulis di blok)",
  "src/lib/services/activity-reference.service.ts": "label referensi yang hilang tak boleh menggagalkan seluruh halaman log; sengaja dicatat agar ada jejak (niatnya tertulis di blok)",
  "src/lib/services/transaction-attachment.service.ts": "hapus berkas disk best-effort (R-10); kegagalan dicatat berkonteks dengan path, baris DB tetap terhapus agar referensi tak menggantung",
  "src/lib/reports/work-order-material-needs-data.ts": "lazy-expire reservasi (F-2026-10-21-012 BR-RES-06) best-effort saat baca: kegagalan dicatat berkonteks, kartu kebutuhan tetap tampil dan expire dicoba lagi pada baca berikutnya — bukan angka yang ditelan",
  "src/lib/services/vehicle-fitment.service.ts": "snapshot fitment F-2026-10-22-063-S BR-FIT-09: evaluasi peringatan gagal TIDAK boleh menggagalkan simpan Quotation/WO; kegagalan dicatat berkonteks dan snapshot tetap null (dievaluasi ulang simpan berikutnya)",
  "src/lib/reports/work-order-reservations-data.ts": "lazy-expire reservasi (F-2026-10-22-057-S BR-RES-06) best-effort saat baca: kegagalan dicatat berkonteks, tabel reservasi tetap tampil dari baris StockReservation dan expire dicoba lagi pada baca berikutnya — bukan angka yang ditelan",
  "scripts/clear-all-data.ts": "skrip sekali-jalan; error dilaporkan ke console sebelum proses keluar",
  "scripts/verify-migrations.mjs": "pembersihan DB scratch best-effort; kegagalan dilaporkan plus instruksi hapus manual",
  "src/actions/sales.actions.ts": "F-2026-10-25-035-B fase 3: persist pending CreditOverride gagal dicatat console.error berkonteks; hasil tertahan tetap dikembalikan (dokumen memang tidak lahir) — bukan sukses semu",
  "src/lib/hooks/sales-payment.hook.ts": "akrual komisi tahap 3 best-effort dalam recalc paid: mapping belum lengkap = catat alasan + faktur tetap paid (vonis R-komisi-vonispayable §5) — bukan angka yang ditelan, bukan sukses semu",
  "src/app/(dashboard)/crm/tickets/page.tsx": "BR-CTQ-11/CTB-09/SLA 001-U: kegagalan loader kartu menyembunyikan kartu saja; daftar tiket existing tetap dapat dipakai, bukan angka kosong karangan",
  "src/app/(dashboard)/crm/tickets/[slug]/page.tsx": "SLA 001-U: kegagalan loader = tanpa seksi SLA di detail; konten tiket existing tetap tampil, bukan angka yang ditelan",
  "src/app/(dashboard)/proyek/page.tsx": "kegagalan loader antrean tahap dicatat console.error berkonteks; seksi turunan kosong, daftar proyek existing tetap tampil — bukan angka yang ditelan",
  "src/app/(dashboard)/keuangan/pengeluaran/page.tsx": "kegagalan loader antrean draft dicatat console.error berkonteks; seksi turunan kosong, daftar pengeluaran existing tetap tampil — bukan angka yang ditelan",
  "src/app/(dashboard)/keuangan/laporan-bank/page.tsx": "kegagalan loader antrean draft dicatat console.error berkonteks; seksi turunan kosong, daftar rekening koran existing tetap tampil — bukan angka yang ditelan",
}

const ALLOWED_DEFAULT_RETURN: Record<string, string> = {
  "src/app/(dashboard)/pengaturan/ubah/_components/settings-edit-form.tsx": "Kontrak helper: uploadFile mengembalikan null saat gagal (hasil console.error) — pola yang sama dengan logo.ts. Setiap pemanggil WAJIB melaporkan; sudah begitu di handleLogoChange/handleLogoDarkChange/handleSignatureChange (showError, preview sengaja tidak berubah).",
  "src/components/layout/notification-dropdown.tsx": "markAsRead sengaja fail-closed: bila server gagal menyimpan, badge tidak diturunkan supaya status lokal tidak dibohongi (server tetap sumber kebenaran). Alasan tertulis ada di blok — bukan error yang ditelan.",
  "src/components/ui/quick-add-select.tsx": "gagal memuat pilihan tidak boleh memblokir pengisian field lain (degradasi disengaja, ada alasannya di blok)",
  "src/lib/auth/document-scope.ts": "false = tolak akses (fail-closed) yang sah, bukan kegagalan tersembunyi",
  "src/lib/pdf/engine/logo.ts": "null = tak ada logo; kontrak fungsi memang mengembalikan null bila data URL/berkas tak terbaca",
  "src/lib/pdf/generator.ts": "null = gambar tak tersedia; pemanggil memperlakukannya sebagai \"tanpa gambar\"",
  "src/lib/security/same-origin.ts": "false = origin tidak cocok (tolak), bukan kegagalan tersembunyi",
  "src/lib/security/secure-request.ts": "false = bukan HTTPS (tolak), bukan kegagalan tersembunyi",
  "src/lib/services/costing-method.service.ts": "DB tak terjangkau → jatuh ke default \"fifo\" agar pergerakan inventaris tak gagal (degradasi disengaja, beralasan)",
  "src/lib/services/recurring.service.ts": "template gagal di-parse → objek kosong; kontrak fungsi memang mengembalikan template kosong",
  "src/lib/setup/install-state.ts": "tabel tak ada / DB tak terjangkau → dianggap belum terpasang (degradasi disengaja, beralasan)",
  "src/lib/utils/idempotency.ts": "pembersihan best-effort; kegagalan dicatat dan dianggap \"tak ada yang dihapus\"",
  "src/lib/utils/safe-parse.ts": "parse JSON gagal → null; kontrak fungsi memang mengembalikan null",
  "src/lib/reports/return-credit.ts": "resolusi akun Piutang global gagal → null = akun belum terkonfigurasi; returnCredit dianggap 0 dan laporan tetap jalan (pola existing sales-target-achievement-data)",
}

function collectViolations(
  predicate: (block: CatchBlock) => boolean,
  beku: Record<string, string>,
): string[] {
  const pelanggar: string[] = []
  for (const dir of DIRS) {
    for (const file of productionFiles(dir)) {
      const relative = path.relative(ROOT, file)
      if (beku[relative]) continue
      const source = fs.readFileSync(file, "utf8")
      for (const block of catchBlocks(source)) {
        if (predicate(block)) pelanggar.push(`${relative}:${block.line}`)
      }
    }
  }
  return pelanggar.sort()
}

function daftarMembusuk(
  predicate: (block: CatchBlock) => boolean,
  beku: Record<string, string>,
): string[] {
  return Object.keys(beku).filter((relative) => {
    const full = path.join(ROOT, relative)
    if (!fs.existsSync(full)) return true
    // Tidak ada regex stateful di sini — `catchBlocks` selalu mulai bersih.
    return !catchBlocks(fs.readFileSync(full, "utf8")).some(predicate)
  })
}

describe("kegagalan senyap: tidak ada catch kosong di kode produksi", () => {
  it("setiap catch punya isi, atau berkasnya terdaftar sebagai pengecualian beralasan", () => {
    const pelanggar: string[] = []

    for (const dir of DIRS) {
      for (const file of productionFiles(dir)) {
        const relative = path.relative(ROOT, file)
        if (ALLOWED[relative]) continue
        const source = fs.readFileSync(file, "utf8")
        for (const match of source.matchAll(EMPTY_CATCH)) {
          pelanggar.push(`${relative}:${source.slice(0, match.index).split("\n").length}`)
        }
      }
    }

    expect({ catchKosong: pelanggar.sort() }).toEqual({ catchKosong: [] })
  })

  it("pengecualian catch-kosong tidak membusuk (berkas ada DAN pelanggarannya masih ada)", () => {
    const takTerpakai = Object.keys(ALLOWED).filter((relative) => {
      const full = path.join(ROOT, relative)
      if (!fs.existsSync(full)) return true
      // Salinan tanpa flag `g`: regex ber-`g` stateful pada `.test()` (lastIndex
      // berpindah), yang membuat pemeriksaan ini berbohong — pelajaran yang sama
      // seperti daftar promise di bawah.
      //
      // Mengapa juga menuntut pelanggarannya masih ada: pengecualian di sini bersifat
      // PER-BERKAS. Bila pelanggaran aslinya diperbaiki, entri yang dibiarkan akan terus
      // mengizinkan pelanggaran BARU di berkas yang sama — jadi perbaikan harus memaksa
      // penghapusan entri ini.
      const pola = new RegExp(EMPTY_CATCH.source)
      return !pola.test(fs.readFileSync(full, "utf8"))
    })
    expect({ pengecualianTakTerpakai: takTerpakai }).toEqual({ pengecualianTakTerpakai: [] })
  })

  it("tidak ada `.catch()` senyap di luar daftar pengecualian", () => {
    const pelanggar: string[] = []

    for (const dir of DIRS) {
      for (const file of productionFiles(dir)) {
        const relative = path.relative(ROOT, file)
        if (ALLOWED_PROMISE_CATCH[relative]) continue
        const source = fs.readFileSync(file, "utf8")
        for (const match of source.matchAll(SILENT_PROMISE_CATCH)) {
          pelanggar.push(`${relative}:${source.slice(0, match.index).split("\n").length}`)
        }
      }
    }

    expect({ catchPromiseSenyap: pelanggar.sort() }).toEqual({ catchPromiseSenyap: [] })
  })

  it("daftar pengecualian promise tidak membusuk", () => {
    const tidakTerpakai = Object.keys(ALLOWED_PROMISE_CATCH).filter((relative) => {
      const full = path.join(ROOT, relative)
      if (!fs.existsSync(full)) return true
      // Salinan tanpa flag `g`: regex ber-`g` bersifat stateful pada `.test()`
      // (lastIndex berpindah antar-panggilan), yang membuat pemeriksaan ini bohong.
      const pola = new RegExp(SILENT_PROMISE_CATCH.source)
      return !pola.test(fs.readFileSync(full, "utf8"))
    })
    expect({ pengecualianTakTerpakai: tidakTerpakai }).toEqual({ pengecualianTakTerpakai: [] })
  })
})

describe("kegagalan senyap lanjutan: console-only, comment-only, default-return", () => {
  it("(1) catch yang isinya hanya console.* (tanpa throw/return) tidak lolos di luar daftar", () => {
    expect({ consoleOnly: collectViolations(isConsoleOnly, ALLOWED_CONSOLE_ONLY) })
      .toEqual({ consoleOnly: [] })
  })

  it("(1b) daftar console-only tidak membusuk", () => {
    expect({ pengecualianTakTerpakai: daftarMembusuk(isConsoleOnly, ALLOWED_CONSOLE_ONLY) })
      .toEqual({ pengecualianTakTerpakai: [] })
  })

  it("(2) catch yang isinya hanya komentar tidak lolos di luar daftar", () => {
    expect({ commentOnly: collectViolations(isCommentOnly, ALLOWED_COMMENT_ONLY) })
      .toEqual({ commentOnly: [] })
  })

  it("(2b) daftar comment-only tidak membusuk", () => {
    expect({ pengecualianTakTerpakai: daftarMembusuk(isCommentOnly, ALLOWED_COMMENT_ONLY) })
      .toEqual({ pengecualianTakTerpakai: [] })
  })

  it("(3) catch yang mengembalikan nilai default tanpa penanda gagal tidak lolos di luar daftar", () => {
    expect({ defaultReturn: collectViolations(isDefaultReturn, ALLOWED_DEFAULT_RETURN) })
      .toEqual({ defaultReturn: [] })
  })

  it("(3b) daftar default-return tidak membusuk", () => {
    expect({ pengecualianTakTerpakai: daftarMembusuk(isDefaultReturn, ALLOWED_DEFAULT_RETURN) })
      .toEqual({ pengecualianTakTerpakai: [] })
  })
})
