import fs from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

/**
 * Harness source-assertion buku-bank/buku-besar (item S3-A #5, ditulis SEBELUM
 * refactor sebagai pengaman): `ledgerRows` di ledger-cash-data.ts bersama oleh
 * `loadBankLedger` dan `loadGeneralLedger`. Bentuk lama berbahaya secara perf:
 *   1. saldo awal lewat `sumEntriesByAccount({ date })` TANPA accountIds —
 *      groupBy SELURUH akun lalu satu entri Map diambil, membuang sisanya
 *      (komentar header report-aggregation.service melarang pola ini);
 *   2. saldo awal dan mutasi periode dijalankan sekuensial padahal independen;
 *   3. entries memakai `include` jurnal sehingga kolom penuh baris ditarik,
 *      padahal pemanggil hanya membaca memo/debit/credit + jurnal tertaut.
 * Ekuivalensi semantik refactor (sumNetForAccount + select sempit + Promise.all)
 * dibuktikan unit test perilaku manual di DB asli; file ini memaku BENTUKNYA
 * supaya regresi sunyi (kembali ke pola mahal itu) tertangkap tanpa DB.
 */
const FILE = path.resolve(__dirname, "../ledger-cash-data.ts")

function bodyOf(fnName: string, src: string): string {
  const start = src.indexOf(`function ${fnName}`)
  expect(start, `fungsi ${fnName} harus ada`).toBeGreaterThan(-1)
  const from = src.slice(start)
  const end = from.search(/\n\}\n/)
  expect(end, `akhir ${fnName} harus ketemu`).toBeGreaterThan(-1)
  return from.slice(0, end)
}

describe("ledger-cash-data: harness perf ledgerRows", () => {
  const src = fs.readFileSync(FILE, "utf8")
  const body = bodyOf("ledgerRows", src)

  it("saldo awal scoped satu akun (sumNetForAccount accountId), bukan agregasi semua akun", () => {
    expect(body).toContain("sumNetForAccount(accountId")
    expect(body).not.toContain("sumEntriesByAccount({ date")
  })

  it("saldo awal dan mutasi periode paralel (Promise.all), bukan dua await sekuensial", () => {
    expect(body).toContain("Promise.all")
    expect(body.indexOf("Promise.all")).toBeLessThan(body.indexOf("journalEntry.findMany"))
  })

  it("entries memakai select sempit memo/debit/credit + jurnal, bukan include kolom penuh", () => {
    expect(body).toContain("select:")
    expect(body).toContain("memo: true")
    expect(body).not.toContain("include:")
  })

  it("filter entries identik semantik: POSTED+REVERSED, deletedAt null, rentang periode inklusif", () => {
    expect(body).toContain("REPORT_JOURNAL_STATUSES")
    expect(body).toContain("deletedAt: null")
    expect(body).toContain("gte: period.start")
    expect(body).toContain("lte: period.end")
  })

  it("saldo awal tetap dinormalkan sen lewat safeSubtract sebelum buildLedgerRows", () => {
    expect(body).toContain("safeSubtract(openingRaw, 0, 2)")
    expect(body.indexOf("safeSubtract(openingRaw, 0, 2)")).toBeLessThan(body.indexOf("buildLedgerRows"))
  })

  it("kedua pintu publik berbagi ledgerRows (satu sumber layar & PDF)", () => {
    const bank = bodyOf("loadBankLedger", src)
    const gl = bodyOf("loadGeneralLedger", src)
    expect(bank).toContain("ledgerRows(")
    expect(gl).toContain("ledgerRows(")
  })
})
