import fs from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

/**
 * Guard: setiap kolom skalar di `prisma/schema.prisma` harus benar-benar dipakai kode.
 *
 * Alasannya nyata: sesi ini menemukan `SalesInvoice.amountPaid` — kolom duplikat dari
 * `paidAmount` yang selalu 0 karena tak ada kode yang menulisnya. Kolom seperti itu
 * menyesatkan pembaca berikutnya (dua nama mirip, satu diam-diam kosong) dan tak
 * ketahuan oleh tsc, tes, maupun build. Lihat `docs/AUDIT-SCHEMA.md`.
 *
 * Dua keputusan penting soal cara memeriksa:
 *
 * 1. **SQL migrasi TIDAK dihitung sebagai pemakaian.** Kalau `.sql` ikut dipindai, setiap
 *    kolom akan "terpakai" hanya karena pernah muncul di `migration.sql` — persis yang
 *    membuat `amount_paid` tak pernah terdeteksi. Karena itu korpus = berkas kode saja.
 * 2. **Kolom FK dilewati.** Prisma memakai FK lewat `connect: { rel: ... }` tanpa pernah
 *    menyebut nama kolomnya (`requesterId`, `ticketId`, …), jadi menandainya sebagai
 *    "tak terpakai" adalah positif-palsu.
 *
 * `KNOWN_UNUSED` adalah daftar-beku: menambah kolom mati BARU akan memerahkan tes ini,
 * dan menambal kolom yang sudah ada di daftar juga memerahkan tes (dulu `updatedBy` —
 * kini sudah ditulis) — supaya daftarnya tidak membusuk.
 */
const KNOWN_UNUSED: string[] = [
  // Catatan: `*.updatedBy` dan kolom penaut rekonsiliasi yang duplikat TIDAK ada lagi di
  // daftar ini — keduanya sudah ditutup (updatedBy kini benar-benar ditulis; kolom
  // duplikat sudah dibuang). Ringkasan temuan yang sudah ditutup: docs/AUDIT-SCHEMA.md §0.
  //
  // Sisa "gelombang 2" — enam kolom yang baru terdeteksi mati setelah 11 skrip yatim
  // dibuang (satu-satunya "pemakaian"-nya ada di skrip seed yang sudah rusak/tak terpakai).
  // Dua di antaranya sudah ditutup: `BankStatement.totalDebits`/`totalCredits` kini
  // dihitung ulang dari baris rekening koran di dalam transaksi yang sama
  // (`recalcBankStatementTotals` di `src/actions/finance.actions.ts`, lewat
  // create/update/deleteBankStatementLine) dan dikunci penjaga `finance.actions.test.ts`.
  // Empat sisanya (di bawah) menunggu keputusan produk: implementasikan atau buang lewat
  // migrasi. Lihat docs/AUDIT-SCHEMA.md §3.
  // (`Asset.assetBrandModelId` PERNAH di sini — ditutup bersama dropdown
  // "Tipe / Model" berjenjang di form aset + tulis create/update + penjagaan
  // model↔merek di aksi; guard berarah dua memerah saat perbaikan mendarat.)
  // (`ApprovalWorkflowStep.canSkip`, `BankReconciliationItem.clearedDate`, dan
  // `BankStatementLine.matchedType` PERNAH di sini — dibuang lewat migrasi
  // `20261019001000_drop_wave2_dead_columns` (2026-10-19, branch kerja):
  // ketiganya 0 rujukan kode produk; `cleared` tetap dipakai matematika
  // outstanding `completeReconciliation`; guard berarah dua memerah saat
  // pembuangan mendarat.)
  // (`SalesReturn.taxReturnNoteNumber` + `PurchaseReturn.taxReturnNoteNumber`
  // PERNAH di sini — ditutup F-004 §3: create/update kedua retur kini menulis
  // nomor + tanggal nota retur apa adanya; guard berarah dua memerah saat
  // entri basi ini dibiarkan sesudah penulisan mendarat.)
  // (Fase1 lead 2026-10-29: kolom NON-FK baru tanpa konsumen — konsumen
  // (snapshot saat start, roster load, lembur WO) menyusul batch berikut.
  // Kolom FK (fields: relation) otomatis hidup lewat fkScalars, tak perlu
  // di sini. Buang entri saat konsumen mendarat, bukan sebelumnya.)
  "OvertimeRequest.actualEndTime",
  "OvertimeRequest.actualStartTime",
].sort()

