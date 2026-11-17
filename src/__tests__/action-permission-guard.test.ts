import { describe, it, expect } from "vitest"
import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import ts from "typescript"

/**
 * Penjaga: setiap server action di `src/actions/*.actions.ts` yang menyentuh
 * Prisma (create/update/delete/upsert/$executeRaw) WAJIB memakai penjaga IZIN
 * yang MENGGERBANGI mutasi Prisma pertamanya.
 *
 * Kenapa ini penting: server action adalah SATU-SATUNYA lapisan mutasi aplikasi
 * ini (proxy/halaman hanya menjaga tampilan). Penjaga izin yang lupa dipasang di
 * satu action = satu endpoint mutasi yang bisa dipanggil pengguna tanpa izin,
 * dan tidak ada tsc/lint/tes lain yang menangkapnya — halaman tetap hijau, form
 * tetap tampil, hanya enforcement-nya hilang. Ini kelas bug yang sama dengan
 * yang dijaga `page-action-permission-parity.test.ts` (sisi halaman) dan
 * `permission-seed-parity.test.ts` (sisi string izin); berkas ini menutup sisi
 * action.
 *
 * Aturan yang ditegakkan:
 *   1. Aksi "menyentuh Prisma" bila badannya memuat pemanggilan
 *      `.create/.update/.delete/.upsert/.createMany/.updateMany/.deleteMany/
 *      $executeRaw` — bentuk mutasi Prisma yang dipakai di repo ini.
 *   2. Aksi itu "dijaga" bila sebuah penjaga IZIN menggerbangi (dominate) mutasi
 *      Prisma pertama pada badan fungsi yang sama.
 *   3. `requireAuth()` SAJA tidak dihitung sebagai penjaga izin — ia hanya
 *      membuktikan "sudah login", bukan "berhak". Itu sebabnya dua aksi profil
 *      masuk daftar pengecualian di bawah.
 *
 * "Menggerbangi" itu inti penjaga ini, bukan sekadar "muncul lebih dulu":
 *
 *   - Penjaga yang THROW/REDIRECT sendiri (`requirePermission`,
 *     `requireAnyPermission`, `requireRole`, `assertCan*`,
 *     `assertApprovalPermission`, `assertStepApprover`) cukup dipanggil sebagai
 *     statement sebelum mutasi: kegagalannya menghentikan fungsi.
 *   - Penjaga BOOLEAN (`hasPermission`, `hasAnyPermission`, `hasRole`) TIDAK
 *     pernah throw — ia hanya mengembalikan boolean (`src/lib/auth/permissions.ts`).
 *     Jadi ia HANYA dihitung bila hasilnya benar-benar dipakai untuk
 *     menggerbangi mutasi:
 *       · `if (!(await hasPermission(x))) { return/throw … }`
 *       · `const allowed = await hasPermission(x); if (!allowed) throw …`
 *       · `if (!(a && (await hasPermission(x)))) throw …` (pembatalan De Morgan)
 *       · `if (!(await hasPermission(x) ?? false)) return …` (falsy → tolak)
 *     Panggilan telanjang `await hasPermission(x)` yang hasilnya dibuang, atau
 *     hasil yang hanya disimpan di variabel dan tak pernah menggerbangi apa pun,
 *     TIDAK dihitung — pola itulah yang membuat action lolos tanpa otorisasi.
 *
 * Analisisnya memakai parser TypeScript sungguhan (dependency repo), bukan
 * regex: "menggerbangi" butuh pohon sintaks. Penilaiannya konservatif ke arah
 * MERAH — bentuk yang tak dikenali dianggap tidak menggerbangi.
 *
 * Repo tidak punya penjaga statis lain untuk hal ini, jadi bila ke depan ada yang
 * menambah action mutasi tanpa izin, tes inilah yang harus memerah.
 */

const ROOT = process.cwd()
const ACTIONS_DIR = join(ROOT, "src", "actions")

/** Penjaga yang menegakkan otorisasi dengan THROW/REDIRECT sendiri. */
const PENJAGA_MENOLAK_SENDIRI = new Set([
  "requirePermission",
  "requireAnyPermission",
  "requireRole",
  "assertApprovalPermission",
  "assertStepApprover",
])

