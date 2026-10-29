import fs from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

/**
 * Guard: cabang idempotensi hook ("sudah diproses → lewati") wajib mencatat
 * `console.info` berkonteks, bukan `return` polos.
 *
 * Idempotensi diam sah secara fungsi (anti-posting-ganda) tetapi membuat
 * pemanggil tak bisa membedakan "sudah diproses" vs "baru diproses" — di log
 * produksi keduanya tampak seperti tidak pernah jalan. Pola ini sudah jadi
 * rekomendasi audit rekonsiliasi 2026-10-18 §6 ("log peringatan murah untuk
 * audit") dan diperbaiki di `accounting.hook.ts` (11 hook × cek luar +
 * dalam-tx), `expense.hook.ts`, dan `inventory-transfer.hook.ts`.
 *
 * Guard ini berarah dua: daftar IDEMPOTENT_HOOKS membeku cakupannya — hook
 * baru yang menambah cabang idempotensi wajib didaftarkan; entri yang tidak
 * lagi punya cabang diam ikut memerahkan tes (alasan basi dilarang).
 */
const ROOT = path.resolve(__dirname, "../..")

/** Berkas → label Indonesia yang cabang idempotensinya wajib tercatat di log. */
const IDEMPOTENT_HOOKS: Record<string, { refs: string[]; reason: string }> = {
  "src/lib/hooks/accounting.hook.ts": {
    refs: [
      "pembayaran jual",
      "pesanan beli",
      "pengeluaran",
      "kas kecil",
      "retur jual",
      "retur beli",
      "uang muka",
      "tagihan vendor",
      "pembayaran vendor",
      "penggajian",
      "pinjaman karyawan",
      "setoran tunai pinjaman karyawan",
      "write-off pinjaman karyawan",
    ],
    reason:
      "13 hook posting jurnal; tiap cek idempotensi (luar + dalam-tx) mencatat console.info",
  },
  "src/lib/hooks/expense.hook.ts": {
    refs: ["sudah punya kas kecil"],
    reason:
      "sinkron kas kecil: cek luar + cek-dalam-tx mencatat console.info",
  },
  "src/lib/hooks/inventory-transfer.hook.ts": {
    refs: ["sudah punya movement OUT", "sudah punya movement IN"],
    reason: "movement OUT/IN: kedua cabang mencatat console.info",
  },
  "src/lib/hooks/purchase-return.hook.ts": {
    refs: ["sudah diproses", "sudah berstatus returned"],
    reason: "sudah mencatat console.info sejak awal (pembanding positif)",
  },
}

function bareIdempotentReturns(src: string): string[] {
  // Cabang "if (existing...) return;" / "if (dup) return;" satu-baris TANPA
  // blok console di antaranya — tepatnya pola diam yang dilarang.
  const found: string[] = []
  const re = /if\s*\(\s*(existing\w*|dup)\s*\)\s*return\s*;/g
  let m: RegExpExecArray | null
  while ((m = re.exec(src)) !== null) found.push(`baris ${src.slice(0, m.index).split("\n").length}: ${m[0]}`)
  return found
}

describe("cabang idempotensi hook mencatat log", () => {
  it("tidak ada `if (existing) return;` polos di hook terdaftar", () => {
    const violations: string[] = []
    for (const file of Object.keys(IDEMPOTENT_HOOKS)) {
      const src = fs.readFileSync(path.join(ROOT, file), "utf8")
      for (const v of bareIdempotentReturns(src)) violations.push(`${file} ${v}`)
    }
    expect(violations).toEqual([])
  }, 20_000)

  it("tiap referenceType terdaftar benar-benar dicatat di console.info", () => {
    const missing: string[] = []
    for (const [file, { refs }] of Object.entries(IDEMPOTENT_HOOKS)) {
      const src = fs.readFileSync(path.join(ROOT, file), "utf8")
      // Indeks sekali-jalan: kumpulkan semua literal console.info lalu cocokkan.
      const logged = new Set<string>()
      for (const m of src.matchAll(/console\.info\(\s*`([^`]+)`/g)) logged.add(m[1])
      for (const ref of refs) {
        const hit = [...logged].some(
          (line) => line.includes(ref) && /dilewati|diproses/.test(line),
        )
        if (!hit) missing.push(`${file}: ${ref}`)
      }
    }
    expect(missing).toEqual([])
  }, 20_000)

  it("cakupan tidak hampa: hook terdaftar memuat cabang idempotensi", () => {
    // Kalau pemindaian rusak (path salah), tes di atas lulus hampa.
    let branches = 0
    for (const file of Object.keys(IDEMPOTENT_HOOKS)) {
      const src = fs.readFileSync(path.join(ROOT, file), "utf8")
      branches += (src.match(/Idempotency/gi) ?? []).length
    }
    expect(branches).toBeGreaterThan(10)
  })
})