const ROOT = path.resolve(__dirname, "../..")

/**
 * Kolom yang HANYA dirujuk skrip seed / prisma seed — tidak oleh kode produk.
 *
 * Kelas ini lolos dari pemeriksaan "kolom mati" di atas karena seed ikut dipindai
 * sebagai kode. Padahal dari sudut pandang produk kolomnya mati: UI dan laporan
 * tidak pernah mengisinya, sehingga basis data demo menampilkan nilai yang TIDAK
 * BISA dihasilkan alur nyata — dan itu justru lebih menyesatkan daripada kolom
 * kosong, karena angkanya terlihat masuk akal.
 *
 * Contoh nyata: kolom GPS absensi (`Attendance.checkInLatitude`,
 * `checkInLongitude`, `checkOutLatitude`, `checkOutLongitude`) HANYA diisi
 * `scripts/seed-hrm-crm-e2e.ts` — formulir absensi `/sdm/absensi` dan aksinya
 * belum menangkap lokasi, jadi dasbor absensi menampilkan GPS check-in/check-out
 * yang tidak bisa dihasilkan alur nyata mana pun.
 *
 * Sebaliknya `Attendance.checkOut`, `Attendance.overtimeMinutes`, dan
 * `Attendance.overtimeApproved` SUDAH TIDAK di daftar ini: `createAttendance` dan
 * `updateAttendance` (halaman `/sdm/absensi`) menulisnya dari jam dinding WIB —
 * dikunci penjaga di `src/actions/__tests__/hrm.actions.test.ts`.
 *
 * Berarah dua: menambah kolom baru yang hanya dipakai seed memerahkan tes, dan
 * entri yang sudah dirujuk kode produk juga memerahkan tes (daftar tidak membusuk).
 * Keputusan per kolom: implementasikan fiturnya, atau buang kolomnya lewat migrasi.
 */
const SEED_ONLY_COLUMNS: string[] = [
  "Attendance.checkInLatitude",
  "Attendance.checkInLongitude",
  "Attendance.checkOutLatitude",
  "Attendance.checkOutLongitude",
  // (CrmTicket.firstResponseAt/resolvedAt PERNAH di sini — ditutup bersama
  // `updateTicket` yang mengisinya otomatis saat status berubah; guard
  // berarah dua memerah saat perbaikan ini mendarat, lalu entri dibuang.)
].sort()