/** Penjaga ber-return boolean — hanya menggerbangi bila hasilnya dipakai. */
const PENJAGA_BOOLEAN = new Set(["hasPermission", "hasAnyPermission", "hasRole"])

/** Mutasi Prisma yang dihitung sebagai "menyentuh Prisma". */
const MUTASI_PRISMA = new Set([
  "create",
  "update",
  "delete",
  "upsert",
  "createMany",
  "updateMany",
  "deleteMany",
  "executeRaw",
  "executeRawUnsafe",
  "$executeRaw",
  "$executeRawUnsafe",
])

const OPERATOR_LOGIS: Set<ts.SyntaxKind> = new Set([
  ts.SyntaxKind.AmpersandAmpersandToken,
  ts.SyntaxKind.BarBarToken,
  ts.SyntaxKind.QuestionQuestionToken,
])

const namaPanggilan = (ekspresi: ts.Expression | undefined): string | null => {
  if (!ekspresi || !ts.isCallExpression(ekspresi)) return null
  const kal = ekspresi.expression
  if (ts.isIdentifier(kal)) return kal.text
  if (ts.isPropertyAccessExpression(kal)) return kal.name.text
  return null
}

const namaPanggilanInti = (ekspresi: ts.Expression): string | null =>
  namaPanggilan(inti(ekspresi))

const adalahPenjagaMenolakSendiri = (ekspresi: ts.Expression | undefined): boolean => {
  const nama = ekspresi ? namaPanggilanInti(ekspresi) : null
  if (!nama) return false
  return (
    PENJAGA_MENOLAK_SENDIRI.has(nama) ||
    (nama.startsWith("assertCan") && nama.length > "assertCan".length)
  )
}

const adalahPenjagaBoolean = (ekspresi: ts.Expression | undefined): boolean => {
  const nama = ekspresi ? namaPanggilanInti(ekspresi) : null
  return nama !== null && PENJAGA_BOOLEAN.has(nama)
}

/** Buang `await`, kurung, `as …`, dan `!` supaya inti ekspresi terlihat. */
function inti(ekspresi: ts.Expression): ts.Expression {
  let e = ekspresi
  let berubah = true
  while (berubah) {
    berubah = false
    const berikutnya =
      ts.isParenthesizedExpression(e) ? e.expression
      : ts.isAwaitExpression(e) || ts.isTypeAssertionExpression(e) || ts.isAsExpression(e) || ts.isNonNullExpression(e) ? e.expression
      : null
    if (berikutnya) {
      e = berikutnya
      berubah = true
    }
  }
  return e
}

/**
 * Kumpulan `if (!X) { return/throw }` pada satu fungsi langsung (bukan fungsi
 * bersarang), beserta ekspresi positif `X`-nya.
 */
interface CabangPenolak {
  node: ts.IfStatement
  ekspresiPositif: ts.Expression
}

/** Deklarasi variabel lokal satu fungsi → penginisialisasinya. */
type Lingkungan = Map<string, ts.Expression>

/**
 * Bentuk Boolean ekspresi, dengan panggilan penjaga boolean sebagai peubah
 * abstrak (atom `b`). Op-nya persis seperti di JavaScript; konstanta nyata tidak
 * dilacak (dianggap tak diketahui).
 */
type Pohon =
  /** Panggilan penjaga boolean (`hasPermission`, …). */
  | { t: "b" }
  /** Ekspresi yang dipastikan Boolean tapi bukan penjaga (perbandingan, Boolean(…)). */
  | { t: "atom" }
  | { t: "not"; e: Pohon }
  | { t: "and" | "or" | "coalesce"; a: Pohon; b: Pohon }
  | { t: "kondisi"; c: Pohon; ya: Pohon; tidak: Pohon }
  | { t: "lain" }

/**
 * Apakah ekspresi ini PASTI boolean di runtime (perbandingan, `Boolean(...)`,
 * `!x`, `.includes(...)`, `.some(...)`, literal boolean)? Dipakai untuk
 * mendukung `if (!(pastiBoolean && (await hasPermission(x))))`.
 */
