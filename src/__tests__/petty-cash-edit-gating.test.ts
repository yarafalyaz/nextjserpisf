import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"

/**
 * Penjaga: halaman detail kas kecil tidak menawarkan Ubah untuk record yang
 * pasti ditolak.
 *
 * `updatePettyCash` menolak lebih dulu, sebelum mutasi apa pun, bila record
 * punya jurnal POSTED (GL-BR-003 P6: record ber-jurnal POSTED beku total).
 * Setiap kas kecil lahir dengan jurnal POSTED — `createPettyCash` memanggil
 * `onPettyCashCreated`, dan jalur sinkronisasi expense membuat baris yang
 * sama — jadi tombol Ubah di halaman detail praktis SELALU berakhir dengan
 * "Transaksi kas kecil yang sudah terposting tidak dapat diubah".
 *
 * Koreksi yang sah adalah pembatalan beralasan (void) lalu buat transaksi
 * baru. Halaman kini menyembunyikan Ubah bila jurnal POSTED ada atau barisnya
 * sudah void.
 */

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8")

const PAGE = "src/app/(dashboard)/keuangan/kas-kecil/[slug]/page.tsx"

describe("detail kas kecil — Ubah hanya untuk record yang bisa diubah", () => {
  it("halaman memeriksa jurnal POSTED sebelum merender tombol", () => {
    const src = read(PAGE)
    expect(src).toMatch(/referenceType:\s*"PettyCash"/)
    expect(src).toMatch(/status:\s*"POSTED"/)
    expect(src).toMatch(/const isEditable = !postedJournal && pettyCash\.status !== "void"/)
  })

  it("tombol Ubah digerbangi isEditable", () => {
    const src = read(PAGE)
    expect(src).toMatch(/\{isEditable && \(\s*<CanCreate permission="edit_petty_cash">/)
  })

  it("Ubah tidak lagi dirender tanpa syarat", () => {
    // Ratchet: setiap kemunculan CanCreate edit_petty_cash harus didahului
    // gerbang isEditable. Memeriksa per kemunculan, bukan per regex baris —
    // `\s*` pada regex multiline ikut menelan baris sebelumnya sehingga pola
    // "awal baris" tidak membedakan bergerbang dan tidak.
    const src = read(PAGE)
    const marker = '<CanCreate permission="edit_petty_cash">'
    let idx = src.indexOf(marker)
    expect(idx, "tombol Ubah kas kecil hilang").toBeGreaterThan(-1)
    while (idx !== -1) {
      const before = src.slice(Math.max(0, idx - 120), idx)
      expect(before, "CanCreate edit_petty_cash tanpa gerbang isEditable").toContain(
        "isEditable &&",
      )
      idx = src.indexOf(marker, idx + 1)
    }
  })

  it("updatePettyCash memang menolak jurnal POSTED (alasan gerbangnya)", () => {
    // Penjaga ini hanya sah selama action-nya benar-benar menolak; kalau
    // guard action dilonggarkan, tes ini memerah dan memaksa keduanya
    // diselaraskan ulang.
    const src = read("src/actions/finance.actions.ts")
    const start = src.indexOf("export async function updatePettyCash")
    expect(start).toBeGreaterThan(-1)
    const next = src.indexOf("\nexport ", start)
    const body = src.slice(start, next === -1 ? src.length : next)
    expect(body).toMatch(/status:\s*"POSTED"/)
    expect(body).toContain("tidak dapat diubah")
  })
})