/**
 * Model yang DIBACA kode produk tetapi TIDAK punya jalur tulis di produk sama
 * sekali (hanya skrip seed yang bisa mengisinya).
 *
 * Ini kelas yang sama dengan SEED_ONLY_COLUMNS, tetapi di tingkat model, dan
 * akibatnya lebih besar: seluruh fiturnya tidak bisa dipakai. Contoh:
 *
 * - `Holiday`, `WorkSchedule`, `DepartmentHoliday` — SUDAH DITUTUP, ketiganya
 *   TIDAK ada lagi di daftar: halaman `/sdm/kalender-kerja` + aksi
 *   `createHoliday`/`updateHoliday`/`deleteHoliday`,
 *   `createDepartmentHoliday`/…, `createWorkSchedule`/… menulisnya, dan
 *   perhitungan hari kerja kini bisa benar tanpa seed.
 * - `Attendance` — SUDAH DITUTUP, entri ini TIDAK ada lagi di daftar: halaman
 *   `/sdm/absensi` memanggil `createAttendance`/`updateAttendance`/
 *   `deleteAttendance` (izin `create_attendance`/`edit_attendance`/
 *   `manage_attendance`), mengonversi jam dinding WIB lewat `attendance-time.ts`.
 *   Yang masih seed-only tinggal kolom GPS-nya (lihat SEED_ONLY_COLUMNS).
 * - `ProfitCenter` — SUDAH DITUTUP dan TERHUBUNG: master `/keuangan/pusat-laba` +
 *   aksi create/update/delete, dan form jurnal menulis `profitCenterId` ke setiap
 *   entri (buat & ubah).
 *
 * Yang TIDAK masuk daftar ini (dan tidak boleh dimasukkan tanpa verifikasi):
 * model yang ditulis lewat nested write (`items: { create: [...] }`), lewat raw
 * SQL (`ActivityLog` ditulis `INSERT INTO activity_logs` di
 * `activity-log.service.ts`), atau lewat lembar tersendiri. Pemeriksaannya
 * karena itu menyertakan tiga jalur tulis tersebut.
 *
 * Berarah dua: model baru yang hanya bisa diisi seed memerahkan tes, dan entri
 * yang sudah punya jalur tulis produk (atau modelnya dibuang) juga memerahkan.
 */
const SEED_ONLY_MODELS: string[] = [
  // F-2026-10-21-026: tabel tarif TER PP 58/2023 (Lampiran A/B/C) hanya diisi
  // migrasi seed dari regulasi; tidak ada jalur tulis produk karena tarif
  // bukan data operasional — perubahan tarif wajib migrasi baru dari regulasi.
  "PayrollTerBracket",
  // Kehadiran: SUDAH DITUTUP — halaman `/sdm/absensi` + `createAttendance`,
  // `updateAttendance`, `deleteAttendance` (izin create/edit/manage_attendance)
  // menulis absensi dari jam dinding WIB, jadi entri `Attendance` TIDAK lagi di
  // daftar ini.
  // SDM: hari libur, hari libur departemen, dan jadwal kerja ditutup bersama
  // halamannya (`/sdm/kalender-kerja`) — lihat catatan di atas.
  // (sebelumnya tiga entri di sini, kini TIDAK ada lagi)
  // Rekening koran: SUDAH DITUTUP — entri `BankStatementLine` TIDAK ada lagi di
  // daftar ini. `createBankStatementLine`/`updateBankStatementLine`/
  // `deleteBankStatementLine` (`src/actions/finance.actions.ts`, izin
  // `create_journals` — sama dengan penulis header `createBankStatement`) menulis
  // barisnya dan menghitung ulang `BankStatement.totalDebits/totalCredits` header
  // di dalam transaksi yang sama, sehingga halaman detail rekening koran akhirnya
  // punya isi. `BankStatementLine.matchedType` yang dulu tanpa rujukan SUDAH
  // DIBUANG (migrasi `20261019001000_drop_wave2_dead_columns`).
  // CRM: komentar tiket dibaca lewat nested read — ditutup bersama aksinya
  // (`addTicketComment` + form di detail tiket), lihat catatan di bawah.
  // Proyek: log proyek ditutup bersama aksinya (`addProjectLog` + form di tab Log).
  // Pusat laba ditutup bersama halamannya (`/keuangan/pusat-laba`: master + aksi
  // create/update/delete), jadi entri ini TIDAK ada lagi di daftar.
  // Ditutup: `UserWarehouse` SUDAH punya jalur tulis — `updateUserWarehouses`
  // (aksi + panel akses gudang di halaman detail pengguna), sehingga peran
  // `warehouse` bisa diberi akses gudang. Karena itu ia TIDAK lagi di daftar ini:
  // penjaga berarah dua akan memerahkan tes bila entri basi tetap dibiarkan.
].sort()

const SCALAR_TYPES = new Set([
  "String",
  "Int",
  "Boolean",
  "DateTime",
  "Decimal",
  "Float",
  "Json",
  "Bytes",
  "BigInt",
])