function adalahBooleanPasti(ekspresi: ts.Expression, lingkungan: Lingkungan, kedalaman = 0): boolean {
  if (kedalaman > 8) return false
  const e = inti(ekspresi)
  if (
    e.kind === ts.SyntaxKind.TrueKeyword ||
    e.kind === ts.SyntaxKind.FalseKeyword ||
    ts.isParenthesizedExpression(e)
  )
    return true
  if (ts.isPrefixUnaryExpression(e)) return e.operator === ts.SyntaxKind.ExclamationToken
  if (ts.isBinaryExpression(e)) {
    const k = e.operatorToken.kind
    return !(
      k === ts.SyntaxKind.AmpersandAmpersandToken ||
      k === ts.SyntaxKind.BarBarToken ||
      k === ts.SyntaxKind.QuestionQuestionToken
    )
  }
  if (ts.isCallExpression(e)) {
    const nama = namaPanggilan(e)
    if (!nama) return false
    return (
      nama === "Boolean" ||
      nama === "includes" ||
      nama === "some" ||
      nama === "every" ||
      nama === "startsWith" ||
      nama === "endsWith"
    )
  }
  if (ts.isIdentifier(e)) {
    const inisial = lingkungan.get(e.text)
    return inisial ? adalahBooleanPasti(inisial, lingkungan, kedalaman + 1) : false
  }
  return false
}

function pohon(ekspresi: ts.Expression, lingkungan: Lingkungan, kedalaman = 0): Pohon {
  if (kedalaman > 8) return { t: "lain" }
  const e = inti(ekspresi)
  if (ts.isIdentifier(e)) {
    const inisial = lingkungan.get(e.text)
    if (!inisial) return { t: "lain" }
    const semula = pohon(inisial, lingkungan, kedalaman + 1)
    // Hanya `init` dari perbandingan/Boolean(...) yang pasti Boolean.
    if (semula.t === "lain" && adalahBooleanPasti(inisial, lingkungan)) return { t: "atom" }
    return semula
  }
  if (adalahPenjagaBoolean(e)) return { t: "b" }
  if (ts.isPrefixUnaryExpression(e) && e.operator === ts.SyntaxKind.ExclamationToken) {
    const dalam = pohon(e.operand, lingkungan, kedalaman)
    return { t: "not", e: dalam }
  }
  if (ts.isParenthesizedExpression(e)) return pohon(e.expression, lingkungan, kedalaman + 1)
  if (ts.isBinaryExpression(e) && OPERATOR_LOGIS.has(e.operatorToken.kind)) {
    const op = e.operatorToken.kind
    const t =
      op === ts.SyntaxKind.AmpersandAmpersandToken ? "and"
      : op === ts.SyntaxKind.BarBarToken ? "or"
      : "coalesce"
    const node: Pohon = {
      t,
      a: pohon(e.left, lingkungan, kedalaman),
      b: pohon(e.right, lingkungan, kedalaman),
    }
    return node
  }
  if (ts.isConditionalExpression(e)) {
    return {
      t: "kondisi",
      c: pohon(e.condition, lingkungan, kedalaman),
      ya: pohon(e.whenTrue, lingkungan, kedalaman),
      tidak: pohon(e.whenFalse, lingkungan, kedalaman),
    }
  }
  return { t: "lain" }
}

const B3 = "b" as const
type Nilai3 = boolean | typeof B3 | null

