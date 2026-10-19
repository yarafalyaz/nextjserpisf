import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"

/**
 * Penjaga atomisitas jurnal <-> lampiran (ISF-01, audit 2026-10-20).
 *
 * Klaim lampiran `attachPendingTransactionAttachments` HARUS berjalan di
 * dalam callback `$transaction` yang sama dengan mutasi jurnal. Pola lama
 * membuka transaksi DB terpisah SESUDAH transaksi jurnal commit:
 * header+entri sudah tersimpan, lalu klaim gagal -> action menjawab gagal,
 * pengguna mengulang dan lahir jurnal duplikat (create) atau perubahan
 * commit yang dilaporkan gagal (update).
 *
 * Mock unit tidak bisa membuktikan rollback Prisma (mock $transaction tidak
 * membatalkan tulis), jadi letak panggilan di dalam callback adalah kontrak
 * yang dijaga di sini — sama seperti tes statis lain di repo ini.
 */

const ROOT = join(__dirname, "..", "..")
const read = (p: string) => readFileSync(join(ROOT, p), "utf8")

/** Ambil badan fungsi berdasarkan nama, dengan penyeimbangan kurung kurawal. */
function functionBody(src: string, name: string): string {
  const start = src.search(new RegExp(`export async function ${name}\\s*\\(`))
  if (start < 0) throw new Error(`fungsi ${name} tidak ditemukan`)
  const open = src.indexOf("{", start)
  let depth = 0
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") depth++
    else if (src[i] === "}") {
      depth--
      if (depth === 0) return src.slice(open, i + 1)
    }
  }
  throw new Error(`badan fungsi ${name} tidak seimbang`)
}

const FINANCE = "src/actions/finance.actions.ts"

describe("ISF-01: klaim lampiran jurnal atomik dengan mutasi jurnal", () => {
  it("createJournal mengklaim lampiran di dalam $transaction yang sama", () => {
    const body = functionBody(read(FINANCE), "createJournal")
    const txOpen = body.indexOf("$transaction(async (tx)")
    expect(txOpen, "createJournal harus membuka $transaction callback").toBeGreaterThan(-1)
    const attach = body.indexOf("attachJournalAttachments(tx")
    expect(
      attach,
      "attachJournalAttachments(tx, ...) tidak ditemukan di createJournal — " +
        "klaim lampiran harus memakai tx jurnal, bukan transaksi terpisah",
    ).toBeGreaterThan(txOpen)
    expect(body).not.toContain("attachJournalAttachments(formData")
  })

  it("updateJournal mengklaim lampiran di dalam $transaction yang sama", () => {
    const body = functionBody(read(FINANCE), "updateJournal")
    const txOpen = body.indexOf("$transaction(async (tx)")
    expect(txOpen, "updateJournal harus membuka $transaction callback").toBeGreaterThan(-1)
    const attach = body.indexOf("attachJournalAttachments(tx")
    expect(
      attach,
      "attachJournalAttachments(tx, ...) tidak ditemukan di updateJournal — " +
        "klaim lampiran harus memakai tx jurnal, bukan transaksi terpisah",
    ).toBeGreaterThan(txOpen)
    expect(body).not.toContain("attachJournalAttachments(formData")
  })

  it("helper attachJournalAttachments tidak membuka transaksi sendiri", () => {
    const src = read(FINANCE)
    const start = src.indexOf("async function attachJournalAttachments")
    expect(start).toBeGreaterThan(-1)
    const body = src.slice(start, src.indexOf("\n}\n", start))
    expect(
      body.includes("$transaction"),
      "helper membuka prisma.$transaction sendiri — klaim lampiran lepas dari tx jurnal",
    ).toBe(false)
    expect(body).toContain("attachPendingTransactionAttachments(tx")
  })

  it("tidak ada klaim lampiran lewat transaksi terpisah di seluruh repo (ISF-01 sekelas)", () => {
    // Pola terlarang: prisma.$transaction((tx) => attachPending...) — klaim
    // berjalan sesudah mutasi dokumen commit. Semua pemanggil wajib memakai
    // tx mutasinya sendiri.
    for (const file of ["src/actions/finance.actions.ts", "src/actions/sales.actions.ts", "src/actions/purchase.actions.ts"]) {
      expect(
        read(file).includes("$transaction((tx) => attachPendingTransactionAttachments"),
        `${file} masih mengklaim lampiran lewat transaksi terpisah`,
      ).toBe(false)
    }
  })

  it("updateExpense mengklaim lampiran di dalam $transaction yang sama", () => {
    const body = functionBody(read(FINANCE), "updateExpense")
    const txOpen = body.indexOf("$transaction(async (tx)")
    expect(txOpen, "updateExpense harus membuka $transaction callback").toBeGreaterThan(-1)
    const attach = body.indexOf("attachPendingTransactionAttachments(tx")
    expect(
      attach,
      "klaim lampiran updateExpense harus memakai tx mutasi yang sama",
    ).toBeGreaterThan(txOpen)
  })

  it("updatePettyCash mengklaim lampiran di dalam $transaction yang sama", () => {
    const body = functionBody(read(FINANCE), "updatePettyCash")
    const txOpen = body.indexOf("$transaction(async (tx)")
    expect(txOpen, "updatePettyCash harus membuka $transaction callback").toBeGreaterThan(-1)
    const attach = body.indexOf("attachPendingTransactionAttachments(tx")
    expect(
      attach,
      "klaim lampiran updatePettyCash harus memakai tx mutasi yang sama",
    ).toBeGreaterThan(txOpen)
  })
})