/** Berkas ini memuat nama semua kolom di `KNOWN_UNUSED`; kalau ikut dipindai, daftar-beku
 *  itu sendiri terbaca sebagai "pemakaian" dan tesnya jadi tidak bermakna. */
const SELF = "schema-usage.test.ts"

function readCode(relativeDir: string, out: string[]) {
  const dir = path.join(ROOT, relativeDir)
  if (!fs.existsSync(dir)) return
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue
    if (entry.name === SELF) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) readCode(path.relative(ROOT, full), out)
    else if (/\.(ts|tsx|mjs|js)$/.test(entry.name)) out.push(fs.readFileSync(full, "utf8"))
  }
}

/** Field skalar yang dilewati karena dipakai Prisma sebagai kolom FK. */
function foreignKeyScalars(schema: string): Set<string> {
  const fks = new Set<string>()
  for (const m of schema.matchAll(/@relation\([^)]*fields:\s*\[([^\]]*)\]/g)) {
    for (const raw of m[1].split(",")) {
      const name = raw.trim()
      if (name) fks.add(name)
    }
  }
  return fks
}

describe("skema: setiap kolom skalar dipakai kode", () => {
  it(
    "tidak ada kolom mati di luar daftar-beku",
    () => {
    const schema = fs.readFileSync(path.join(ROOT, "prisma/schema.prisma"), "utf8")
    const code = (() => {
      const parts: string[] = []
      for (const dir of ["src", "scripts", "e2e", "prisma"]) readCode(dir, parts)
      return parts.join("\n")
    })()
    const fkScalars = foreignKeyScalars(schema)

    const unused: string[] = []
    for (const [, model, body] of schema.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)) {
      for (const line of body.split("\n")) {
        const field = /^\s{2}([a-z]\w*)\s+([A-Z]\w*)(\[\])?\??\s*(.*)$/.exec(line)
        if (!field) continue
        const [, name, type, array, rest] = field
        if (!SCALAR_TYPES.has(type) || array || rest.includes("@relation")) continue
        if (fkScalars.has(name)) continue
        const column = /@map\("([^"]+)"\)/.exec(rest)?.[1]
        const used = [name, column]
          .filter((value): value is string => Boolean(value))
          .some((value) => new RegExp(`\\b${value}\\b`).test(code))
        if (!used) unused.push(`${model}.${name}`)
      }
    }

    const baru = unused.sort().filter((entry) => !KNOWN_UNUSED.includes(entry))
    const basi = KNOWN_UNUSED.filter((entry) => !unused.includes(entry))

    expect({ kolomMatiBaru: baru, daftarBekuUsang: basi }).toEqual({
      kolomMatiBaru: [],
      daftarBekuUsang: [],
    })
    },
    // Pemindaian korpus besar ini ~2 detik saat sendirian, tetapi melewati batas
    // bawaan 5 detik vitest saat suite penuh berjalan paralel (`--maxWorkers=4`) —
    // pernah terlihat gagal pada 5046ms. Timeout eksplisit menyamakannya dengan
    // dua tes seed-only di bawah, supaya kegagalannya berarti isi repo, bukan beban mesin.
    20_000,
  )
})

/** Model yang sama sekali tak dipakai kode. Diperiksa di tingkat MODEL karena
 *  pemeriksaan per-kolom bisa meleset: nama field sebuah model mati bisa muncul di
 *  kode lain (mis. `content`, `comment`), sehingga seluruh modelnya lolos. */
/**
 * Model yang benar-benar tak dipakai kode.
 *
 * KOSONG — dan itu hasil koreksi: dua model yang dulu terdaftar di sini
 * (`QcInspectionResult`, `ProductionGenealogyMaterial`) TIDAK mati. Keduanya dipakai
 * lewat **nama relasi** di dalam nested write/read Prisma
 * (`results: { … }`, `materials: { create: … }`), yang tidak pernah menyebut nama
 * modelnya. Pelajaran: "tak ada rujukan ke nama model" != "model mati" — pemeriksaan
 * harus ikut melihat nama relasi (lihat `dipakai()` di bawah).
 */