/** Nilai ekspresi untuk `b = nilai`: true/false pasti, "b" bila sama dengan izin, null bila tak pasti. */
function nilaiPohon(p: Pohon, izin: boolean): Nilai3 {
  switch (p.t) {
    case "b":
      return izin
    case "atom":
      return izin ? true : null
    case "lain":
      return null
    case "not": {
      const d = nilaiPohon(p.e, izin)
      if (d === null || d === B3) return d
      return !d
    }
    case "and": {
      const k = nilaiPohon(p.a, izin)
      if (k === false) return false
      const n = nilaiPohon(p.b, izin)
      if (n === false) return false
      if (k === true) return n
      // k === "b" | null: saat izin=false seluruhnya false; saat izin=true k=true.
      return B3
    }
    case "or": {
      const k = nilaiPohon(p.a, izin)
      if (k === true) return true
      const n = nilaiPohon(p.b, izin)
      if (n === true) return true
      if (k === false) return n
      return n === false ? B3 : null
    }
    case "coalesce":
      // `x ?? b`: x tak diketahui, jadi b dipakai bila x nullish — tak pasti.
      return null
    case "kondisi": {
      const c = nilaiPohon(p.c, izin)
      if (c === true) return nilaiPohon(p.ya, izin)
      if (c === false) return nilaiPohon(p.tidak, izin)
      return null
    }
    default:
      return null
  }
}

/**
 * Penolakan penjaga yang sebenarnya: untuk kedua nilai izin, apakah cabang
 * `if (!X)` pasti TIDAK menolak saat diizinkan dan PASTI menolak saat ditolak.
 * Itu menjamin "lolos ⟹ punya izin". Bentuk yang menghasilkan `"b"` (mis.
 * `a || b` dengan `a` tak diketahui) sengaja tidak dihitung.
 */
function evaluasiPohon(ekspresi: ts.Expression, lingkungan: Lingkungan) {
  const p = pohon(ekspresi, lingkungan)
  const diizinkan = nilaiPohon(p, true)
  const ditolak = nilaiPohon(p, false)
  return { diizinkan, ditolak }
}

/** Apakah klausa `if` ini menolak akses (berisi return/throw/redirect)? */
function klausaMenolak(klausa: ts.Statement): boolean {
  let menolak = false
  const periksa = (node: ts.Node): void => {
    if (menolak) return
    if (ts.isReturnStatement(node) || ts.isThrowStatement(node)) {
      menolak = true
      return
    }
    if (ts.isCallExpression(node) && namaPanggilan(node) === "redirect") {
      menolak = true
      return
    }
    // Jangan turun ke fungsi bersarang: return di sana bukan return aksi ini.
    if (ts.isFunctionLike(node) && node !== klausa) return
    ts.forEachChild(node, periksa)
  }
  if (ts.isBlock(klausa)) ts.forEachChild(klausa, periksa)
  else periksa(klausa)
  return menolak
}

function lingkunganFungsi(badan: ts.Node): Lingkungan {
  const env: Lingkungan = new Map()
  const kunjungi = (node: ts.Node): void => {
    if (ts.isFunctionLike(node) && node !== badan) return
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      if (!env.has(node.name.text)) env.set(node.name.text, node.initializer)
    }
    ts.forEachChild(node, kunjungi)
  }
  ts.forEachChild(badan, kunjungi)
  return env
}

function cabangPenolak(badan: ts.Node, hasil: CabangPenolak[]): void {
  const kunjungi = (node: ts.Node): void => {
    if (ts.isFunctionLike(node) && node !== badan) return
    if (ts.isIfStatement(node) && klausaMenolak(node.thenStatement)) {
      const kondisi = inti(node.expression)
      if (ts.isPrefixUnaryExpression(kondisi) && kondisi.operator === ts.SyntaxKind.ExclamationToken) {
        hasil.push({ node, ekspresiPositif: inti(kondisi.operand) })
      }
    }
    ts.forEachChild(node, kunjungi)
  }
  ts.forEachChild(badan, kunjungi)
}

function posisiMutasiPertama(badan: ts.Node): number | null {
  let pos: number | null = null
  const kunjungi = (node: ts.Node): void => {
    if (pos !== null) return
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      if (MUTASI_PRISMA.has(node.expression.name.text)) {
        pos = node.getStart()
        return
      }
    }
    ts.forEachChild(node, kunjungi)
  }
  kunjungi(badan)
  return pos
}

