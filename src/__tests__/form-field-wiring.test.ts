import { describe, it, expect } from "vitest"
import { readFileSync, readdirSync, statSync } from "node:fs"
import { join, basename } from "node:path"

/**
 * Penjaga "field form yang tidak dibaca siapa pun".
 *
 * Kelas bug yang dijaga: nilai dari formulir dibuang DIAM-DIAM. Dua bentuk yang
 * sudah nyata terjadi di repo ini:
 *   1. skema validasi tidak mendeklarasikan kuncinya, sehingga zod membuangnya
 *      sebelum aksi melihatnya (contoh: dropdown "Merek" form aset -> `assetBrandId`
 *      tidak ada di `assetSchema`; pengguna memilih merek, halaman tetap "-", tanpa
 *      error dan tanpa satu tes memerah);
 *   2. aksi tidak pernah membaca fieldnya sama sekali.
 *
 * Aturannya sederhana dan sengaja tidak pintar: setiap nama field yang dikirim
 * formulir HARUS terbukti dibaca di suatu tempat — entah sebagai kunci skema
 * validasi, entah lewat `formData.get/getAll("...")` langsung. Kalau tidak, tidak
 * ada jalur yang bisa memakainya, dan itu selalu bug (bukan pilihan desain).
 *
 * Berarah dua seperti penjaga lain di folder ini: mencabut kunci dari skema, atau
 * menghapus pembacaan FormData-nya, memerahkan tes ini.
 *
 * Terverifikasi saat dibuat: 94 formulir dan 413 kunci skema, NOL pelanggaran nyata —
 * jadi daftar pengecualian di bawah memang kosong, bukan karena dilonggarkan.
 *
 * BATAS ATURAN (jujur, karena penjaga yang diam-diam lemah lebih menyesatkan daripada
 * tidak ada penjaga): bukti "dibaca" adalah nama field muncul sebagai literal teks di
 * luar berkas form. Aturan ini sengaja longgar supaya tidak berisik — ia menangkap
 * `formData.getAll("x")` yang terpecah baris, helper seperti `strNull("x")`, dan
 * pemetaan manual ke payload. Konsekuensinya: sebuah field dianggap terbaca bila
 * namanya muncul sebagai string di mana pun di luar form, jadi kemungkinan salah
 * tetap ada (positif palsu). Kelas yang BENAR-BENAR dijaga adalah yang pernah terjadi:
 * nama field yang tidak dirujuk siapa pun kecuali formulirnya sendiri — seperti
 * `assetBrandId`, yang dulu hilang karena `assetSchema` tidak mendeklarasikannya.
 */

const ROOT = join(__dirname, "..", "..")

/**
 * Daftar-beku: field yang SAH tidak dibaca, beserta alasannya.
 *
 * Sengaja KOSONG. Saat penjaga ini dibuat, seluruh 94 formulir sudah bersih:
 * satu-satunya field yang tampak tidak terbaca (`modelId` di form kendaraan) ternyata
 * sah — tabel `Vehicle` tidak punya kolom model, model kendaraan tersirat dari
 * variannya, dan field itu murni state cascade di sisi klien.
 *
 * Kalau suatu saat ada field yang benar-benar tidak dibaca, entri di sini WAJIB
 * memuat alasannya, bukan sekadar namanya.
 */
const KNOWN_UNREAD_FORM_FIELDS: Array<[field: string, reason: string]> = [
  [
    "periodLockDateDisplay",
    "Tampil-saja (disabled) di form pengaturan; kunci periode hanya diubah lewat Proses Akhir Bulan (R-09).",
  ],
  [
    "violationDate",
    "Form pengajuan surat peringatan (DISC-F1) terkendali: AppDatePicker mengisi state React violationDate, lalu onSubmit membaca state itu ke createDisciplinaryRecord — input tersembunyi AppDatePicker tidak dipakai sebagai FormData.",
  ],
  [
    "sampaiTanggal",
    "Filter klien perintah pembayaran: nilainya dibaca dari state React dan dikirim sebagai segmen path /sampai/<tanggal>, bukan FormData — input tersembunyi AppDatePicker tidak pernah terkirim.",
  ],
]

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return out
  }
  for (const entry of entries) {
    if (entry === "node_modules" || entry === ".next" || entry.startsWith(".")) continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full)
  }
  return out
}

const isFormFile = (file: string) => /form/i.test(basename(file)) && file.endsWith(".tsx")

function schemaBody(text: string, schemaName: string): string | null {
  return (
    text.match(
      new RegExp(
        String.raw`(?:const|let|var)\s+${schemaName}\s*=\s*z\.object\s*\(\s*\{([\s\S]*?)\}\s*\)`,
      ),
    )?.[1] ?? null
  )
}