const KNOWN_UNUSED_MODELS: Array<{ model: string; reason: string }> = [
  // Fase1 lead 2026-10-29: konsumen menyusul batch berikut.
  { model: "EmployeeRoster", reason: "R7 roster — load papan beban menyusul" },
]

describe("skema: setiap model dipakai kode", () => {
  const schema = fs.readFileSync(path.join(ROOT, "prisma/schema.prisma"), "utf8")
  const code = (() => {
    const parts: string[] = []
    for (const dir of ["src", "scripts", "e2e", "prisma"]) readCode(dir, parts)
    return parts.join("\n")
  })()
  const namaModel = [...schema.matchAll(/^model (\w+) \{/gm)].map((m) => m[1])
  // Nama relasi yang menunjuk ke model ini, mis. `results QcInspectionResult[]`.
  const namaRelasi = (model: string) =>
    [
      ...schema.matchAll(new RegExp(`^  +(\\w+)\\s+${model}\\[?\\]?\\??.*$`, "gm")),
    ]
      .map((m) => m[1])
      // Minimal 2 spasi indentasi + bukan kata kunci `model`: tanpa ini, baris header
      // `model X {` ikut tertangkap sebagai "relasi bernama model", dan karena `model:`
      // hampir pasti ada di suatu objek di kode, pemeriksaan ini SELALU menganggap
      // "dipakai" — penjaganya mati tanpa ketahuan (ditemukan lewat falsifikasi).
      .filter((nama) => nama !== "model")

  const dipakai = (model: string) => {
    const delegate = model[0].toLowerCase() + model.slice(1)
    if (new RegExp(`\\b${model}\\b`).test(code)) return true
    if (new RegExp(`\\b${delegate}\\b`).test(code)) return true
    // Nested write/read memakai NAMA RELASI, bukan nama model — inilah yang dulu
    // membuat `QcInspectionResult` & `ProductionGenealogyMaterial` keliru disebut mati.
    // Dibatasi ke posisi khas Prisma (`nama: {`, `nama: true`, `nama: [`) agar kata
    // umum seperti `results`/`materials` di variabel lokal tidak menjadi positif-palsu.
    return namaRelasi(model).some((rel) =>
      new RegExp(`\\b${rel}\\b\\s*:\\s*(\\{|true|false|\\[)`).test(code),
    )
  }
  const modelMati = namaModel.filter((model) => !dipakai(model)).sort()

  it("tidak ada model mati di luar daftar-beku", () => {
    expect(modelMati).toEqual(KNOWN_UNUSED_MODELS.map((x) => x.model).sort())
  })

  it("daftar model mati tidak membusuk (yang sudah dipakai harus dikeluarkan)", () => {
    const basi = KNOWN_UNUSED_MODELS.map((x) => x.model).filter((model) => dipakai(model))
    expect(basi, `model ini sudah dipakai — keluarkan dari daftar: ${basi.join(", ")}`).toEqual([])
  })
})

/** Kolom skalar: entri `Model.field` + semua nama yang mungkin muncul di kode. */
function scalarFields(schema: string): Array<{ entry: string; names: string[] }> {
  const fkScalars = foreignKeyScalars(schema)
  const out: Array<{ entry: string; names: string[] }> = []
  for (const [, model, body] of schema.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)) {
    for (const line of body.split("\n")) {
      const field = /^\s{2}([a-z]\w*)\s+([A-Z]\w*)(\[\])?\??\s*(.*)$/.exec(line)
      if (!field) continue
      const [, name, type, array, rest] = field
      if (!SCALAR_TYPES.has(type) || array || rest.includes("@relation")) continue
      if (fkScalars.has(name)) continue
      const column = /@map\("([^"]+)"\)/.exec(rest)?.[1]
      out.push({ entry: `${model}.${name}`, names: column ? [name, column] : [name] })
    }
  }
  return out
}