function posisiPenjagaMenolakSendiri(badan: ts.Node): number | null {
  let pos: number | null = null
  const kunjungi = (node: ts.Node): void => {
    if (pos !== null) return
    if (ts.isCallExpression(node) && adalahPenjagaMenolakSendiri(node)) {
      pos = node.getStart()
      return
    }
    ts.forEachChild(node, kunjungi)
  }
  kunjungi(badan)
  return pos
}

function cacahPenjagaBoolean(node: ts.Node | ts.Expression): number {
  let n = 0
  const kunjungi = (x: ts.Node): void => {
    if (ts.isCallExpression(x) && adalahPenjagaBoolean(x)) n += 1
    ts.forEachChild(x, kunjungi)
  }
  kunjungi(node)
  return n
}

interface Fakta {
  /** Ada mutasi Prisma di badan aksi. */
  bermutasi: boolean
  /** Jumlah panggilan penjaga yang MENGGERBANGI mutasi pertama. */
  menggerbangi: number
  /** Jumlah panggilan penjaga boolean di seluruh badan. */
  penjagaBooleanTotal: number
  /** Panggilan penjaga boolean yang hasilnya tidak menggerbangi apa pun. */
  penjagaBooleanDibuang: number
}

function analisa(badan: ts.Node, lingkungan: Lingkungan): Fakta {
  const mutasi = posisiMutasiPertama(badan)
  const penjagaBooleanTotal = cacahPenjagaBoolean(badan)
  if (mutasi === null) {
    return { bermutasi: false, menggerbangi: 0, penjagaBooleanTotal, penjagaBooleanDibuang: 0 }
  }

  // Penjaga yang throw/redirect sendiri: harus muncul sebelum mutasi.
  const menolakSendiri = posisiPenjagaMenolakSendiri(badan)
  let menggerbangi = 0
  if (menolakSendiri !== null && menolakSendiri < mutasi) menggerbangi += 1

  // Penjaga boolean: hanya bila `if (!X)` dengan X pasti false saat izin
  // ditolak dan pasti true saat izin diberikan, dan if itu mendahului mutasi.
  let dariBoolean = 0
  const cabang: CabangPenolak[] = []
  cabangPenolak(badan, cabang)
  for (const c of cabang) {
    if (c.node.getStart() > mutasi) continue
    const cek = evaluasiPohon(c.ekspresiPositif, lingkungan)
    const saatDitolak = cek.ditolak
    const saatDiizinkan = cek.diizinkan
    if (saatDiizinkan === true && saatDitolak === false) {
      dariBoolean = 1
    }
  }
  menggerbangi += dariBoolean

  return {
    bermutasi: true,
    menggerbangi,
    penjagaBooleanTotal,
    penjagaBooleanDibuang: penjagaBooleanTotal - dariBoolean,
  }
}