function collect(): {
  fields: Map<string, string[]>
  schemaKeys: Set<string>
  readKeys: Set<string>
  actionSchemaKeys: Set<string>
  actionFormDataKeys: Set<string>
} {
  const files = walk(join(ROOT, "src"))
  const fields = new Map<string, string[]>()
  const schemaKeys = new Set<string>()
  const readKeys = new Set<string>()
  const actionSchemaKeys = new Set<string>()
  const actionFormDataKeys = new Set<string>()

  for (const file of files) {
    const text = readFileSync(file, "utf8")
    const rel = file.replace(ROOT + "/", "")

    if (rel === "src/__tests__/form-field-wiring.test.ts") continue

    if (isFormFile(file)) {
      const names = [
        ...text.matchAll(/name="([A-Za-z_][A-Za-z0-9_]*)"/g),
        ...text.matchAll(/\b(?:fd|formData)\.(?:set|append)\(\s*"([A-Za-z_][A-Za-z0-9_]*)"/g),
      ].map((m) => m[1])
      for (const name of names) {
        const list = fields.get(name) ?? []
        if (!list.includes(rel)) list.push(rel)
        fields.set(name, list)
      }
      continue
    }

    if (rel.startsWith("src/lib/validations/")) {
      for (const m of text.matchAll(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*:/gm)) schemaKeys.add(m[1])
      continue
    }

    const isActionSource = /^src\/actions\/.+\.actions\.ts$/.test(rel)
    if (isActionSource && /\bparseFormData\s*\(/.test(text)) {
      // Generalisasi sempit (Bot 6): panen HANYA kunci z.object lokal dalam
      // berkas aksi ini yang namanya benar-benar diteruskan ke
      // parseFormData(...). Bukti dipisah ke actionSchemaKeys supaya
      // pemalsuan "cabut satu key dari skema ini saja" bisa memerahkan
      // penjaga di file yang sama — bukan sekadar literal bebas.
      const usedSchemas = new Set(
        [...text.matchAll(/\bparseFormData\s*\(\s*([A-Za-z_$][A-Za-z0-9_$]*)/g)].map((m) => m[1]),
      )
      for (const schemaName of usedSchemas) {
        const body = schemaBody(text, schemaName)
        if (!body) continue
        for (const m of body.matchAll(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*:/gm)) actionSchemaKeys.add(m[1])
      }
      for (const m of text.matchAll(/\bformData\.get(?:All)?\s*\(\s*["']([A-Za-z_][A-Za-z0-9_]*)["']/g)) actionFormDataKeys.add(m[1])
      continue
    }

    // Bukti "dibaca": nama field muncul sebagai literal teks di LUAR berkas form —
    // menangkap `formData.getAll("x")` (termasuk yang terpecah baris karena prettier),
    // helper seperti `strNull("x")`, dan pemetaan manual ke payload.
    for (const m of text.matchAll(/["']([A-Za-z_][A-Za-z0-9_]*)["']/g)) readKeys.add(m[1])
  }

  return { fields, schemaKeys, readKeys, actionSchemaKeys, actionFormDataKeys }
}

describe("field formulir yang tidak dibaca siapa pun (data hilang senyap)", () => {
  it("setiap field form dibaca lewat skema validasi atau FormData langsung", () => {
    const { fields, schemaKeys, readKeys, actionSchemaKeys, actionFormDataKeys } = collect()
    const isRead = (f: string) =>
      schemaKeys.has(f) || readKeys.has(f) || actionSchemaKeys.has(f) || actionFormDataKeys.has(f)

    // Sanity: kalau pemindaiannya rusak (mis. path salah), tes ini harus gagal,
    // bukan lulus karena tidak menemukan apa-apa.
    expect(fields.size).toBeGreaterThan(100)
    expect(schemaKeys.size).toBeGreaterThan(200)

    const boxed = new Set(KNOWN_UNREAD_FORM_FIELDS.map(([field]) => field))
    const offenders: string[] = []
    for (const [field, where] of fields) {
      if (isRead(field) || boxed.has(field)) continue
      offenders.push(`${field} (dikirim oleh ${where.join(", ")})`)
    }

    expect(offenders.sort()).toEqual([])
  })

  it("skema lokal tax-documents.actions.ts yang dipakai parseFormData ikut dipanen", () => {
    const { fields, actionSchemaKeys } = collect()
    expect(fields.has("certificateNumber")).toBe(true)
    expect(actionSchemaKeys.has("certificateNumber")).toBe(true)
  })

  it("daftar-beku tidak menyimpan entri yang sudah usang", () => {
    // Berarah dua: kalau field di daftar-beku ternyata SUDAH dibaca (diperbaiki),
    // entri itu wajib dicabut supaya daftarnya tidak menumpuk kebohongan.
    const { fields, schemaKeys, readKeys, actionSchemaKeys, actionFormDataKeys } = collect()
    const stale = KNOWN_UNREAD_FORM_FIELDS.filter(([field]) => {
      const isSentByForm = fields.has(field)
      const isRead =
        schemaKeys.has(field) || readKeys.has(field) || actionSchemaKeys.has(field) || actionFormDataKeys.has(field)
      return !isSentByForm || isRead
    }).map(([field]) => field)

    expect(stale).toEqual([])
  })
})