describe("skema: kolom yang hanya dipakai skrip seed", () => {
  it(
    "kolom seed-only terdaftar, dan daftarnya tidak membusuk",
    () => {
    const schema = fs.readFileSync(path.join(ROOT, "prisma/schema.prisma"), "utf8")
    const produk: string[] = []
    for (const dir of ["src", "e2e"]) readCode(dir, produk)
    const seed: string[] = []
    for (const dir of ["scripts", "prisma"]) readCode(dir, seed)

    const teksProduk = produk.join("\n")
    const teksSeed = seed.join("\n")
    const dirujuk = (text: string, names: string[]) =>
      names.some((name) => new RegExp(`\\b${name}\\b`).test(text))

    const seedOnly = scalarFields(schema)
      .filter((f) => !dirujuk(teksProduk, f.names) && dirujuk(teksSeed, f.names))
      .map((f) => f.entry)
      .sort()

    expect(
      seedOnly,
      seedOnly.length === SEED_ONLY_COLUMNS.length
        ? undefined
        : "Ada kolom yang HANYA diisi skrip seed: kode produk tidak pernah " +
          "menulis/membacanya, sehingga basis data demo menampilkan nilai yang " +
          "tidak bisa dihasilkan alur nyata. Implementasikan fiturnya, atau " +
          "catat di SEED_ONLY_COLUMNS dengan alasan. Sebaliknya, entri yang " +
          "sudah dirujuk kode produk (atau kolomnya sudah dibuang) harus " +
          "dikeluarkan dari daftar supaya tidak membusuk.",
    ).toEqual(SEED_ONLY_COLUMNS)
    },
    20_000,
  )
})

/**
 * Indeks sekali-jalan atas korpus: penjaga yang memindai seluruh repo WAJIB cepat.
 * Versi pertama pemeriksaan ini mengompilasi ulang regex per model x per relasi
 * (147 model) atas korpus besar; dijalankan sendiri 7 detik, dan saat suite penuh
 * berjalan paralel (`--maxWorkers=4`) ia melewati batas 5 detik default vitest dan
 * gagal sebagai "flaky" — lulus/gagal bergantung beban mesin, bukan isi repo.
 * Dengan indeks ini pemeriksaannya satu lintasan per kelas pola.
 */