/** Semua `export async function` di satu berkas action, beserta faktanya. */
function analisaBerkas(berkasRelatif: string) {
  const teks = readFileSync(join(ROOT, berkasRelatif), "utf8")
  const sf = ts.createSourceFile(berkasRelatif, teks, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const hasil: { kunci: string; fakta: Fakta }[] = []
  for (const stmt of sf.statements) {
    if (!ts.isFunctionDeclaration(stmt) || !stmt.name || !stmt.body || !stmt.modifiers) continue
    const ekspor = stmt.modifiers.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
    if (!ekspor) continue
    const environment = lingkunganFungsi(stmt.body)
    hasil.push({ kunci: `${berkasRelatif}:${stmt.name.text}`, fakta: analisa(stmt.body, environment) })
  }
  return hasil
}

/**
 * Hitung seluruh action. Diekspor supaya tes bentuk `hasPermission(...)` di
 * bawah bisa memakai fungsi yang sama persis dengan pemindaian repo.
 */
export function analisaAksi() {
  const semua: { kunci: string; fakta: Fakta }[] = []
  const berkas = readdirSync(ACTIONS_DIR)
    .filter((nama) => nama.endsWith(".actions.ts"))
    .sort()
  for (const nama of berkas) {
    semua.push(...analisaBerkas(`src/actions/${nama}`))
  }
  return semua
}

/** Analisis satu potongan sumber (untuk contoh regresi di tes ini). */
function analisaPotongan(badanFungsi: string): Fakta {
  const sumber = `export async function contoh() ${badanFungsi}`
  const sf = ts.createSourceFile("potongan.ts", sumber, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const fn = sf.statements[0] as ts.FunctionDeclaration
  return analisa(fn.body!, lingkunganFungsi(fn.body!))
}

const SEMUA = analisaAksi()
const BERMUTASI = SEMUA.filter((aksi) => aksi.fakta.bermutasi)

/**
 * Daftar-beku BERARAH DUA: satu-satunya aksi yang SAH menyentuh Prisma tanpa
 * penjaga izin. Setiap entri wajib punya alasan; arah kedua (tes "tidak
 * membusuk") memaksa entri dihapus begitu aksinya mendapat penjaga izin.
 */
const PENGECUALIAN: Record<
  string,
  { alasan: string; penjagaAlternatif?: string[] }
> = {
  "src/actions/auth.actions.ts:changePassword": {
    alasan:
      "Aksi login-only: pengguna mengubah password akunnya SENDIRI. userId diambil dari sesi " +
      "(requireAuth), bukan formData (anti-IDOR #17), jadi targetnya selalu pemanggil — tidak ada " +
      "sumber daya lintas-pengguna yang bisa disalahgunakan. requireAuth saja sengaja tidak " +
      "dianggap penjaga izin; jangan tambahkan requirePermission khusus di sini tanpa alasan.",
  },
  "src/actions/auth.actions.ts:updateProfile": {
    alasan:
      "Aksi login-only: pengguna memperbarui profil akunnya SENDIRI. userId dari sesi (requireAuth, " +
      "anti-IDOR #18); target selalu pemanggil, tidak ada otorisasi lintas-pengguna yang perlu dicek.",
  },
  "src/actions/setup.actions.ts:runSetup": {
    alasan:
      "Bootstrap pra-pengguna: berjalan sebelum admin pertama ada, sehingga requirePermission " +
      "mustahil dipakai. Ia menulis Prisma SECARA TIDAK LANGSUNG lewat installBaseData (karena itu " +
      "tak muncul sebagai mutasi langsung), dan dijaga isInstalled() + assertCSRF(). Dua penjaga " +
      "itu dipaku di penjagaAlternatif supaya entri ini tidak membusuk jadi cangkang.",
    penjagaAlternatif: ["isInstalled(", "assertCSRF("],
  },
}

describe("penjaga izin server action yang menyentuh Prisma", () => {
  it("menemukan cukup banyak aksi dan mutasi agar tidak vakum", () => {
    // Penjaga atas extractor itu sendiri: perubahan parsing yang membuat
    // pemeriksaan di bawah kosong harus gagal di sini, bukan lolos diam-diam.
    expect(SEMUA.length).toBeGreaterThan(200)
    expect(BERMUTASI.length).toBeGreaterThan(200)
    // Penjaga boolean harus benar-benar ditemukan, kalau tidak aturan baru
    // di bawah tidak menguji apa pun.
    expect(SEMUA.filter((a) => a.fakta.penjagaBooleanTotal > 0).length).toBeGreaterThan(0)
    for (const kunciPengecualian of Object.keys(PENGECUALIAN)) {
      expect(
        SEMUA.some((aksi) => aksi.kunci === kunciPengecualian),
        `aksi pengecualian tidak ditemukan oleh extractor: ${kunciPengecualian}`,
      ).toBe(true)
    }
  })

  it("setiap aksi yang menyentuh Prisma memakai penjaga izin yang menggerbangi mutasi pertama", () => {
    const takTerdaftar = BERMUTASI.filter(
      (aksi) => aksi.fakta.menggerbangi === 0 && !(aksi.kunci in PENGECUALIAN),
    )
      .map((aksi) => aksi.kunci)
      .sort()

    expect(
      takTerdaftar,
      `Aksi menyentuh Prisma tanpa penjaga izin yang menggerbangi mutasi pertama, dan tidak ` +
        `terdaftar sebagai pengecualian:\n${takTerdaftar.join("\n")}`,
    ).toEqual([])
  })

  it("tidak ada action yang membuang hasil hasPermission/hasAnyPermission", () => {
    // Inti bug kelas ini: `await hasPermission(x)` sebagai statement telanjang
    // tidak menolak apa pun, lalu mutasi berjalan tanpa otorisasi.
    const membuang = SEMUA.filter((aksi) => aksi.fakta.penjagaBooleanDibuang > 0)
      .map((aksi) => `${aksi.kunci} (${aksi.fakta.penjagaBooleanDibuang} panggilan)`)
      .sort()

    expect(
      membuang,
      `Panggilan penjaga boolean yang hasilnya tidak menggerbangi mutasi (dibuang):\n` +
        membuang.join("\n"),
    ).toEqual([])
  })

  it("daftar pengecualian langsung persis sama dengan pelanggar langsung (arah kedua)", () => {
    const pelanggarLangsung = BERMUTASI.filter((aksi) => aksi.fakta.menggerbangi === 0)
      .map((aksi) => aksi.kunci)
      .sort()
    const terdaftarLangsung = Object.keys(PENGECUALIAN)
      .filter((k) => BERMUTASI.some((aksi) => aksi.kunci === k))
      .sort()

    expect(pelanggarLangsung).toEqual(terdaftarLangsung)
  })

  it("pengecualian sah tidak membusuk: alasannya ada dan penjaganya belum berubah", () => {
    const busuk: string[] = []

    for (const [kunciPengecualian, { alasan, penjagaAlternatif }] of Object.entries(PENGECUALIAN)) {
      if (!alasan.trim()) busuk.push(`${kunciPengecualian}: tanpa alasan tertulis`)

      const aksi = SEMUA.find((kandidat) => kandidat.kunci === kunciPengecualian)
      if (!aksi) {
        busuk.push(`${kunciPengecualian}: aksi tidak ditemukan (hapus entri)`)
        continue
      }

      // Arah kedua: begitu aksi ini menggerbangi mutasinya dengan penjaga izin,
      // entri ini kedaluwarsa.
      if (aksi.fakta.menggerbangi > 0) {
        busuk.push(`${kunciPengecualian}: sudah punya penjaga izin — hapus dari daftar pengecualian`)
      }

      // Untuk aksi bootstrap: penjaga alternatif yang menjadi dasar alasan harus tetap ada.
      const sumber = readFileSync(
        join(ROOT, kunciPengecualian.split(":")[0]),
        "utf8",
      )
      for (const penjaga of penjagaAlternatif ?? []) {
        if (!sumber.includes(penjaga)) {
          busuk.push(`${kunciPengecualian}: penjaga alternatif "${penjaga}" hilang`)
        }
      }
    }

    expect(busuk, `Pengecualian yang membusuk:\n${busuk.join("\n")}`).toEqual([])
  })

  it("pengecualian auth-only memang memakai requireAuth (bukan tanpa penjaga sama sekali)", () => {
    // Mendokumentasikan bahwa changePassword/updateProfile bukan "tanpa penjaga",
    // melainkan dijaga autentikasi (userId dari sesi) — bukan otorisasi izin.
    for (const nama of ["changePassword", "updateProfile"]) {
      const relatif = "src/actions/auth.actions.ts"
      const fnAt = readFileSync(join(ROOT, relatif), "utf8").indexOf(`export async function ${nama}`)
      expect(fnAt, `aksi ${nama} tidak ditemukan`).toBeGreaterThan(-1)
      const akhir = readFileSync(join(ROOT, relatif), "utf8").indexOf("export async function", fnAt + 1)
      const badan = readFileSync(join(ROOT, relatif), "utf8").slice(fnAt, akhir === -1 ? undefined : akhir)
      expect(/requireAuth\s*\(/.test(badan), `${nama} tanpa requireAuth`).toBe(true)
    }
  })
})

describe("aturan penggerbangan penjaga boolean", () => {
  it("masih mengenali PERSIS tiga pelanggar lama (daftar pengecualian = pelanggar nyata)", () => {
    const membuang = BERMUTASI.filter((a) => a.fakta.menggerbangi === 0).map((a) => a.kunci).sort()
    // runSetup tidak terdeteksi "bermutasi" (menulis Prisma lewat
    // installBaseData), jadi ia masuk lewat daftar pengecualian saja.
    expect(membuang).toEqual(
      Object.keys(PENGECUALIAN)
        .filter((k) => BERMUTASI.some((a) => a.kunci === k))
        .sort(),
    )
    // Semua panggilan penjaga boolean DI REPO harus benar-benar dipakai.
    expect(SEMUA.reduce((n, a) => n + a.fakta.penjagaBooleanTotal, 0)).toBeGreaterThan(0)
    expect(SEMUA.reduce((n, a) => n + a.fakta.penjagaBooleanDibuang, 0)).toBe(0)
  })

  it("statement telanjang tidak menggerbangi", () => {
    const f = analisaPotongan(`{
      await hasPermission("manage_users")
      await prisma.user.create({ data: {} })
    }`)
    expect(f.bermutasi).toBe(true)
    expect(f.menggerbangi).toBe(0)
    expect(f.penjagaBooleanDibuang).toBe(1)
  })

  it("hasil yang hanya disimpan di variabel juga tidak menggerbangi", () => {
    const f = analisaPotongan(`{
      const allowed = await hasPermission("manage_users")
      void allowed
      await prisma.user.create({ data: {} })
    }`)
    expect(f.menggerbangi).toBe(0)
    expect(f.penjagaBooleanDibuang).toBe(1)
  })

  it("if (!(await hasPermission())) yang throw menggerbangi", () => {
    const f = analisaPotongan(`{
      if (!(await hasPermission("x"))) throw new Error("Akses ditolak")
      await prisma.user.create({ data: {} })
    }`)
    expect(f.menggerbangi).toBe(1)
    expect(f.penjagaBooleanDibuang).toBe(0)
  })

  it("if (!(await hasAnyPermission())) yang return menggerbangi", () => {
    const f = analisaPotongan(`{
      if (!(await hasAnyPermission(["a", "b"]))) return { success: false }
      await prisma.user.update({ where: { id: 1 }, data: {} })
    }`)
    expect(f.menggerbangi).toBe(1)
  })

  it("variabel yang dipakai di kondisi sebelum mutasi menggerbangi", () => {
    const f = analisaPotongan(`{
      const allowed = await hasAnyPermission(["a"])
      if (!allowed) return { success: false }
      await prisma.user.create({ data: {} })
    }`)
    expect(f.menggerbangi).toBe(1)
    expect(f.penjagaBooleanDibuang).toBe(0)
  })

  it("pembatalan De Morgan dengan syarat tambahan menggerbangi", () => {
    const f = analisaPotongan(`{
      const isOwner = Boolean(userId)
      if (!(isOwner && (await hasPermission("x")))) return { success: false }
      await prisma.user.create({ data: {} })
    }`)
    expect(f.menggerbangi).toBe(1)
  })

  it("penjaga sesudah mutasi tidak menggerbangi", () => {
    const f = analisaPotongan(`{
      await prisma.user.create({ data: {} })
      if (!(await hasPermission("x"))) throw new Error("Akses ditolak")
    }`)
    expect(f.menggerbangi).toBe(0)
    expect(f.penjagaBooleanDibuang).toBe(1)
  })

  it("cabang if yang tidak menolak (hanya memperingatkan) tidak menggerbangi", () => {
    const f = analisaPotongan(`{
      if (!(await hasPermission("x"))) console.warn("ditolak")
      await prisma.user.create({ data: {} })
    }`)
    expect(f.menggerbangi).toBe(0)
    expect(f.penjagaBooleanDibuang).toBe(1)
  })

  it("penjaga yang throw/redirect sendiri tetap cukup sebagai statement", () => {
    const f = analisaPotongan(`{
      await requirePermission("manage_users")
      await prisma.user.create({ data: {} })
    }`)
    expect(f.bermutasi).toBe(true)
    expect(f.menggerbangi).toBe(1)
  })
})
