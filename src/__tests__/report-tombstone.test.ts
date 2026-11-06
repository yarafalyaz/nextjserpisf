import fs from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import {
  ROOT,
  argumentObject,
  resolvedWhere,
  walk,
  writerSoftModels,
} from "./support/tombstone-models"

/**
 * Guard: loader laporan tidak boleh menghitung baris yang sudah dihapus lunak.
 *
 * Laporan adalah tempat cacat ini paling mahal: angka yang salah tidak
 * kelihatan salah. Kasus nyatanya — L/R Proyek (`project-pl-data.ts`) membaca
 * `pettyCash.findMany({ where: { projectId, type: "OUT" } })` tanpa filter,
 * sehingga kas kecil yang dibatalkan (`deletePettyCash` menulis `status:
 * "void"` + `deletedAt`) tetap dihitung sebagai biaya proyek, padahal jurnal
 * lawannya sudah di-REVERSED. Laporan menampilkan biaya yang di buku besar
 * tidak ada, dan setiap pembaca pettyCash lain di repo menyaringnya — hanya
 * dua loader laporan ini yang tidak.
 *
 * Aturannya: setiap `findMany`/`findFirst`/`count`/`aggregate`/`groupBy` atas
 * model ber-tombstone di permukaan laporan (`lib/reports`, halaman `laporan/`,
 * `components/reports`) wajib menyebut `deletedAt: null`, baik langsung di
 * `where` maupun lewat `const <nama> = {...}` yang diselesaikan
 * `resolvedWhere`.
 *
 * Yang sengaja di luar aturan:
 *
 *   1. **Pembacaan relasional** (`where: { id }`, `where: { id: { in: ids } }`)
 *      — baris master yang dibaca untuk MENAMPILKAN nama pada dokumen lama.
 *      Menyaringnya mengosongkan nama pada laporan historis; dokumennya sah
 *      menunjuk baris yang belakangan dihapus.
 *   2. **Daftar pengecualian** di bawah, untuk pemetaan identitas. Dibaca
 *      DUA ARAH (konvensi repo): entri yang alasannya sudah tidak berlaku
 *      akan memerahkan tes sampai daftarnya dipangkas.
 */

/**
 * Berkas → alasan mengapa pembacaan master tombstone di sana sengaja tanpa filter.
 */
const EXEMPT: Record<string, string> = {
  "src/lib/reports/employee-loan-channel-data.ts":
    "pemetaan userId→employee pembuat pinjaman: identitas, bukan daftar pilihan",
  "src/lib/reports/payslip-self-data.ts":
    "pemetaan login→employee milik sendiri: identitas pemanggil, bukan data laporan",
}

/**
 * Tiga permukaan laporan. Loader (`src/lib/reports`) adalah pemilik angka,
 * tetapi halaman `laporan/` melakukan 99 pembacaan master sendiri (chip
 * filter, opsi, seksi ringkas) dan `components/reports` menyusun tabel yang
 * sama — angka yang salah di sana sama mahalnya dengan angka yang salah di
 * loader, jadi aturannya berlaku di ketiganya.
 */
const REPORT_ROOTS = [
  "src/lib/reports",
  "src/app/(dashboard)/laporan",
  "src/components/reports",
].map((dir) => path.join(ROOT, dir))

function reportFiles(): string[] {
  return REPORT_ROOTS.flatMap((dir) =>
    walk(dir, (n) => n.endsWith(".ts") || n.endsWith(".tsx")),
  )
}

function offences(): { file: string; line: number; model: string }[] {
  const tombstoned = writerSoftModels()
  const models = [...tombstoned].join("|")
  if (!models) return []
  const pattern = new RegExp(
    `prisma\\.(${models})\\.(?:findMany|findFirst|findUnique|count|aggregate|groupBy)\\(`,
    "g",
  )
  const bad: { file: string; line: number; model: string }[] = []

  for (const file of reportFiles()) {
    const rel = path.relative(ROOT, file)
    if (EXEMPT[rel]) continue
    const source = fs.readFileSync(file, "utf8")
    for (const match of source.matchAll(pattern)) {
      const index = match.index ?? 0
      const args = argumentObject(source, index + match[0].length - 1)
      if (!args) continue
      const where = resolvedWhere(source, index, args)
      if (where === null) {
        bad.push({ file: rel, line: lineOf(source, index), model: match[1] })
        continue
      }
      // Pembacaan relasional: menampilkan dokumen lama, bukan memilih baris.
      if (/^\{\s*id\s*[:,]/.test(where.trim())) continue
      if (/\bid\s*:\s*\{\s*in\s*:/.test(where)) continue
      if (/\bdeletedAt\s*:\s*null/.test(where)) continue
      bad.push({ file: rel, line: lineOf(source, index), model: match[1] })
    }
  }
  return bad
}

function lineOf(source: string, index: number): number {
  return source.slice(0, index).split("\n").length
}

describe("loader laporan menyaring baris tombstone", () => {
  it("tidak ada pembacaan master ber-tombstone tanpa deletedAt: null", () => {
    expect(offences()).toEqual([])
  })

  it("pengecualian tidak membusuk: berkasnya masih ada dan masih butuh pengecualian", () => {
    // Dua arah: kalau berkasnya dipindah/dihapus, atau pembacaannya kini
    // menyaring, entri harus dibuang — bukan tertinggal sebagai izin kosong.
    const stale: string[] = []
    for (const rel of Object.keys(EXEMPT)) {
      const file = path.join(ROOT, rel)
      if (!fs.existsSync(file)) {
        stale.push(`${rel}: berkas tidak ada lagi`)
        continue
      }
      const saved = EXEMPT[rel]
      delete EXEMPT[rel]
      const stillOffending = offences().some((o) => o.file === rel)
      EXEMPT[rel] = saved
      if (!stillOffending) stale.push(`${rel}: sudah tidak butuh pengecualian`)
    }
    expect(stale).toEqual([])
  })

  it("kontrol positif: pemindaian benar-benar memeriksa laporan", () => {
    const files = reportFiles()
    expect(files.length).toBeGreaterThanOrEqual(150)
    const withMasterReads = files.filter((f) =>
      /prisma\.(item|employee|customer|vendor|warehouse)\.(findMany|findFirst)\(/.test(
        fs.readFileSync(f, "utf8"),
      ),
    )
    expect(withMasterReads.length).toBeGreaterThanOrEqual(10)
    // Halaman laporan ikut diperiksa, bukan hanya loader: 99 pembacaan
    // master tersebar di 71 berkas permukaan laporan, dan mayoritas berada
    // di luar `src/lib/reports`.
    expect(files.some((f) => f.includes("/laporan/"))).toBe(true)
    expect(files.some((f) => f.includes("/components/reports/"))).toBe(true)
  })
})