function productIndex(teks: string) {
  const tulisDelegate = new Set<string>()
  const bacaDelegate = new Set<string>()
  for (const m of teks.matchAll(
    /\.(\w+)\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\s*\(/g,
  )) {
    tulisDelegate.add(m[1])
  }
  for (const m of teks.matchAll(
    /\.(\w+)\.(findMany|findFirst|findUnique|findUniqueOrThrow|count|aggregate|groupBy)\s*\(/g,
  )) {
    bacaDelegate.add(m[1])
  }
  const tabelSql = new Set<string>()
  for (const m of teks.matchAll(/(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+`?(\w+)`?/gi)) {
    tabelSql.add(m[1].toLowerCase())
  }
  // Nested write: `rel: { ... create: ... }` dalam jarak dekat. Kuncinya diperiksa
  // SATU PER SATU lewat jendela setelah `key: {` — bukan satu regex yang menelan
  // jendela, karena `data: {` akan menyerap `userWarehouses: {` di dalamnya dan
  // relasinya tidak pernah tercatat (terbukti: penjaga memvonis `UserWarehouse`
  // tanpa jalur tulis padahal aksinya menulis lewat nested write).
  const relNested = new Set<string>()
  const keyRe = /(\w+)\s*:\s*\{/g
  let keyMatch: RegExpExecArray | null
  while ((keyMatch = keyRe.exec(teks)) !== null) {
    const from = keyMatch.index + keyMatch[0].length
    const window = teks.slice(from, from + 200)
    if (/\b(?:create|createMany|connectOrCreate|upsert|deleteMany)\b\s*:/.test(window)) {
      relNested.add(keyMatch[1])
    }
  }
  // Relasi yang dipakai sebagai pembacaan (`rel: {`, `rel: true`, `rel: [`).
  const relRead = new Set<string>()
  for (const m of teks.matchAll(/(\w+)\s*:\s*(?:\{|true|\[)/g)) {
    relRead.add(m[1])
  }
  return { tulisDelegate, bacaDelegate, tabelSql, relNested, relRead }
}

describe("skema: model yang dibaca tetapi tidak punya jalur tulis di produk", () => {
  it(
    "model seed-only terdaftar, dan daftarnya tidak membusuk",
    () => {
      const schema = fs.readFileSync(path.join(ROOT, "prisma/schema.prisma"), "utf8")
      const produk: string[] = []
      for (const dir of ["src", "e2e"]) readCode(dir, produk)
      const idx = productIndex(produk.join("\n"))

      const seedOnly: string[] = []
      for (const [, model, body] of schema.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)) {
        const delegate = model[0].toLowerCase() + model.slice(1)
        const table = (/@@map\("([^"]+)"\)/.exec(body)?.[1] ?? model).toLowerCase()

        const tulisDelegate = idx.tulisDelegate.has(delegate)
        const tulisSql = idx.tabelSql.has(table) || idx.tabelSql.has(model.toLowerCase())
        const namaRelasi = [
          ...schema.matchAll(new RegExp(`^  +(\\w+)\\s+${model}\\[?\\]?\\??.*$`, "gm")),
        ]
          .map((m) => m[1])
          .filter((nama) => nama !== "model")
        const tulisNested = namaRelasi.some((rel) => idx.relNested.has(rel))
        const dibaca =
          idx.bacaDelegate.has(delegate) || namaRelasi.some((rel) => idx.relRead.has(rel))

        if (dibaca && !tulisDelegate && !tulisSql && !tulisNested) seedOnly.push(model)
      }

      seedOnly.sort()
      expect(
        seedOnly,
        seedOnly.length === SEED_ONLY_MODELS.length
          ? undefined
          : "Ada model yang DIBACA kode produk tetapi tidak punya jalur tulis di " +
            "produk: seluruh fiturnya hanya bisa benar pada basis data yang " +
            "di-seed. Implementasikan jalur tulisnya (halaman + aksi), atau catat " +
            "di SEED_ONLY_MODELS dengan alasan. Entri yang sudah punya jalur tulis " +
            "harus dikeluarkan supaya daftarnya tidak membusuk.",
      ).toEqual(SEED_ONLY_MODELS)
    },
    20_000,
  )
})

/**
 * F-2026-10-22-069-S: ItemSubstitute = master relasi substitusi part
 * (satu baris per arah; @see ../actions/item-substitute.actions menilai
 * pasangan; @see ../lib/reports/item-substitute-suggestions-data
 * membaca relasi aktif untuk saran WO read-only). __EVAL_MODELS__
 * menilai model dari nama model nyata di prisma client — nama ini
 * diverifikasi ADA: prisma/schema.prisma:model ItemSubstitute +
 * client ter-generate itemSubstitute (relasi balik Item.substitutes /
 * Item.substitutedFor).
 */
describe("ItemSubstitute (digunakan aksi master + loader saran)", () => {
  it("model ItemSubstitute dipakai actions + loader (bukan seed-only)", async () => {
    const fs = await import("fs")
    const path = await import("path")
    const actionsSrc = fs.readFileSync(
      path.join(ROOT, "src", "actions", "item-substitute.actions.ts"),
      "utf8",
    )
    const loaderSrc = fs.readFileSync(
      path.join(ROOT, "src", "lib", "reports", "item-substitute-suggestions-data.ts"),
      "utf8",
    )
    expect(actionsSrc).toContain("prisma.itemSubstitute")
    expect(loaderSrc).toContain("prisma.itemSubstitute.findMany")
  })
})
